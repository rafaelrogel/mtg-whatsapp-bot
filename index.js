require('dotenv').config();
const web = require('./src/web');
const { connectToWhatsApp } = require('./src/whatsapp');
const { limparDiretorioTemp } = require('./src/scryfall');
const logger = require('./src/logger');

process.on('uncaughtException', (error) => {
    logger.error({ err: error.message }, 'Erro não capturado');
});

process.on('unhandledRejection', (error) => {
    logger.error({ err: error }, 'Promessa rejeitada não tratada');
});

const app = web.createServer();
const server = web.startServer(app);

setInterval(limparDiretorioTemp, 3600000);

connectToWhatsApp().catch(err => {
    logger.error({ err: err.message }, 'Erro ao conectar ao WhatsApp');
    process.exit(1);
});

logger.info('Bot MTG (ManaMate) iniciando com Baileys...');