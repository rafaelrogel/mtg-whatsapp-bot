const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const WELCOME_STATE_FILE = path.join(__dirname, '..', 'welcome_state.json');

const WELCOME_MESSAGE = `🎴 *ManaMate - Seu Bot de Magic: The Gathering* 🎴

Olá! Eu sou o *ManaMate*, um bot que ajuda você a buscar cartas de MTG direto no WhatsApp!

📋 *Comandos disponíveis:*
!carta [nome] - Busca uma carta pelo nome (PT ou EN)
!ajuda ou !help - Mostra os comandos
!welcome - Mostra esta mensagem de apresentação
!ping - Testa se estou online
!oi - Cumprimento do bot
!status - Verifica se a API do Scryfall está online

💡 *Dicas:*
• Busque em português: !carta raio
• Busque em inglês: !carta Lightning Bolt
• Use nomes específicos para resultados melhores

🔍 Fonte: Scryfall API | Feito com ❤️ usando Baileys`;

function loadWelcomeState() {
    try {
        if (fs.existsSync(WELCOME_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(WELCOME_STATE_FILE, 'utf8'));
        }
    } catch (err) {
        logger.error({ err: err.message }, 'Erro ao carregar estado do welcome');
    }
    return { lastMonthly: {}, groups: {} };
}

function saveWelcomeState(state) {
    try {
        fs.writeFileSync(WELCOME_STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        logger.error({ err: err.message }, 'Erro ao salvar estado do welcome');
    }
}

function shouldSendMonthly(groupJid) {
    const state = loadWelcomeState();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!state.lastMonthly[groupJid] || state.lastMonthly[groupJid] !== currentMonth) {
        state.lastMonthly[groupJid] = currentMonth;
        saveWelcomeState(state);
        return true;
    }
    return false;
}

function trackGroup(groupJid) {
    const state = loadWelcomeState();
    if (!state.groups[groupJid]) {
        state.groups[groupJid] = { addedAt: new Date().toISOString() };
        saveWelcomeState(state);
        logger.info(`Novo grupo rastreado: ${groupJid}`);
    }
}

function getTrackedGroups() {
    const state = loadWelcomeState();
    return Object.keys(state.groups);
}

async function sendWelcome(sock, jid) {
    try {
        await sock.sendMessage(jid, { text: WELCOME_MESSAGE });
        logger.info(`Welcome enviado para ${jid}`);
    } catch (err) {
        logger.error({ err: err.message }, `Erro ao enviar welcome para ${jid}`);
    }
}

async function sendMonthlyWelcome(sock) {
    const groups = getTrackedGroups();
    let sent = 0;

    for (const groupJid of groups) {
        if (shouldSendMonthly(groupJid)) {
            await sendWelcome(sock, groupJid);
            sent++;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (sent > 0) {
        logger.info(`Welcome mensal enviado para ${sent} grupo(s)`);
    }
}

function startMonthlySchedule(sock) {
    const checkInterval = 60 * 60 * 1000;

    const check = () => {
        const now = new Date();
        if (now.getDate() === 1 && now.getHours() >= 8 && now.getHours() < 10) {
            sendMonthlyWelcome(sock);
        }
    };

    const interval = setInterval(check, checkInterval);
    check();

    return interval;
}

module.exports = {
    WELCOME_MESSAGE,
    loadWelcomeState,
    saveWelcomeState,
    shouldSendMonthly,
    trackGroup,
    getTrackedGroups,
    sendWelcome,
    sendMonthlyWelcome,
    startMonthlySchedule,
};