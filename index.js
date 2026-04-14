const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const express = require('express');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((err, req, res, next) => {
    console.error('Erro no servidor:', err);
    res.status(500).send('Erro interno do servidor');
});

let currentQR = null;
let qrCodeBase64 = null;
let sock = null;
let isConnected = false;

app.get('/qr', async (req, res) => {
    try {
        if (!qrCodeBase64) {
            return res.status(404).send(`
                <html>
                    <head>
                        <title>QR Code não disponível</title>
                        <meta http-equiv="refresh" content="5">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #f0f2f5; }
                            .message { background: white; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 500px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                            .loading { width: 40px; height: 40px; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #25D366; border-radius: 50%; animation: spin 1s linear infinite; }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="message">
                            <h2>QR Code não disponível</h2>
                            <div class="loading"></div>
                            <p>Aguardando a geração do QR Code...</p>
                            <p>Esta página será atualizada automaticamente em 5 segundos.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        res.send(`
            <html>
                <head>
                    <title>QR Code WhatsApp</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #f0f2f5; }
                        .container { background: white; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 500px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                        .qr-code { margin: 20px auto; padding: 10px; background: white; border-radius: 5px; }
                        .instructions { margin-top: 20px; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>Escaneie o QR Code</h2>
                        <div class="qr-code">
                            <img src="${qrCodeBase64}" alt="QR Code WhatsApp">
                        </div>
                        <div class="instructions">
                            <p>1. Abra o WhatsApp no seu celular</p>
                            <p>2. Toque em Menu ou Configurações e selecione WhatsApp Web</p>
                            <p>3. Aponte seu celular para esta tela para escanear o QR Code</p>
                        </div>
                    </div>
                </body>
            </html>
        `);
    } catch (erro) {
        console.error('Erro ao servir QR Code:', erro);
        res.status(500).send('Erro ao gerar QR Code');
    }
});

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>MTG WhatsApp Bot</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .qr-link { display: inline-block; background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                    .status { margin-top: 20px; padding: 10px; border-radius: 5px; background: ${isConnected ? '#d4edda' : '#f8d7da'}; color: ${isConnected ? '#155724' : '#721c24'}; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>MTG WhatsApp Bot</h1>
                    <div class="status">${isConnected ? '✅ Conectado ao WhatsApp' : '❌ Desconectado'}</div>
                    <a href="/qr" class="qr-link">Ver QR Code</a>
                </div>
            </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    try {
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            whatsapp: isConnected ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
    console.log(`QR Code disponível em: http://localhost:${PORT}/qr`);
}).on('error', (error) => {
    console.error('Erro ao iniciar o servidor:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Promessa rejeitada não tratada:', error);
});

const scryfallApi = axios.create({
    baseURL: 'https://api.scryfall.com',
    headers: {
        'User-Agent': 'MTGWhatsAppBot/1.0',
        'Accept': 'application/json'
    },
    timeout: 10000,
    validateStatus: function (status) {
        return status >= 200 && status < 500;
    }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SCRYFALL_DELAY = 600;

async function obterImagemCarta(card, formato = 'normal') {
    try {
        if (card.card_faces && card.card_faces.length > 0) {
            return card.card_faces.map(face => face.image_uris[formato]);
        }
        return [card.image_uris[formato]];
    } catch (error) {
        console.error('Erro ao obter imagem da carta:', error);
        return null;
    }
}

async function consolidarImagens(imagens) {
    try {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const imagensBaixadas = await Promise.all(imagens.map(async (url, index) => {
            const tempFilePath = path.join(tempDir, `temp_${index}.jpg`);
            const imageResponse = await axios({
                url: url,
                responseType: 'arraybuffer',
                maxRedirects: 5
            });
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
            input: file,
            top: 0,
            left: 750 * index
        })))
        .toFile(outputPath);

        imagensBaixadas.forEach(file => fs.unlinkSync(file));

        return outputPath;
    } catch (error) {
        console.error('Erro ao consolidar imagens:', error);
        return null;
    }
}

async function garantirDiretorioTemp() {
    const tempDir = path.join(__dirname, 'temp');
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
        console.error('Erro ao limpar arquivo temporário:', erro);
    }
}

async function baixarESalvarImagem(url, caminho) {
    try {
        const imageResponse = await axios({
            url: url,
            responseType: 'arraybuffer',
            maxRedirects: 5
        });
        await fs.promises.writeFile(caminho, imageResponse.data);
        return true;
    } catch (erro) {
        console.error('Erro ao baixar imagem:', erro);
        return false;
    }
}

async function buscarCartaScryfall(query, lang = null) {
    try {
        await delay(SCRYFALL_DELAY);
        let searchQuery = query;
        if (lang) {
            searchQuery += `+lang:${lang}`;
        }
        const response = await scryfallApi.get(`/cards/search?q=${encodeURIComponent(searchQuery)}&unique=cards`);
        return response.data;
    } catch (erro) {
        if (erro.response && erro.response.status === 404) {
            return null;
        }
        console.error(`Erro ao buscar carta (${lang || 'qualquer idioma'}):`, erro.message);
        return null;
    }
}

async function buscarCartaFuzzy(nome) {
    try {
        await delay(SCRYFALL_DELAY);
        const response = await scryfallApi.get(`/cards/named?fuzzy=${encodeURIComponent(nome)}`);
        return response.data;
    } catch (erro) {
        return null;
    }
}

const DICIONARIO_PT_EN = {
    'raio': 'Lightning Bolt',
    'conterspell': 'Counterspell',
    'contrafeitiço': 'Counterspell',
    'contrafeitico': 'Counterspell',
    'girino': 'Giant Growth',
    'crescimento gigante': 'Giant Growth',
    'terror': 'Terror',
    'praga': 'Plague',
    'anjo': 'Angel',
    'dragão': 'Dragon',
    'dragao': 'Dragon',
    'elfo': 'Elf',
    'duende': 'Goblin',
    'mago': 'Wizard',
    'cavaleiro': 'Knight',
    'guerreiro': 'Warrior',
    'feiticeiro': 'Sorcerer',
    'planinauta': 'Planeswalker',
    'encantamento': 'Enchantment',
    'artefato': 'Artifact',
    'terreno': 'Land',
    'criatura': 'Creature',
    'instantânea': 'Instant',
    'instantanea': 'Instant',
    'feitiço': 'Sorcery',
    'caminhante de planos': 'Planeswalker',
    'destruição': 'Destroy',
    'destruicao': 'Destroy',
    'exílio': 'Exile',
    'exilio': 'Exile',
    'ressurreição': 'Resurrection',
    'jogar': 'Cast',
    'sacrificar': 'Sacrifice',
    'compra': 'Draw',
    'comprar': 'Draw',
    'ilha': 'Island',
    'montanha': 'Mountain',
    'floresta': 'Forest',
    'pântano': 'Swamp',
    'pantano': 'Swamp',
    'planície': 'Plains',
    'planicie': 'Plains',
};

async function enviarImagem(sock, jid, caminhoArquivo, legenda) {
    try {
        const imageBuffer = fs.readFileSync(caminhoArquivo);
        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: legenda || ''
        });
        return true;
    } catch (erro) {
        console.error('Erro ao enviar imagem:', erro);
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

async function processarResultadoBusca(sock, jid, cards, searchQuery, lang) {
    if (!cards || !cards.data || cards.data.length === 0) {
        return false;
    }

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
    mensagemLinks += `https://scryfall.com/search?q=name:${encodeURIComponent(searchQuery)}* lang:${lang}&unique=cards`;

    try {
        await sock.sendMessage(jid, { text: mensagemLinks });
    } catch (erro) {
        console.error('Erro ao enviar mensagem de links:', erro);
    }

    return true;
}

async function buscarCartaEspecifica(sock, jid, nome) {
    try {
        await delay(SCRYFALL_DELAY);
        const response = await scryfallApi.get(`/cards/named?exact=${encodeURIComponent(nome)}`);
        const card = response.data;

        if (card && card.image_uris && card.image_uris.normal) {
            const tempDir = await garantirDiretorioTemp();
            const tempFilePath = path.join(tempDir, `${nome.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`);

            if (await baixarESalvarImagem(card.image_uris.normal, tempFilePath)) {
                try {
                    const legenda = `🎴 *${card.name}*\n${card.type_line || ''}\n${card.mana_cost || ''}`;
                    await enviarImagem(sock, jid, tempFilePath, legenda);
                } catch (erro) {
                    console.error('Erro ao enviar imagem:', erro);
                } finally {
                    await limparArquivoTemp(tempFilePath);
                }
                return true;
            }
        }
    } catch (erro) {
        console.error('Erro ao buscar carta específica:', erro);
    }
    return false;
}

async function enviarCartaFuzzy(sock, jid, card) {
    try {
        const imageUrl = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
        if (!imageUrl) {
            await sock.sendMessage(jid, { text: `Encontrei *${card.name}*, mas não tenho imagem disponível.` });
            return true;
        }

        const tempDir = await garantirDiretorioTemp();
        const tempFilePath = path.join(tempDir, `${card.name.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`);

        if (await baixarESalvarImagem(imageUrl, tempFilePath)) {
            try {
                const legenda = `🎴 *${card.name}*\n${card.type_line || ''}\n${card.mana_cost || ''}`;
                await enviarImagem(sock, jid, tempFilePath, legenda);
            } finally {
                await limparArquivoTemp(tempFilePath);
            }
            return true;
        }
    } catch (erro) {
        console.error('Erro ao enviar carta fuzzy:', erro);
    }
    return false;
}

async function limparDiretorioTemp() {
    const tempDir = path.join(__dirname, 'temp');
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
        console.error('Erro ao limpar diretório temporário:', erro);
    }
}

function validarQueryBusca(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Query de busca inválida');
    }
    return query.replace(/[<>{}]/g, '');
}

async function verificarStatusAPI() {
    try {
        const response = await scryfallApi.get('/health');
        return response.data.status === 'healthy';
    } catch (erro) {
        console.error('Erro ao verificar status da API:', erro);
        return false;
    }
}

async function buscarCarta(sock, jid, searchQuery) {
    try {
        const queryValidada = validarQueryBusca(searchQuery);

        const apiOnline = await verificarStatusAPI();
        if (!apiOnline) {
            await sock.sendMessage(jid, { text: '⚠️ A API do Scryfall está temporariamente indisponível. Tente novamente em alguns minutos.' });
            return;
        }

        const queryLower = queryValidada.toLowerCase().trim();

        if (DICIONARIO_PT_EN[queryLower]) {
            const nomeEN = DICIONARIO_PT_EN[queryLower];
            console.log(`Dicionário: "${queryLower}" → "${nomeEN}"`);
            await sock.sendMessage(jid, { text: `🔍 Buscando "${queryValidada}" → ${nomeEN}...` });
            if (await buscarCartaEspecifica(sock, jid, nomeEN)) {
                return;
            }
        }

        const cartaFuzzy = await buscarCartaFuzzy(queryValidada);
        if (cartaFuzzy) {
            const nomePT = cartaFuzzy.printed_name;
            const legendaExtra = nomePT && nomePT !== cartaFuzzy.name ? ` (${nomePT})` : '';
            console.log(`Fuzzy match: "${queryValidada}" → "${cartaFuzzy.name}"`);
            await sock.sendMessage(jid, { text: `🔍 Encontrei: *${cartaFuzzy.name}*${legendaExtra}` });
            if (await enviarCartaFuzzy(sock, jid, cartaFuzzy)) {
                return;
            }
        }

        const queryScryfall = queryLower.split(/\s+/).length === 1
            ? `name:${queryValidada}`
            : `name:${queryValidada}`;

        const resultadoPT = await buscarCartaScryfall(queryScryfall, 'pt');
        if (await processarResultadoBusca(sock, jid, resultadoPT, queryValidada, 'pt')) {
            return;
        }

        const resultadoEN = await buscarCartaScryfall(queryScryfall, 'en');
        if (await processarResultadoBusca(sock, jid, resultadoEN, queryValidada, 'en')) {
            return;
        }

        const resultadoGeral = await buscarCartaScryfall(queryScryfall, null);
        if (await processarResultadoBusca(sock, jid, resultadoGeral, queryValidada, null)) {
            return;
        }

        await sock.sendMessage(jid, { text: '❌ Desculpe, não encontrei nenhuma carta com esse nome. Tente usar o nome em inglês ou um nome mais específico.' });
    } catch (erro) {
        console.error('Erro na função buscarCarta:', erro);
        await sock.sendMessage(jid, { text: '❌ Desculpe, ocorreu um erro ao buscar a carta. Tente novamente mais tarde.' });
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['MTG WhatsApp Bot', 'Chrome', '1.0.0'],
        getMessage: async (key) => {
            return { conversation: '' };
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            try {
                qrCodeBase64 = await QRCode.toDataURL(qr, {
                    color: { dark: '#000000', light: '#ffffff' },
                    width: 400,
                    margin: 1
                });
                console.log('QR Code gerado! Escaneie em http://localhost:' + PORT + '/qr');
                qrcodeTerminal.generate(qr, { small: true });
            } catch (erro) {
                console.error('Erro ao gerar QR Code:', erro);
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('Conexão fechada, statusCode:', statusCode, 'Reconectar?', shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            qrCodeBase64 = null;
            currentQR = null;
            console.log('Conectado ao WhatsApp com sucesso!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (!msg.key.fromMe && m.type === 'notify') {
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                const jid = msg.key.remoteJid;

                if (!messageText.trim().startsWith('!')) continue;

                const comando = messageText.trim().split(' ')[0].toLowerCase();
                const argumentos = messageText.trim().slice(comando.length).trim();

                switch (comando) {
                    case '!ajuda':
                    case '!help':
                        const mensagemAjuda = `Olá! Sou um bot para buscar cartas de Magic: The Gathering! 🎴\n\n` +
                            `Comandos disponíveis:\n` +
`!carta [nome] - Busca uma carta (em português ou inglês)\n` +
`!ajuda ou !help - Mostra esta mensagem de ajuda\n` +
`!ping - Responde com pong\n` +
`!oi - Responde com uma saudação\n` +
`!status - Verifica o status da API\n\n` +
`Dica: Você pode buscar pelo nome em português (ex: !carta raio) ou inglês (ex: !carta Lightning Bolt).`;
                        await sock.sendMessage(jid, { text: mensagemAjuda });
                        break;
                    case '!ping':
                        await sock.sendMessage(jid, { text: 'pong' });
                        break;
                    case '!oi':
                        const mensagemOla = 'Olá! Eu sou o ManaMate, seu assistente para buscar cartas de Magic: The Gathering! 🎴\n\nComandos disponíveis:\n!carta [nome] - Busca uma carta (em português ou inglês)\n!ajuda ou !help - Mostra ajuda detalhada\n!ping - Responde com pong\n!oi - Mostra esta mensagem\n!status - Verifica o status da API\n\nComo posso ajudar?';
                        await sock.sendMessage(jid, { text: mensagemOla });
                        break;
                    case '!status':
                        const apiOnline = await verificarStatusAPI();
                        await sock.sendMessage(jid, { text: apiOnline ? '✅ API do Scryfall está online e funcionando!' : '❌ API do Scryfall está indisponível no momento.' });
                        break;
                    case '!carta':
                        if (!argumentos) {
                            await sock.sendMessage(jid, { text: '❌ Por favor, especifique o nome da carta após o comando !carta' });
                            return;
                        }
                        await buscarCarta(sock, jid, argumentos);
                        break;
                    default:
                        await sock.sendMessage(jid, { text: '❌ Comando não reconhecido. Use !ajuda para ver os comandos disponíveis.' });
                }
            }
        }
    });

    return sock;
}

connectToWhatsApp().catch(err => {
    console.error('Erro ao conectar ao WhatsApp:', err);
    process.exit(1);
});

setInterval(limparDiretorioTemp, 3600000);

console.log('Bot MTG iniciando com Baileys...');