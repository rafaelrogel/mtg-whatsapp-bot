const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const logger = require('./logger');
const { AUTH_DIR, ALLOW_GROUPS, ALLOW_DM } = require('./config');
const { buscarCarta, handleCommand, checkRateLimit } = require('./commands');
const { verificarStatusAPI, limparDiretorioTemp } = require('./scryfall');
const web = require('./web');

let sock = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger,
        browser: ['MTG WhatsApp Bot', 'Chrome', '1.0.0'],
        getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                await web.generateQRBase64(qr);
                logger.info('QR Code gerado! Escaneie na web ou terminal');
                qrcodeTerminal.generate(qr, { small: true });
            } catch (erro) {
                logger.error({ err: erro.message }, 'Erro ao gerar QR Code');
            }
        }

        if (connection === 'close') {
            web.setStatus(false);
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            logger.info(`Conexão fechada, statusCode: ${statusCode}, reconectar: ${shouldReconnect}`);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            web.setStatus(true);
            web.clearQR();
            logger.info('Conectado ao WhatsApp com sucesso!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (!msg.key.fromMe && m.type === 'notify') {
                const jid = msg.key.remoteJid;
                const isGroup = jid.endsWith('@g.us');
                const isDM = !isGroup;

                if (isDM && !ALLOW_DM) continue;
                if (isGroup && !ALLOW_GROUPS) continue;

                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                if (!messageText.trim().startsWith('!')) continue;

                const comando = messageText.trim().split(' ')[0].toLowerCase();
                const argumentos = messageText.trim().slice(comando.length).trim();

                try {
                    if (comando === '!carta' && argumentos) {
                        await buscarCarta(sock, jid, argumentos);
                        continue;
                    }

                    if (comando === '!status') {
                        const apiOnline = await verificarStatusAPI();
                        await sock.sendMessage(jid, { text: apiOnline ? '✅ API do Scryfall está online e funcionando!' : '❌ API do Scryfall está indisponível no momento.' });
                        continue;
                    }

                    const response = handleCommand(sock, jid, comando, argumentos);
                    if (response) {
                        await sock.sendMessage(jid, { text: response });
                    }
                } catch (erro) {
                    logger.error({ err: erro.message }, 'Erro ao processar comando');
                    await sock.sendMessage(jid, { text: '❌ Ocorreu um erro ao processar sua mensagem. Tente novamente.' });
                }
            }
        }
    });

    return sock;
}

function getSock() { return sock; }

module.exports = { connectToWhatsApp, getSock, limparDiretorioTemp };