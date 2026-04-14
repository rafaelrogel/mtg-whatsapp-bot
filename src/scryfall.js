const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { SCRYFALL_DELAY, SCRYFALL_BASE_URL, API_CACHE_TTL } = require('./config');
const logger = require('./logger');

const delay = ms => new Promise(r => setTimeout(r, ms));

const scryfallApi = axios.create({
    baseURL: SCRYFALL_BASE_URL,
    headers: {
        'User-Agent': 'MTGWhatsAppBot/1.0',
        'Accept': 'application/json'
    },
    timeout: 10000,
    validateStatus: (status) => status >= 200 && status < 500
});

let apiStatusCache = { status: null, timestamp: 0 };

async function verificarStatusAPI() {
    const now = Date.now();
    if (apiStatusCache.status !== null && now - apiStatusCache.timestamp < API_CACHE_TTL) {
        return apiStatusCache.status;
    }
    try {
        const response = await scryfallApi.get('/cards/named?fuzzy=island', { timeout: 5000 });
        apiStatusCache = { status: response.status === 200, timestamp: now };
        return apiStatusCache.status;
    } catch (erro) {
        if (erro.response && erro.response.status === 404) {
            apiStatusCache = { status: true, timestamp: now };
            return true;
        }
        logger.error({ err: erro.message }, 'Erro ao verificar status da API');
        apiStatusCache = { status: false, timestamp: now };
        return false;
    }
}

async function buscarCartaEspecifica(nome) {
    try {
        await delay(SCRYFALL_DELAY);
        const response = await scryfallApi.get(`/cards/named?exact=${encodeURIComponent(nome)}`);
        return response.data;
    } catch (erro) {
        if (erro.response && erro.response.status === 404) return null;
        logger.error({ err: erro.message }, `Erro ao buscar carta específica: ${nome}`);
        return null;
    }
}

async function buscarCartaFuzzy(nome) {
    try {
        await delay(SCRYFALL_DELAY);
        const response = await scryfallApi.get(`/cards/named?fuzzy=${encodeURIComponent(nome)}`);
        return response.data;
    } catch {
        return null;
    }
}

async function buscarCartaScryfall(query, lang = null) {
    try {
        await delay(SCRYFALL_DELAY);
        let searchQuery = query;
        if (lang) {
            searchQuery += `+lang:${lang}+game:paper`;
        }
        const response = await scryfallApi.get(`/cards/search?q=${encodeURIComponent(searchQuery)}&unique=cards`);
        return response.data;
    } catch (erro) {
        if (erro.response && erro.response.status === 404) return null;
        logger.error({ err: erro.message }, `Erro ao buscar carta (${lang || 'qualquer'}): ${query}`);
        return null;
    }
}

async function garantirDiretorioTemp() {
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
        await fs.promises.mkdir(tempDir);
    }
    return tempDir;
}

async function limparArquivoTemp(caminho) {
    try {
        if (fs.existsSync(caminho)) {
            await fs.promises.unlink(caminho);
        }
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro ao limpar arquivo temporário');
    }
}

async function baixarESalvarImagem(url, caminho) {
    try {
        const imageResponse = await axios({ url, responseType: 'arraybuffer', maxRedirects: 5 });
        await fs.promises.writeFile(caminho, imageResponse.data);
        return true;
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro ao baixar imagem');
        return false;
    }
}

async function consolidarImagens(imagens) {
    try {
        const tempDir = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const imagensBaixadas = await Promise.all(imagens.map(async (url, index) => {
            const tempFilePath = path.join(tempDir, `temp_${index}.jpg`);
            const imageResponse = await axios({ url, responseType: 'arraybuffer', maxRedirects: 5 });
            fs.writeFileSync(tempFilePath, imageResponse.data);
            return tempFilePath;
        }));

        const outputPath = path.join(tempDir, 'consolidada.jpg');
        await sharp({
            create: {
                width: 750 * imagens.length,
                height: 1045,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
        .composite(imagensBaixadas.map((file, index) => ({
            input: file, top: 0, left: 750 * index
        })))
        .toFile(outputPath);

        imagensBaixadas.forEach(file => fs.unlinkSync(file));
        return outputPath;
    } catch (error) {
        logger.error({ err: error.message }, 'Erro ao consolidar imagens');
        return null;
    }
}

async function limparDiretorioTemp() {
    const tempDir = path.join(__dirname, '..', 'temp');
    try {
        if (fs.existsSync(tempDir)) {
            const files = await fs.promises.readdir(tempDir);
            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.promises.stat(filePath);
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.promises.unlink(filePath);
                }
            }
        }
    } catch (erro) {
        logger.error({ err: erro.message }, 'Erro ao limpar diretório temporário');
    }
}

function validarQueryBusca(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Query de busca inválida');
    }
    return query.replace(/[<>{}]/g, '');
}

module.exports = {
    scryfallApi,
    delay,
    verificarStatusAPI,
    buscarCartaEspecifica,
    buscarCartaFuzzy,
    buscarCartaScryfall,
    garantirDiretorioTemp,
    limparArquivoTemp,
    baixarESalvarImagem,
    consolidarImagens,
    limparDiretorioTemp,
    validarQueryBusca,
};