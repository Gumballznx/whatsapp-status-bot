const cron = require('node-cron');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { fetchGoogleContacts } = require('./googleContacts');
const { postMediaFileStatus } = require('./statusPoster');
const { hasScheduledRunPassedToday } = require('./cronMatcher');

const LAST_POST_FILE = path.join(__dirname, '../../last_post.json');
let activeCronJob = null;
let inFlightPost = null;

function calculateCurrentDay() {
    const start = moment.tz(env.START_DATE, env.TIMEZONE).startOf('day');
    const today = moment.tz(env.TIMEZONE).startOf('day');
    return today.diff(start, 'days') + 1;
}

function hasPostedToday() {
    try {
        if (!fs.existsSync(LAST_POST_FILE)) return false;
        const data = JSON.parse(fs.readFileSync(LAST_POST_FILE, 'utf8'));
        const todayStr = moment.tz(env.TIMEZONE).format('YYYY-MM-DD');
        return data.lastPostedDate === todayStr;
    } catch {
        return false;
    }
}

/**
 * Indica se o horário agendado (STATUS_CRON) de hoje já passou.
 * Usado para que a recuperação ao reconectar não poste antes da hora.
 */
function isScheduledTimePassedToday() {
    try {
        return hasScheduledRunPassedToday(env.STATUS_CRON, moment.tz(env.TIMEZONE));
    } catch (e) {
        console.warn(`[Scheduler] Não foi possível interpretar STATUS_CRON para a recuperação (${e.message}). Recuperação desativada.`);
        return false;
    }
}

function recordTodayPost(dayNumber) {
    try {
        const todayStr = moment.tz(env.TIMEZONE).format('YYYY-MM-DD');
        fs.writeFileSync(
            LAST_POST_FILE,
            JSON.stringify({ lastPostedDate: todayStr, dayNumber, timestamp: new Date().toISOString() }, null, 2)
        );
    } catch (e) {
        console.error('[Post Tracker] Erro ao gravar registro de postagem:', e.message);
    }
}

async function runDailyStatus(getSocket, isTest, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Outra execução pode ter concluído a postagem enquanto aguardávamos
        if (!isTest && hasPostedToday()) {
            console.log('[Scheduler] Status de hoje já foi postado. Nada a fazer.');
            return;
        }

        const sock = typeof getSocket === 'function' ? getSocket() : getSocket;

        if (!sock?.user) {
            console.error(`[Scheduler] [Tentativa ${attempt}/${maxRetries}] Socket do WhatsApp não está conectado.`);
            if (attempt < maxRetries) {
                console.log('[Scheduler] Aguardando 10 segundos para o socket reconectar...');
                await new Promise((r) => setTimeout(r, 10000));
                continue;
            }
            return;
        }

        try {
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const recipients = await fetchGoogleContacts([botJid]);

            if (recipients.length === 0) {
                console.warn('[Scheduler] Nenhum destinatário válido disponível para envio.');
                return;
            }

            const dayNumber = calculateCurrentDay();
            const caption = isTest ? `DAY ${dayNumber} (TESTE)` : `DAY ${dayNumber}`;

            console.log(`[Scheduler] [Tentativa ${attempt}/${maxRetries}] Disparando status: "${caption}" para ${recipients.length} destinatário(s)...`);
            await postMediaFileStatus(sock, env.MEDIA_PATH, caption, recipients);
            console.log('[Scheduler] Status diário postado com sucesso no WhatsApp!');

            if (!isTest) {
                recordTodayPost(dayNumber);
            }
            return;
        } catch (error) {
            console.error(`[Scheduler] Falha na tentativa ${attempt}/${maxRetries}:`, error.message || error);
            if (attempt < maxRetries) {
                console.log('[Scheduler] Aguardando 10 segundos antes de tentar novamente...');
                await new Promise((r) => setTimeout(r, 10000));
            }
        }
    }
}

/**
 * Dispara a postagem do status. Chamadas simultâneas (cron + recuperação ao reconectar)
 * reaproveitam a mesma execução em andamento, evitando postagens duplicadas.
 */
function triggerDailyStatus(getSocket, isTest = false, maxRetries = 3) {
    if (inFlightPost) {
        console.log('[Scheduler] Já existe uma postagem em andamento. Aguardando a mesma execução.');
        return inFlightPost;
    }

    inFlightPost = runDailyStatus(getSocket, isTest, maxRetries)
        .catch((error) => {
            console.error('[Scheduler] Erro inesperado ao postar status:', error.message || error);
        })
        .finally(() => {
            inFlightPost = null;
        });

    return inFlightPost;
}

function startScheduler(getSocket) {
    if (activeCronJob) {
        activeCronJob.stop();
    }

    console.log(`[Scheduler] Agendamento ativo: "${env.STATUS_CRON}" (Fuso: ${env.TIMEZONE})`);

    activeCronJob = cron.schedule(
        env.STATUS_CRON,
        async () => {
            await triggerDailyStatus(getSocket, false);
        },
        {
            scheduled: true,
            timezone: env.TIMEZONE
        }
    );

    return activeCronJob;
}

module.exports = {
    startScheduler,
    triggerDailyStatus,
    calculateCurrentDay,
    hasPostedToday,
    isScheduledTimePassedToday
};
