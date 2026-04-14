const fs = require('fs');
const { consolidarImagens, limparArquivoTemp } = require('./scryfall');
const logger = require('./logger');

async function enviarImagem(sock, jid, caminhoArquivo, legenda) {
    try {
        const imageBuffer = fs.readFileSync(caminhoArquivo);
        await sock.sendMessage(jid, { image: imageBuffer, caption: legenda || '' });
        return true;
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro ao enviar imagem');
        return false;
    }
}

async function enviarImagemConsolidada(sock, jid, imagensUrls, legenda) {
    const imagemConsolidada = await consolidarImagens(imagensUrls);
    if (imagemConsolidada) {
        const result = await enviarImagem(sock, jid, imagemConsolidada, legenda);
        await limparArquivoTemp(imagemConsolidada);
        return result;
    }
    return false;
}

function formatarLegenda(card) {
    return `🎴 *${card.name}*\n${card.type_line || ''}\n${card.mana_cost || ''}`;
}

module.exports = {
    enviarImagem,
    enviarImagemConsolidada,
    formatarLegenda,
};