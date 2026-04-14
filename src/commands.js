const path = require('path');
const { DICIONARIO_PT_EN, RATE_LIMIT_MS } = require('./config');
const {
    verificarStatusAPI, buscarCartaEspecifica, buscarCartaFuzzy,
    buscarCartaScryfall, validarQueryBusca, garantirDiretorioTemp,
    limparArquivoTemp, baixarESalvarImagem
} = require('./scryfall');
const { enviarImagem, enviarImagemConsolidada, formatarLegenda } = require('./images');
const logger = require('./logger');

const userCooldowns = new Map();

function checkRateLimit(jid) {
    const now = Date.now();
    const lastTime = userCooldowns.get(jid);
    if (lastTime && now - lastTime < RATE_LIMIT_MS) {
        return false;
    }
    userCooldowns.set(jid, now);
    return true;
}

function cleanupCooldowns() {
    const now = Date.now();
    for (const [jid, time] of userCooldowns) {
        if (now - time > RATE_LIMIT_MS * 2) {
            userCooldowns.delete(jid);
        }
    }
}

setInterval(cleanupCooldowns, 60000);

async function processarResultadoBusca(sock, jid, cards, searchQuery, lang) {
    if (!cards || !cards.data || cards.data.length === 0) return false;

    let mensagemLinks = `Encontrei ${cards.data.length} cartas${lang === 'en' ? ' em inglês' : lang === 'pt' ? ' em português' : ''}. Aqui estão as primeiras 3:\n\n`;

    const imagensUrls = [];
    for (let i = 0; i < Math.min(3, cards.data.length); i++) {
        const card = cards.data[i];
        mensagemLinks += `${i + 1}. *${card.name}*${lang === 'en' ? ' (em inglês)' : ''}\n`;
        if (card.image_uris && card.image_uris.normal) {
            imagensUrls.push(card.image_uris.normal);
        }
    }

    if (imagensUrls.length > 0) {
        await enviarImagemConsolidada(sock, jid, imagensUrls, '');
    }

    mensagemLinks += `\nPara ver todas as ${cards.data.length} cartas encontradas, acesse:\n`;
    mensagemLinks += `https://scryfall.com/search?q=${encodeURIComponent(searchQuery)}&unique=cards`;

    try {
        await sock.sendMessage(jid, { text: mensagemLinks });
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro ao enviar mensagem de links');
    }
    return true;
}

async function buscarCarta(sock, jid, searchQuery) {
    try {
        if (!checkRateLimit(jid)) {
            await sock.sendMessage(jid, { text: '⏳ Aguarde alguns segundos antes de fazer outra busca.' });
            return;
        }

        const queryValidada = validarQueryBusca(searchQuery);

        const apiOnline = await verificarStatusAPI();
        if (!apiOnline) {
            await sock.sendMessage(jid, { text: '⚠️ A API do Scryfall está temporariamente indisponível. Tente novamente em alguns minutos.' });
            return;
        }

        const queryLower = queryValidada.toLowerCase().trim();

        if (DICIONARIO_PT_EN[queryLower]) {
            const nomeEN = DICIONARIO_PT_EN[queryLower];
            logger.info(`Dicionário: "${queryLower}" → "${nomeEN}"`);
            await sock.sendMessage(jid, { text: `🔍 Buscando "${queryValidada}" → ${nomeEN}...` });
            const card = await buscarCartaEspecifica(nomeEN);
            if (card && card.image_uris && card.image_uris.normal) {
                const tempDir = await garantirDiretorioTemp();
                const tempFilePath = path.join(tempDir, `${nomeEN.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`);
                if (await baixarESalvarImagem(card.image_uris.normal, tempFilePath)) {
                    try {
                        await enviarImagem(sock, jid, tempFilePath, formatarLegenda(card));
                    } finally {
                        await limparArquivoTemp(tempFilePath);
                    }
                    return;
                }
            }
        }

        const cartaFuzzy = await buscarCartaFuzzy(queryValidada);
        if (cartaFuzzy && cartaFuzzy.name) {
            const imageUrl = cartaFuzzy.image_uris?.normal || cartaFuzzy.card_faces?.[0]?.image_uris?.normal;
            if (imageUrl) {
                const tempDir = await garantirDiretorioTemp();
                const tempFilePath = path.join(tempDir, `${cartaFuzzy.name.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`);
                if (await baixarESalvarImagem(imageUrl, tempFilePath)) {
                    try {
                        const nomePT = cartaFuzzy.printed_name;
                        const legendaExtra = nomePT && nomePT !== cartaFuzzy.name ? ` (${nomePT})` : '';
                        await sock.sendMessage(jid, { text: `🔍 Encontrei: *${cartaFuzzy.name}*${legendaExtra}` });
                        await enviarImagem(sock, jid, tempFilePath, formatarLegenda(cartaFuzzy));
                    } finally {
                        await limparArquivoTemp(tempFilePath);
                    }
                    return;
                }
            } else {
                await sock.sendMessage(jid, { text: `🔍 Encontrei: *${cartaFuzzy.name}*, mas não tenho imagem disponível.` });
                return;
            }
        }

        const queryScryfall = `"${queryValidada}"`;

        const resultadoPT = await buscarCartaScryfall(queryScryfall, 'pt');
        if (await processarResultadoBusca(sock, jid, resultadoPT, queryValidada, 'pt')) return;

        const resultadoEN = await buscarCartaScryfall(queryScryfall, 'en');
        if (await processarResultadoBusca(sock, jid, resultadoEN, queryValidada, 'en')) return;

        const resultadoGeral = await buscarCartaScryfall(queryScryfall, null);
        if (await processarResultadoBusca(sock, jid, resultadoGeral, queryValidada, null)) return;

        await sock.sendMessage(jid, { text: '❌ Desculpe, não encontrei nenhuma carta com esse nome. Tente usar o nome em inglês ou um nome mais específico.' });
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro na função buscarCarta');
        await sock.sendMessage(jid, { text: '❌ Desculpe, ocorreu um erro ao buscar a carta. Tente novamente mais tarde.' });
    }
}

function handleCommand(sock, jid, comando, argumentos) {
    switch (comando) {
        case '!ajuda':
        case '!help':
            return `Olá! Sou um bot para buscar cartas de Magic: The Gathering! 🎴\n\n` +
                `Comandos disponíveis:\n` +
                `!carta [nome] - Busca uma carta (em português ou inglês)\n` +
                `!ajuda ou !help - Mostra esta mensagem de ajuda\n` +
                `!welcome - Mostra a mensagem de apresentação do bot\n` +
                `!ping - Responde com pong\n` +
                `!oi - Responde com uma saudação\n` +
                `!status - Verifica o status da API\n\n` +
                `Dica: Você pode buscar pelo nome em português (ex: !carta raio) ou inglês (ex: !carta Lightning Bolt).`;
        case '!ping':
            return 'pong';
        case '!oi':
            return 'Olá! Eu sou o ManaMate, seu assistente para buscar cartas de Magic: The Gathering! 🎴\n\nComandos disponíveis:\n!carta [nome] - Busca uma carta (em português ou inglês)\n!ajuda ou !help - Mostra ajuda detalhada\n!welcome - Mostra a apresentação do bot\n!ping - Responde com pong\n!oi - Mostra esta mensagem\n!status - Verifica o status da API\n\nComo posso ajudar?';
        case '!carta':
            return argumentos ? null : '❌ Por favor, especifique o nome da carta após o comando !carta';
        default:
            return '❌ Comando não reconhecido. Use !ajuda para ver os comandos disponíveis.';
    }
}

module.exports = {
    buscarCarta,
    processarResultadoBusca,
    handleCommand,
    checkRateLimit,
};