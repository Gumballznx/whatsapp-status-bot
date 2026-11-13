/**
 * qr_connect.js — Utilitário de primeira ligação via QR Code
 *
 * Execute este script UMA VEZ para escanear o QR Code e salvar a sessão em ./session.
 * Depois, inicie o bot principal com `npm start`.
 *
 * Usa o mesmo pacote `baileys` do index.js, garantindo que a sessão seja compatível.
 * (Para parear por código de telefone em vez de QR, use `npm run pair`.)
 *
 * Uso: node qr_connect.js
 */

const baileys = require('baileys');
const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
const { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SESSION_PATH = path.join(__dirname, 'session');
const QR_PATH = path.join(__dirname, 'qrcode.png');

let isConnected = false;

async function start() {
    console.log('=============================================');
    console.log('   UTILITÁRIO DE CONEXÃO — BOT STATUS       ');
    console.log('=============================================');
    console.log('Preparando sessão...\n');

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
    } catch (e) {
        version = [2, 3000, 1044006379];
    }
    console.log(`[BAILEYS] Usando versão: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Escaneie o QR Code abaixo (WhatsApp > Aparelhos conectados > Conectar um aparelho):');
            qrcodeTerminal.generate(qr, { small: true });
            try {
                await QRCode.toFile(QR_PATH, qr, { width: 400 });
                console.log(`✅ QR Code também salvo em: ${QR_PATH}`);
                if (process.platform === 'win32') {
                    exec(`start "" "${QR_PATH}"`);
                }
            } catch (err) {
                console.error('Erro ao gerar imagem do QR Code:', err.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (isConnected) return;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Sessão expirada/desconectada no dispositivo. Limpando credenciais...');
                fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                console.log('🔄 Execute o script novamente para ler um novo QR Code.');
                process.exit(1);
            }

            // Após escanear o QR o WhatsApp pede um reinício da conexão (restartRequired)
            console.log(`⚠️ Conexão encerrada (código: ${statusCode}). Reconectando...`);
            setTimeout(() => start().catch(fatal), 2000);
        } else if (connection === 'open') {
            isConnected = true;
            console.log('\n✅✅✅ WHATSAPP CONECTADO COM SUCESSO! ✅✅✅');
            console.log(`   JID: ${sock.user?.id}`);

            if (fs.existsSync(QR_PATH)) {
                fs.unlinkSync(QR_PATH);
            }

            setTimeout(() => {
                console.log('✅ Sessão salva em ./session. Agora inicie o bot com: npm start');
                process.exit(0);
            }, 3000);
        }
    });
}

function fatal(err) {
    console.error('Erro fatal:', err);
    process.exit(1);
}

start().catch(fatal);
