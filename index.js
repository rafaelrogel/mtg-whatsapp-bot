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

// Variável global para armazenar o QR Code atual
let currentQR = null;

// Rota para servir o QR Code
app.get('/qr', async (req, res) => {
    if (!currentQR) {
        return res.status(404).send('QR Code não disponível. Aguarde a geração.');
    }
    res.sendFile(currentQR);
});

// Rota de health check para o Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Iniciar o servidor Express
app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
    console.log(`QR Code disponível em: http://localhost:${PORT}/qr`);
});

console.log('Iniciando o bot...');

// Criar uma nova instância do cliente WhatsApp
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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

// Modificar o evento de QR Code
client.on('qr', async (qr) => {
    console.log('Gerando QR Code...');
    
    // Gerar QR Code como imagem
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const qrPath = path.join(tempDir, 'qr.png');
    await QRCode.toFile(qrPath, qr, {
        color: {
            dark: '#000000',
            light: '#ffffff'
        },
        width: 400,
        margin: 1
    });
    
    currentQR = qrPath;
    console.log(`QR Code gerado e disponível em: http://localhost:${PORT}/qr`);
    console.log('Escaneie o QR Code com seu WhatsApp!');
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('=========================');
    console.log('Cliente WhatsApp está pronto!');
    console.log('Comandos disponíveis:');
    console.log('- !ping');
    console.log('- !oi');
    console.log('- !carta [nome da carta]');
    console.log('=========================');
});

// Eventos de autenticação e conexão
client.on('auth_failure', async (msg) => {
    console.error('Falha de autenticação:', msg);
    await msg.reply('❌ Falha na autenticação. Por favor, tente novamente.');
});

client.on('disconnected', async (reason) => {
    console.log('Cliente desconectado:', reason);
    const reconectou = await tentarReconexao();
    if (!reconectou) {
        console.error('Não foi possível reconectar após várias tentativas');
    }
});

// Limpar diretório temporário a cada hora
setInterval(limparDiretorioTemp, 3600000);

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
client.initialize();
client.initialize();