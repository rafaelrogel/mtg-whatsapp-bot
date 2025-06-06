const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');
const express = require('express');
const QRCode = require('qrcode');

// Configuração do servidor Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurações adicionais do Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
    console.error('Erro no servidor:', err);
    res.status(500).send('Erro interno do servidor');
});

// Variável global para armazenar o QR Code atual
let currentQR = null;
let qrCodeBase64 = null;

// Rota para servir o QR Code
app.get('/qr', async (req, res) => {
    console.log('Requisição recebida na rota /qr');
    console.log('Status do QR Code:', qrCodeBase64 ? 'Disponível' : 'Não disponível');
    
    try {
        if (!qrCodeBase64) {
            console.log('QR Code ainda não disponível, enviando página de espera...');
            return res.status(404).send(`
                <html>
                    <head>
                        <title>QR Code não disponível</title>
                        <meta http-equiv="refresh" content="5">
                        <style>
                            body { 
                                font-family: Arial, sans-serif; 
                                text-align: center; 
                                padding: 20px;
                                background-color: #f0f2f5;
                            }
                            .message {
                                background: white;
                                padding: 20px;
                                border-radius: 10px;
                                margin: 20px auto;
                                max-width: 500px;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            }
                            .loading {
                                width: 40px;
                                height: 40px;
                                margin: 20px auto;
                                border: 4px solid #f3f3f3;
                                border-top: 4px solid #25D366;
                                border-radius: 50%;
                                animation: spin 1s linear infinite;
                            }
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="message">
                            <h2>QR Code não disponível</h2>
                            <div class="loading"></div>
                            <p>Aguardando a geração do QR Code...</p>
                            <p>Esta página será atualizada automaticamente em 5 segundos.</p>
                            <p>Se o QR Code não aparecer em alguns minutos, tente recarregar a página.</p>
                        </div>
                    </body>
                </html>
            `);
        }
        
        console.log('Enviando página com QR Code...');
        res.send(`
            <html>
                <head>
                    <title>QR Code WhatsApp</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 20px;
                            background-color: #f0f2f5;
                        }
                        .container {
                            background: white;
                            padding: 20px;
                            border-radius: 10px;
                            margin: 20px auto;
                            max-width: 500px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        }
                        .qr-code {
                            margin: 20px auto;
                            padding: 10px;
                            background: white;
                            border-radius: 5px;
                        }
                        .instructions {
                            margin-top: 20px;
                            color: #666;
                        }
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
        console.error('Stack trace:', erro.stack);
        res.status(500).send('Erro ao gerar QR Code');
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>MTG WhatsApp Bot</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 20px;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .qr-link {
                        display: inline-block;
                        background: #25D366;
                        color: white;
                        padding: 10px 20px;
                        text-decoration: none;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>MTG WhatsApp Bot</h1>
                    <p>Clique no botão abaixo para ver o QR Code:</p>
                    <a href="/qr" class="qr-link">Ver QR Code</a>
                </div>
            </body>
        </html>
    `);
});

// Rota de health check melhorada
app.get('/health', (req, res) => {
    try {
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Erro no health check:', error);
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// Iniciar o servidor Express com tratamento de erros
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
    console.log(`QR Code disponível em: http://localhost:${PORT}/qr`);
}).on('error', (error) => {
    console.error('Erro ao iniciar o servidor:', error);
    process.exit(1);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Promessa rejeitada não tratada:', error);
});

console.log('Iniciando o bot...');

// Inicializar o cliente WhatsApp
console.log('Inicializando cliente WhatsApp...');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-notifications',
            '--disable-translate',
            '--disable-sync',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--password-store=basic',
            '--use-mock-keychain',
            '--force-device-scale-factor=1',
            '--window-size=1920,1080'
        ],
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    }
});

// Configuração do axios para a API do Scryfall com retry e timeout
const scryfallApi = axios.create({
    baseURL: 'https://api.scryfall.com',
    headers: {
        'User-Agent': 'MTGWhatsAppBot/1.0',
        'Accept': 'application/json'
    },
    timeout: 10000, // 10 segundos
    validateStatus: function (status) {
        return status >= 200 && status < 500; // Aceita status 2xx, 3xx e 4xx
    }
});

// Função para delay entre requisições (50-100ms conforme documentação)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Função para obter imagem da carta
async function obterImagemCarta(card, formato = 'normal') {
    try {
        // Verificar se a carta tem faces duplas
        if (card.card_faces && card.card_faces.length > 0) {
            // Retornar array com imagens de ambas as faces
            return card.card_faces.map(face => face.image_uris[formato]);
        }
        
        // Se não tiver faces duplas, retornar imagem normal
        return [card.image_uris[formato]];
    } catch (error) {
        console.error('Erro ao obter imagem da carta:', error);
        return null;
    }
}

// Função para consolidar imagens em uma única imagem
async function consolidarImagens(imagens) {
    try {
        // Criar diretório temporário se não existir
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // Download de todas as imagens
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

        // Criar uma imagem consolidada
        const outputPath = path.join(tempDir, 'consolidada.jpg');
        await sharp({
            create: {
                width: 750 * imagens.length, // Largura de uma carta * número de cartas
                height: 1045, // Altura de uma carta
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

        // Limpar arquivos temporários individuais
        imagensBaixadas.forEach(file => fs.unlinkSync(file));

        return outputPath;
    } catch (error) {
        console.error('Erro ao consolidar imagens:', error);
        return null;
    }
}

// Função para garantir que o diretório temporário existe
async function garantirDiretorioTemp() {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        await fs.promises.mkdir(tempDir);
    }
    return tempDir;
}

// Função para limpar arquivos temporários
async function limparArquivoTemp(caminho) {
    try {
        if (fs.existsSync(caminho)) {
            await fs.promises.unlink(caminho);
        }
    } catch (erro) {
        console.error('Erro ao limpar arquivo temporário:', erro);
    }
}

// Função para baixar e salvar imagem
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

// Função para buscar carta no Scryfall
async function buscarCartaScryfall(query, lang = 'pt') {
    try {
        await delay(100);
        const response = await scryfallApi.get(`/cards/search?q=name:${query} lang:${lang}&unique=cards`);
        return response.data;
    } catch (erro) {
        console.error(`Erro ao buscar carta em ${lang}:`, erro);
        return null;
    }
}

// Função para processar resultado de busca
async function processarResultadoBusca(cards, msg, searchQuery, lang) {
    if (!cards || !cards.data || cards.data.length === 0) {
        return false;
    }

    let mensagemLinks = `Encontrei ${cards.data.length} cartas${lang === 'en' ? ' em inglês' : ''}. Aqui estão as primeiras 3:\n\n`;
    
    // Coletar URLs das imagens das primeiras 3 cartas
    const imagensUrls = [];
    for (let i = 0; i < Math.min(3, cards.data.length); i++) {
        const card = cards.data[i];
        mensagemLinks += `${i + 1}. *${card.name}*${lang === 'en' ? ' (em inglês)' : ''}\n`;
        
        if (card.image_uris && card.image_uris.normal) {
            imagensUrls.push(card.image_uris.normal);
        }
    }
    
    // Consolidar imagens
    if (imagensUrls.length > 0) {
        const imagemConsolidada = await consolidarImagens(imagensUrls);
        if (imagemConsolidada) {
            try {
                const media = MessageMedia.fromFilePath(imagemConsolidada);
                await msg.reply(media);
                await limparArquivoTemp(imagemConsolidada);
            } catch (erro) {
                console.error('Erro ao enviar imagem consolidada:', erro);
            }
        }
    }
    
    mensagemLinks += `\nPara ver todas as ${cards.data.length} cartas encontradas, acesse:\n`;
    mensagemLinks += `https://scryfall.com/search?q=name:${encodeURIComponent(searchQuery)}* lang:${lang}&unique=cards`;
    
    try {
        await msg.reply(mensagemLinks);
    } catch (erro) {
        console.error('Erro ao enviar mensagem de links:', erro);
    }
    
    return true;
}

// Função para buscar carta específica
async function buscarCartaEspecifica(nome, msg) {
    try {
        await delay(100);
        const response = await scryfallApi.get(`/cards/named?exact=${encodeURIComponent(nome)}`);
        const card = response.data;
        
        if (card && card.image_uris && card.image_uris.normal) {
            const tempDir = await garantirDiretorioTemp();
            const tempFilePath = path.join(tempDir, `${nome.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`);

            if (await baixarESalvarImagem(card.image_uris.normal, tempFilePath)) {
                try {
                    const media = MessageMedia.fromFilePath(tempFilePath);
                    await msg.reply(media);
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

// Função para limpar diretório temporário periodicamente
async function limparDiretorioTemp() {
    const tempDir = path.join(__dirname, 'temp');
    try {
        if (fs.existsSync(tempDir)) {
            const files = await fs.promises.readdir(tempDir);
            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.promises.stat(filePath);
                // Remove arquivos mais antigos que 1 hora
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.promises.unlink(filePath);
                }
            }
        }
    } catch (erro) {
        console.error('Erro ao limpar diretório temporário:', erro);
    }
}

// Função para validar e sanitizar query de busca
function validarQueryBusca(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Query de busca inválida');
    }
    // Remove caracteres especiais perigosos
    return query.replace(/[<>{}]/g, '');
}

// Função para verificar status da API
async function verificarStatusAPI() {
    try {
        const response = await scryfallApi.get('/health');
        return response.data.status === 'healthy';
    } catch (erro) {
        console.error('Erro ao verificar status da API:', erro);
        return false;
    }
}

// Função para tentar reconexão
async function tentarReconexao() {
    let tentativas = 0;
    const maxTentativas = 3;
    
    while (tentativas < maxTentativas) {
        try {
            console.log(`Tentativa de reconexão ${tentativas + 1}/${maxTentativas}`);
            await client.initialize();
            return true;
        } catch (erro) {
            console.error('Erro na reconexão:', erro);
            tentativas++;
            await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5 segundos entre tentativas
        }
    }
    return false;
}

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
});

// Evento quando o cliente é desconectado
client.on('disconnected', (reason) => {
    console.log('Cliente WhatsApp desconectado:', reason);
});

// Evento quando o cliente é autenticado
client.on('authenticated', () => {
    console.log('Cliente WhatsApp autenticado!');
});

// Evento quando o cliente falha na autenticação
client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação do WhatsApp:', msg);
});

// Modificar o evento de QR Code
client.on('qr', async (qr) => {
    console.log('Evento QR Code recebido, gerando QR Code...');
    
    try {
        // Gerar QR Code como base64
        console.log('Iniciando geração do QR Code como base64...');
        qrCodeBase64 = await QRCode.toDataURL(qr, {
            color: {
                dark: '#000000',
                light: '#ffffff'
            },
            width: 400,
            margin: 1
        });
        
        console.log('QR Code gerado com sucesso!');
        console.log('Tamanho do QR Code base64:', qrCodeBase64.length);
        console.log('Escaneie o QR Code com seu WhatsApp!');
    } catch (erro) {
        console.error('Erro ao gerar QR Code:', erro);
        console.error('Stack trace:', erro.stack);
    }
});

// Função principal de busca de carta com melhor tratamento de erros
async function buscarCarta(msg, searchQuery) {
    try {
        // Validar query
        const queryValidada = validarQueryBusca(searchQuery);
        
        // Verificar status da API
        const apiOnline = await verificarStatusAPI();
        if (!apiOnline) {
            await msg.reply('⚠️ A API do Scryfall está temporariamente indisponível. Tente novamente em alguns minutos.');
            return;
        }

        // Verificar se é uma busca por "raio"
        if (queryValidada.toLowerCase() === 'raio') {
            console.log('Redirecionando busca de "raio" para "Lightning Bolt"');
            if (await buscarCartaEspecifica('Lightning Bolt', msg)) {
                return;
            }
        }

        // Verificar se é uma única palavra
        const palavras = queryValidada.trim().split(/\s+/);
        const query = palavras.length === 1 ? `*${encodeURIComponent(queryValidada)}*` : encodeURIComponent(queryValidada);

        // Tentar busca em português
        const resultadoPT = await buscarCartaScryfall(query, 'pt');
        if (await processarResultadoBusca(resultadoPT, msg, queryValidada, 'pt')) {
            return;
        }

        // Tentar busca em inglês
        const resultadoEN = await buscarCartaScryfall(query, 'en');
        if (await processarResultadoBusca(resultadoEN, msg, queryValidada, 'en')) {
            return;
        }

        // Se não encontrou nada, enviar mensagem de erro
        await msg.reply('❌ Desculpe, não encontrei nenhuma carta com esse nome. Tente usar um nome mais específico ou o nome em inglês.');
    } catch (erro) {
        console.error('Erro na função buscarCarta:', erro);
        await msg.reply('❌ Desculpe, ocorreu um erro ao buscar a carta. Tente novamente mais tarde.');
    }
}

// Handler de mensagens com melhor validação
client.on('message', async (msg) => {
    try {
        const messageBody = msg.body.trim();
        
        // Validar se é um comando válido
        if (!messageBody.startsWith('!')) {
            return;
        }

        const comando = messageBody.split(' ')[0].toLowerCase();
        const argumentos = messageBody.slice(comando.length).trim();

        switch (comando) {
            case '!ajuda':
            case '!help':
                const mensagemAjuda = `Olá! Sou um bot para buscar cartas de Magic: The Gathering! 🎴\n\n` +
                    `Comandos disponíveis:\n` +
                    `!carta [nome] - Busca uma carta (em português ou inglês)\n` +
                    `!ajuda ou !help - Mostra esta mensagem de ajuda\n` +
                    `!ping - Responde com pong\n` +
                    `!oi - Responde com uma saudação\n\n` +
                    `Dica: Para cartas em português, use acentos e caracteres especiais. Para cartas em inglês, use o nome em inglês.`;
                await msg.reply(mensagemAjuda);
                break;
            case '!ping':
                await msg.reply('pong');
                break;
            case '!oi':
                const mensagemOla = 'Olá! Eu sou o ManaMate, seu assistente para buscar cartas de Magic: The Gathering! 🎴\n\nComandos disponíveis:\n!carta [nome] - Busca uma carta (em português ou inglês)\n!ajuda ou !help - Mostra ajuda detalhada\n!ping - Responde com pong\n!oi - Mostra esta mensagem\n!status - Verifica o status da API\n\nComo posso ajudar?';
                await msg.reply(mensagemOla);
                break;
            case '!status':
                await verificarStatus(msg);
                break;
            case '!carta':
                if (!argumentos) {
                    await msg.reply('❌ Por favor, especifique o nome da carta após o comando !carta');
                    return;
                }
                await buscarCarta(msg, argumentos);
                break;
            default:
                await msg.reply('❌ Comando não reconhecido. Use !ajuda para ver os comandos disponíveis.');
        }
    } catch (erro) {
        console.error('Erro ao processar mensagem:', erro);
        await msg.reply('❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
});

// Iniciar o cliente
console.log('Iniciando cliente WhatsApp...');
client.initialize().catch(err => {
    console.error('Erro ao inicializar o cliente WhatsApp:', err);
    console.error('Stack trace:', err.stack);
});