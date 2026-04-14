const express = require('express');
const QRCode = require('qrcode');
const logger = require('./logger');
const { PORT } = require('./config');

let qrCodeBase64 = null;
let isConnected = false;

function setStatus(connected) { isConnected = connected; }
function getQRBase64() { return qrCodeBase64; }
function clearQR() { qrCodeBase64 = null; }

async function generateQRBase64(qr) {
    qrCodeBase64 = await QRCode.toDataURL(qr, {
        color: { dark: '#000000', light: '#ffffff' },
        width: 400,
        margin: 1
    });
    return qrCodeBase64;
}

function createServer() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use((err, _req, res, _next) => {
        logger.error({ err: err.message }, 'Erro no servidor');
        res.status(500).send('Erro interno do servidor');
    });

    app.get('/qr', async (req, res) => {
        try {
            if (!qrCodeBase64) {
                return res.status(404).send(`
                    <html><head><title>QR Code não disponível</title><meta http-equiv="refresh" content="5">
                    <style>body{font-family:Arial,sans-serif;text-align:center;padding:20px;background-color:#f0f2f5}.message{background:#fff;padding:20px;border-radius:10px;margin:20px auto;max-width:500px;box-shadow:0 2px 4px rgba(0,0,0,.1)}.loading{width:40px;height:40px;margin:20px auto;border:4px solid #f3f3f3;border-top:4px solid #25D366;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}</style></head>
                    <body><div class="message"><h2>QR Code não disponível</h2><div class="loading"></div><p>Aguardando a geração do QR Code...</p><p>Esta página será atualizada automaticamente em 5 segundos.</p></div></body></html>`);
            }
            res.send(`<html><head><title>QR Code WhatsApp</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:20px;background-color:#f0f2f5}.container{background:#fff;padding:20px;border-radius:10px;margin:20px auto;max-width:500px;box-shadow:0 2px 4px rgba(0,0,0,.1)}.qr-code{margin:20px auto;padding:10px;background:#fff;border-radius:5px}.instructions{margin-top:20px;color:#666}</style></head>
            <body><div class="container"><h2>Escaneie o QR Code</h2><div class="qr-code"><img src="${qrCodeBase64}" alt="QR Code WhatsApp"></div><div class="instructions"><p>1. Abra o WhatsApp no seu celular</p><p>2. Toque em Menu ou Configurações e selecione WhatsApp Web</p><p>3. Aponte seu celular para esta tela para escanear o QR Code</p></div></div></body></html>`);
        } catch (erro) {
            logger.error({ err: erro.message }, 'Erro ao servir QR Code');
            res.status(500).send('Erro ao gerar QR Code');
        }
    });

    app.get('/', (req, res) => {
        res.send(`<html><head><title>MTG WhatsApp Bot</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:20px}.container{max-width:600px;margin:0 auto;padding:20px}.qr-link{display:inline-block;background:#25D366;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;margin-top:20px}.status{margin-top:20px;padding:10px;border-radius:5px;background:${isConnected ? '#d4edda' : '#f8d7da'};color:${isConnected ? '#155724' : '#721c24'}}</style></head>
        <body><div class="container"><h1>MTG WhatsApp Bot</h1><div class="status">${isConnected ? '✅ Conectado ao WhatsApp' : '❌ Desconectado'}</div><a href="/qr" class="qr-link">Ver QR Code</a></div></body></html>`);
    });

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime(), whatsapp: isConnected ? 'connected' : 'disconnected' });
    });

    return app;
}

function startServer(app) {
    return app.listen(PORT, '0.0.0.0', () => {
        logger.info(`Servidor web rodando na porta ${PORT}`);
        logger.info(`QR Code disponível em: http://localhost:${PORT}/qr`);
    }).on('error', (error) => {
        logger.error({ err: error.message }, 'Erro ao iniciar o servidor');
        process.exit(1);
    });
}

module.exports = { createServer, startServer, setStatus, getQRBase64, clearQR, generateQRBase64, isConnected: () => isConnected };