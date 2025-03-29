const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

console.log('Iniciando o bot...');

// Criar uma nova instância do cliente WhatsApp
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Configuração do axios para a API do Scryfall
const scryfallApi = axios.create({
    baseURL: 'https://api.scryfall.com',
    headers: {
        'User-Agent': 'MTGWhatsAppBot/1.0',
        'Accept': 'application/json'
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

// Gerar QR Code para autenticação
client.on('qr', (qr) => {
    console.log('Gerando QR Code...');
    qrcode.generate(qr, {small: true});
    console.log('Escaneie o QR Code acima com seu WhatsApp!');
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

// Quando houver desconexão
client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
});

// Responder a mensagens
client.on('message', async (msg) => {
    console.log('Nova mensagem:', msg.body);

    try {
        if (msg.body === '!ajuda' || msg.body === '!help') {
            const mensagemAjuda = `Olá! Sou um bot para buscar cartas de Magic: The Gathering! 🎴\n\n` +
                `Comandos disponíveis:\n` +
                `!carta [nome] - Busca uma carta (em português ou inglês)\n` +
                `!ajuda ou !help - Mostra esta mensagem de ajuda\n` +
                `!ping - Responde com pong\n` +
                `!oi - Responde com uma saudação\n\n` +
                `Dica: Para cartas em português, use acentos e caracteres especiais. Para cartas em inglês, use o nome em inglês.`;
            await msg.reply(mensagemAjuda);
        }
        else if (msg.body === '!ping') {
            console.log('Comando !ping recebido');
            await msg.reply('pong');
        }
        
        else if (msg.body === '!oi') {
            console.log('Comando !oi recebido');
            await msg.reply('Olá! Eu sou o ManaMate, seu assistente para buscar cartas de Magic: The Gathering! 🎴\n\nComandos disponíveis:\n!carta [nome] - Busca uma carta (em português ou inglês)\n!ajuda ou !help - Mostra ajuda detalhada\n!ping - Responde com pong\n!oi - Mostra esta mensagem\n!status - Verifica o status da API\n\nComo posso ajudar?');
        }
        
        else if (msg.body === '!status') {
            console.log('Verificando status da API do Scryfall...');
            try {
                await delay(100);
                const response = await scryfallApi.get('/health');
                const status = response.data;
                
                let mensagemStatus = '📊 Status da API do Scryfall:\n\n';
                mensagemStatus += `✅ Status: ${status.status}\n`;
                mensagemStatus += `📈 Versão: ${status.version}\n`;
                mensagemStatus += `🔄 Última atualização: ${new Date(status.updated_at).toLocaleString('pt-BR')}\n`;
                
                if (status.status === 'healthy') {
                    mensagemStatus += '\n✨ A API está funcionando normalmente!';
                } else {
                    mensagemStatus += '\n⚠️ A API pode estar com problemas.';
                }
                
                await msg.reply(mensagemStatus);
            } catch (error) {
                console.error('Erro ao verificar status:', error.message);
                await msg.reply('❌ Erro ao verificar o status da API do Scryfall.');
            }
        }
        
        else if (msg.body === '!teste') {
            console.log('Iniciando teste de responsividade...');
            const inicio = Date.now();
            
            // Teste 1: Resposta básica
            await msg.reply('Teste 1: Resposta básica');
            
            // Teste 2: Busca de carta simples
            await msg.reply('Teste 2: Buscando carta "Lightning Bolt"');
            try {
                const response = await axios.get(`https://api.scryfall.com/cards/named?exact=Lightning Bolt`);
                const card = response.data;
                
                if (card && card.image_uris && card.image_uris.normal) {
                    const tempDir = path.join(__dirname, 'temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir);
                    }

                    const tempFilePath = path.join(tempDir, 'lightning_bolt.jpg');
                    const imageResponse = await axios({
                        url: card.image_uris.normal,
                        responseType: 'arraybuffer'
                    });

                    fs.writeFileSync(tempFilePath, imageResponse.data);
                    const media = MessageMedia.fromFilePath(tempFilePath);
                    await msg.reply(media);
                    fs.unlinkSync(tempFilePath);
                }
            } catch (error) {
                await msg.reply('Erro ao buscar Lightning Bolt');
            }
            
            // Teste 3: Busca de múltiplas cartas
            await msg.reply('Teste 3: Buscando cartas com "fire"');
            try {
                const response = await axios.get(`https://api.scryfall.com/cards/search?q=name:fire&unique=cards`);
                if (response.data.data && response.data.data.length > 0) {
                    let mensagemLinks = `Encontrei ${response.data.data.length} cartas. Primeiras 3:\n\n`;
                    response.data.data.slice(0, 3).forEach((card, index) => {
                        mensagemLinks += `${index + 1}. *${card.name}*\n${card.scryfall_uri}\n\n`;
                    });
                    await msg.reply(mensagemLinks);
                }
            } catch (error) {
                await msg.reply('Erro ao buscar cartas com "fire"');
            }
            
            // Teste 4: Busca por cor
            await msg.reply('Teste 4: Buscando cartas vermelhas');
            try {
                const response = await axios.get(`https://api.scryfall.com/cards/search?q=color:r&unique=cards`);
                if (response.data.data && response.data.data.length > 0) {
                    let mensagemLinks = `Encontrei ${response.data.data.length} cartas vermelhas. Primeiras 3:\n\n`;
                    response.data.data.slice(0, 3).forEach((card, index) => {
                        mensagemLinks += `${index + 1}. *${card.name}*\n${card.scryfall_uri}\n\n`;
                    });
                    await msg.reply(mensagemLinks);
                }
            } catch (error) {
                await msg.reply('Erro ao buscar cartas vermelhas');
            }
            
            const fim = Date.now();
            const tempoTotal = (fim - inicio) / 1000;
            await msg.reply(`✅ Teste de responsividade concluído!\nTempo total: ${tempoTotal.toFixed(2)} segundos`);
        }
        
        else if (msg.body.startsWith('!carta ')) {
            const searchQuery = msg.body.slice(7);
            console.log('Buscando carta:', searchQuery);
            
            try {
                // Verificar se é uma busca por "raio"
                if (searchQuery.toLowerCase() === 'raio') {
                    console.log('Redirecionando busca de "raio" para "Lightning Bolt"');
                    try {
                        await delay(100);
                        const response = await scryfallApi.get('/cards/search?q=name:"Lightning Bolt" lang:pt&unique=cards');
                        
                        if (response.data.data && response.data.data.length > 0) {
                            const card = response.data.data[0];
                            if (card.image_uris && card.image_uris.normal) {
                                const tempDir = path.join(__dirname, 'temp');
                                if (!fs.existsSync(tempDir)) {
                                    fs.mkdirSync(tempDir);
                                }

                                const tempFilePath = path.join(tempDir, 'lightning_bolt.jpg');

                                const imageResponse = await axios({
                                    url: card.image_uris.normal,
                                    responseType: 'arraybuffer',
                                    maxRedirects: 5
                                });

                                fs.writeFileSync(tempFilePath, imageResponse.data);
                                const media = MessageMedia.fromFilePath(tempFilePath);
                                await msg.reply(media);
                                fs.unlinkSync(tempFilePath);
                                return;
                            }
                        }
                    } catch (error) {
                        console.log('Erro ao buscar Lightning Bolt em português, tentando em inglês...');
                        try {
                            await delay(100);
                            const response = await scryfallApi.get('/cards/named?exact=Lightning Bolt');
                            const card = response.data;
                            
                            if (card && card.image_uris && card.image_uris.normal) {
                                const tempDir = path.join(__dirname, 'temp');
                                if (!fs.existsSync(tempDir)) {
                                    fs.mkdirSync(tempDir);
                                }

                                const tempFilePath = path.join(tempDir, 'lightning_bolt.jpg');

                                const imageResponse = await axios({
                                    url: card.image_uris.normal,
                                    responseType: 'arraybuffer',
                                    maxRedirects: 5
                                });

                                fs.writeFileSync(tempFilePath, imageResponse.data);
                                const media = MessageMedia.fromFilePath(tempFilePath);
                                await msg.reply(media);
                                fs.unlinkSync(tempFilePath);
                                return;
                            }
                        } catch (error) {
                            console.log('Erro ao buscar Lightning Bolt em inglês...');
                        }
                    }
                }

                // Verificar se é uma única palavra
                const palavras = searchQuery.trim().split(/\s+/);
                const query = palavras.length === 1 ? `*${encodeURIComponent(searchQuery)}*` : encodeURIComponent(searchQuery);

                // Primeiro tentar busca exata em português
                try {
                    await delay(100);
                    const response = await scryfallApi.get(`/cards/search?q=name:"${query}" lang:pt&unique=cards`);
                    
                    if (response.data.data && response.data.data.length > 0) {
                        const card = response.data.data[0];
                        if (card.image_uris && card.image_uris.normal) {
                            const tempDir = path.join(__dirname, 'temp');
                            if (!fs.existsSync(tempDir)) {
                                fs.mkdirSync(tempDir);
                            }

                            const tempFilePath = path.join(tempDir, `${card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`);

                            const imageResponse = await axios({
                                url: card.image_uris.normal,
                                responseType: 'arraybuffer',
                                maxRedirects: 5
                            });

                            fs.writeFileSync(tempFilePath, imageResponse.data);
                            const media = MessageMedia.fromFilePath(tempFilePath);
                            await msg.reply(media);
                            fs.unlinkSync(tempFilePath);
                            return;
                        }
                    }
                } catch (error) {
                    console.log('Busca exata em português falhou, tentando busca parcial...');
                }

                // Se não encontrou com busca exata, tentar busca parcial em português
                await delay(100);
                const response = await scryfallApi.get(`/cards/search?q=name:${query} lang:pt&unique=cards`);
                
                if (response.data.data && response.data.data.length > 0) {
                    let mensagemLinks = `Encontrei ${response.data.data.length} cartas. Aqui estão as primeiras 3:\n\n`;
                    
                    // Coletar URLs das imagens das primeiras 3 cartas
                    const imagensUrls = [];
                    for (let i = 0; i < Math.min(3, response.data.data.length); i++) {
                        const card = response.data.data[i];
                        mensagemLinks += `${i + 1}. *${card.name}*\n`;
                        
                        if (card.image_uris && card.image_uris.normal) {
                            imagensUrls.push(card.image_uris.normal);
                        }
                    }
                    
                    // Consolidar imagens
                    if (imagensUrls.length > 0) {
                        const imagemConsolidada = await consolidarImagens(imagensUrls);
                        if (imagemConsolidada) {
                            const media = MessageMedia.fromFilePath(imagemConsolidada);
                            await msg.reply(media);
                            fs.unlinkSync(imagemConsolidada);
                        }
                    }
                    
                    mensagemLinks += `\nPara ver todas as ${response.data.data.length} cartas encontradas, acesse:\n`;
                    mensagemLinks += `https://scryfall.com/search?q=name:${encodeURIComponent(searchQuery)}* lang:pt&unique=cards`;
                    
                    await msg.reply(mensagemLinks);
                    return;
                }

                // Se não encontrou em português, tentar em inglês
                try {
                    await delay(100);
                    const enResponse = await scryfallApi.get(`/cards/search?q=name:${query} lang:en&unique=cards`);
                    
                    if (enResponse.data.data && enResponse.data.data.length > 0) {
                        let mensagemLinks = `Não encontrei em português, mas encontrei ${enResponse.data.data.length} cartas em inglês. Aqui estão as primeiras 3:\n\n`;
                        
                        // Coletar URLs das imagens das primeiras 3 cartas
                        const imagensUrls = [];
                        for (let i = 0; i < Math.min(3, enResponse.data.data.length); i++) {
                            const card = enResponse.data.data[i];
                            mensagemLinks += `${i + 1}. *${card.name}* (em inglês)\n`;
                            
                            if (card.image_uris && card.image_uris.normal) {
                                imagensUrls.push(card.image_uris.normal);
                            }
                        }
                        
                        // Consolidar imagens
                        if (imagensUrls.length > 0) {
                            const imagemConsolidada = await consolidarImagens(imagensUrls);
                            if (imagemConsolidada) {
                                const media = MessageMedia.fromFilePath(imagemConsolidada);
                                await msg.reply(media);
                                fs.unlinkSync(imagemConsolidada);
                            }
                        }
                        
                        mensagemLinks += `\nPara ver todas as ${enResponse.data.data.length} cartas encontradas, acesse:\n`;
                        mensagemLinks += `https://scryfall.com/search?q=name:${encodeURIComponent(searchQuery)}* lang:en&unique=cards`;
                        
                        await msg.reply(mensagemLinks);
                        return;
                    }
                } catch (error) {
                    console.log('Busca em inglês falhou...');
                }

                // Se chegou aqui, não encontrou nenhuma carta
                await msg.reply('❌ Nenhuma carta encontrada com esse nome. Tente escrever o nome da carta em português ou inglês.');
            } catch (error) {
                console.error('Erro ao buscar carta:', error.message);
                await msg.reply('❌ Erro ao buscar carta. Por favor, tente novamente.');
            }
        }
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await msg.reply(`❌ Erro ao processar sua mensagem: ${error.message}`);
    }
});

// Iniciar o cliente
console.log('Iniciando cliente WhatsApp...');
client.initialize();