const baileys = require('baileys');
const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
const {
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} = baileys;
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const env = require('./src/config/env');
const {
    startScheduler,
    triggerDailyStatus,
    hasPostedToday,
    isScheduledTimePassedToday
} = require('./src/services/scheduler');

const QR_FILE = path.join(__dirname, 'qrcode.png');
const BASE_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

let activeSocket = null;
let schedulerStarted = false;
let reconnectAttempts = 0;
let catchUpTimer = null;
let presenceInterval = null;

function hasValidSession() {
    try {
        const credsPath = path.join(env.SESSION_PATH, 'creds.json');
        if (!fs.existsSync(credsPath)) return false;
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        return !!(creds.me && creds.me.id);
    } catch {
        return false;
    }
}

function scheduleReconnect(delayMs) {
    console.log(`[Conexão] Reconectando em ${Math.round(delayMs / 1000)} segundo(s)...`);
    setTimeout(() => {
        startWhatsAppBot().catch((err) => {
            console.error('[Conexão] Erro ao iniciar o socket:', err.message || err);
            reconnectAttempts++;
            scheduleReconnect(nextReconnectDelay());
        });
    }, delayMs);
}

/**
 * Modo "sempre online": envia presença "available" periodicamente para a conta
 * aparecer online o tempo todo. Efeito colateral: enquanto o WhatsApp vê a conta
 * online em outro aparelho, o celular pode não tocar notificações.
 */
function startPresenceKeepAlive(sock) {
    stopPresenceKeepAlive();
    if (!env.ALWAYS_ONLINE) return;

    sock.sendPresenceUpdate('available').catch(() => {});
    presenceInterval = setInterval(() => {
        if (activeSocket?.user) {
            activeSocket.sendPresenceUpdate('available').catch(() => {});
        }
    }, 25000);
    presenceInterval.unref?.();
}

function stopPresenceKeepAlive() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }
}

function nextReconnectDelay() {
    const delay = BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, reconnectAttempts - 1);
    return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}

/**
 * Se o horário agendado de hoje já passou e o status ainda não foi postado
 * (ex: o bot estava offline no horário), posta agora. Antes do horário, não faz nada:
 * o cron se encarrega da postagem.
 */
function scheduleCatchUpPost() {
    if (catchUpTimer) clearTimeout(catchUpTimer);

    catchUpTimer = setTimeout(async () => {
        catchUpTimer = null;
        if (!activeSocket?.user || hasPostedToday() || !isScheduledTimePassedToday()) return;

        console.log('[Scheduler] Horário agendado já passou e não há postagem registrada para hoje. Disparando status pendente...');
        await triggerDailyStatus(() => activeSocket, false);
    }, 5000);
}

async function startWhatsAppBot() {
    if (!fs.existsSync(env.SESSION_PATH)) {
        fs.mkdirSync(env.SESSION_PATH, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(env.SESSION_PATH);

    let version;
    try {
        const fetched = await fetchLatestBaileysVersion();
        version = fetched.version;
    } catch (e) {
        version = [2, 3000, 1044006379];
    }

    console.log(`[Baileys] Versão: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        // ALWAYS_ONLINE=false deixa o celular receber notificações normalmente
        markOnlineOnConnect: env.ALWAYS_ONLINE,
        keepAliveIntervalMs: 25000,
        defaultQueryTimeoutMs: 180000,
        connectTimeoutMs: 60000
    });

    // O código de pareamento é pedido uma única vez por socket. O evento "qr" se repete
    // a cada ~20s e pedir um novo código invalidaria o anterior.
    let pairingRequested = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !hasValidSession()) {
            if (env.BOT_NUMBER) {
                if (!pairingRequested) {
                    pairingRequested = true;
                    try {
                        let code = await sock.requestPairingCode(env.BOT_NUMBER);
                        code = code?.match(/.{1,4}/g)?.join('-') || code;
                        console.log('\n========================================');
                        console.log(`📱 NÚMERO DO BOT: +${env.BOT_NUMBER}`);
                        console.log(`🔑 CÓDIGO DE PAREAMENTO: ${code}`);
                        console.log('👉 No WhatsApp: Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone');
                        console.log('========================================\n');
                    } catch (err) {
                        pairingRequested = false;
                        console.error('[Pairing] Erro ao gerar código:', err.message);
                    }
                }
            } else {
                console.log('[Auth] Novo QR Code gerado. Escaneie com o WhatsApp:');
                qrcodeTerminal.generate(qr, { small: true });
                try {
                    await QRCode.toFile(QR_FILE, qr, { width: 400 });
                    console.log(`[Auth] QR Code também salvo em: ${QR_FILE}`);
                    if (process.platform === 'win32') {
                        exec(`start "" "${QR_FILE}"`);
                    }
                } catch (err) {
                    console.error('[Auth] Erro ao salvar imagem do QR Code:', err.message);
                }
            }
        }

        if (connection === 'close') {
            stopPresenceKeepAlive();
            if (catchUpTimer) {
                clearTimeout(catchUpTimer);
                catchUpTimer = null;
            }

            try {
                sock.end?.(undefined);
            } catch (e) {}

            if (activeSocket === sock) activeSocket = null;

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.warn(`[Conexão] Conexão encerrada. Código de status: ${statusCode}`);

            if (statusCode === DisconnectReason.loggedOut) {
                console.warn('[Conexão] Sessão finalizada pelo WhatsApp. Removendo dados de sessão...');
                if (fs.existsSync(env.SESSION_PATH)) {
                    fs.rmSync(env.SESSION_PATH, { recursive: true, force: true });
                }
                if (!env.BOT_NUMBER) {
                    console.warn('[Conexão] Defina BOT_NUMBER no .env para parear por código, ou acompanhe os logs para escanear o QR Code.');
                }
                reconnectAttempts = 0;
                scheduleReconnect(2000);
            } else {
                reconnectAttempts++;
                scheduleReconnect(nextReconnectDelay());
            }
        } else if (connection === 'open') {
            console.log('=============================================');
            console.log('✅ WHATSAPP CONECTADO COM SUCESSO!');
            console.log(`📱 JID Conectado: ${sock.user?.id}`);
            console.log('=============================================');

            activeSocket = sock;
            reconnectAttempts = 0;

            if (fs.existsSync(QR_FILE)) {
                fs.unlinkSync(QR_FILE);
            }

            startPresenceKeepAlive(sock);

            if (!schedulerStarted) {
                startScheduler(() => activeSocket);
                schedulerStarted = true;
            }

            scheduleCatchUpPost();
        }
    });
}

startWhatsAppBot().catch((err) => {
    console.error('[Conexão] Erro ao iniciar o bot:', err.message || err);
    reconnectAttempts++;
    scheduleReconnect(nextReconnectDelay());
});
