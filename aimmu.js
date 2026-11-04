#!/usr/bin/env node
// bm_ultimate.js - BM ULTIMATE V6 // SECURE ADMIN ONLY
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const gTTS = require("gtts");

process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 1;

const STATE_FILE = path.join(__dirname, "state.json");
const LOCK_FILE = path.join(__dirname, "bot.lock");

// 🔥 LOCK FILE SYSTEM TO PREVENT MULTIPLE INSTANCES OF THE SCRIPT
if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'));
    try {
        process.kill(pid, 0); 
        console.log(`[ERROR] Bot is already running (PID: ${pid}). Exiting to prevent duplicate replies.`);
        process.exit(1);
    } catch (e) {
        // Stale lock, remove it
    }
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());

const cleanup = () => { try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {} };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });
process.on('uncaughtException', (err) => { console.error(err); cleanup(); process.exit(1); });

const MAX_BOTS = 100;
const MAX_RETRIES = 10;
const RECONNECT_DELAY = 1000;

// 🔒 SUPER OWNERS (Only they can use !sudo and !rmsudo)
const OWNER_IDS = [5427447587, 8989613402];
const POLL_EMOJIS = ["💗","💘","💖","💝","💞","💓","💕","❤️","💙","💚","💛","💜"];

// ===== YOUR NEW BOT TOKENS =====
const BOT_TOKENS = [
    "9064132445:AAFfZ9gKKVbPk3l_GWp0nY-3UGDb4h7io-U",
    "9089113621:AAEGBUqY8wMLBZcBojQZIErAt-V_KaGB4Xc",
    "8696926840:AAEo4Epq4bR9XNCMaIHwytzAbf7ijpqBr4Y",
    "9172937311:AAFgvb69kWS3xBzuRqIQUdtNkJ-_lHUsCU",
    "9149860065:AAEmEKcgoALGOgcHMK9uTb5jvoK27vIn2A0"
].slice(0, MAX_BOTS);

// ===== SMALL CAPS HELPER =====
const SMALL_CAPS_MAP = {
  a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',
  n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
  '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'
};
function sc(str) {
  return String(str).split('').map(c => SMALL_CAPS_MAP[c.toLowerCase()] || c).join('');
}

let chatState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE)) : {
    admins: [...OWNER_IDS],
    delay: { 
        nc: 200, spam: 2500, vn: 3500, pfp: 3000, slide: 300, 
        photospam: 2000, desnc: 100, fdspam: 2000, pollspam: 3000, panelspam: 3000, ncShared: 200 
    },
    muted: {}, photoreply: {}, photospam: {}, photoreload: {},
    replies: {}, autopin: {}, reactions: {}, fdspam: {}, pollspam: {}, panelspam: {},
    ncLock: {}, wizard: {}
};

function saveStateAndSync() {
    try {
        fs.writeFile(STATE_FILE, JSON.stringify(chatState, null, 2), () => {});
    } catch (e) {}
}

OWNER_IDS.forEach(oid => { if (!chatState.admins.includes(oid)) chatState.admins.push(oid); });

if (!chatState.photoreply) chatState.photoreply = {};
if (!chatState.photospam) chatState.photospam = {};
if (!chatState.photoreload) chatState.photoreload = {};
if (!chatState.replies) chatState.replies = {};
if (!chatState.autopin) chatState.autopin = {};
if (!chatState.reactions) chatState.reactions = {};
if (!chatState.fdspam) chatState.fdspam = {};
if (!chatState.pollspam) chatState.pollspam = {};
if (!chatState.panelspam) chatState.panelspam = {};
if (!chatState.ncLock) chatState.ncLock = {};
if (!chatState.wizard) chatState.wizard = {};
if (!chatState.delay.ncShared) chatState.delay.ncShared = 200;

function ensureList(chatId, key) {
    if (!chatState[key]) chatState[key] = {};
    if (!chatState[key][chatId] || !Array.isArray(chatState[key][chatId])) chatState[key][chatId] = [];
    return chatState[key][chatId];
}
function ensurePhotoReply(chatId) {
    if (!chatState.photoreply[chatId] || typeof chatState.photoreply[chatId] !== 'object') chatState.photoreply[chatId] = {};
    return chatState.photoreply[chatId];
}
function ensurePhotoSpam(chatId) {
    if (!chatState.photospam[chatId] || typeof chatState.photospam[chatId] !== 'object') chatState.photospam[chatId] = { active: false, photoFileId: null };
    return chatState.photospam[chatId];
}
function ensureReplies(chatId) {
    if (!chatState.replies[chatId] || typeof chatState.replies[chatId] !== 'object') chatState.replies[chatId] = {};
    return chatState.replies[chatId];
}
function ensureReactions(chatId) {
    if (!chatState.reactions[chatId] || typeof chatState.reactions[chatId] !== 'object') chatState.reactions[chatId] = {};
    return chatState.reactions[chatId];
}
function ensureFdspam(chatId) {
    if (!chatState.fdspam[chatId] || typeof chatState.fdspam[chatId] !== 'object') chatState.fdspam[chatId] = { active: false, fromChatId: null, messageId: null };
    return chatState.fdspam[chatId];
}
function ensurePollSpam(chatId) {
    if (!chatState.pollspam[chatId] || typeof chatState.pollspam[chatId] !== 'object') chatState.pollspam[chatId] = { active: false, question: null };
    return chatState.pollspam[chatId];
}
function ensurePanelSpam(chatId) {
    if (!chatState.panelspam[chatId] || typeof chatState.panelspam[chatId] !== 'object') chatState.panelspam[chatId] = { active: false, question: null };
    return chatState.panelspam[chatId];
}
function getReloadPhotos(chatId) {
    if (!chatState.photoreload[chatId]) chatState.photoreload[chatId] = [];
    return chatState.photoreload[chatId];
}
function getRandomReloadPhoto(chatId) {
    const photos = getReloadPhotos(chatId);
    const validPhotos = photos.filter(p => p !== null);
    if (validPhotos.length === 0) return null;
    return validPhotos[Math.floor(Math.random() * validPhotos.length)];
}

const ALL_EMOJIS = [
    "☦", "‡", "†", "✝", "✠", "✡", "★", "☆", "✦", "✧", 
    "✪", "✫", "✬", "✭", "✮", "✯", "✰", "⚔", "⚖", "⚙", 
    "⚡", "⚠", "⚛", "⚜", "⚝", "♔", "♕", "♖", "♗", "♘", 
    "♙", "♚", "♛", "♜", "♝", "♞", "♟", "♠", "♡", "♢", 
    "♣", "♤", "♥", "♦", "♧", "♨", "♪", "♫", "♬", "♭", 
    "♮", "♯", "➔", "➜", "➝", "➞", "➟", "➠", "➡", "➢", 
    "➣", "➤", "➥", "➦", "➧", "➨", "➩", "➪", "➫", "➬", 
    "➭", "➮", "➯", "➱", "➲", "➳", "➴", "➵", "➶", "➷", 
    "➸", "➹", "➺", "➻", "➼", "➽", "➾", "✁", "✂", "✃", 
    "✄", "✆", "✇", "✈", "✉", "✌", "✍", "✎", "✏", "✐", 
    "✑", "✒", "✓", "✔", "✕", "✖", "✗", "✘", "✙", "✚", 
    "✛", "✜", "✞", "✟", "✢", "✣", "✤", "✥", "✩", "✱", 
    "✲", "✳", "✴", "✵", "✶", "✷", "✸", "✹", "✺", "✻", 
    "✼", "✽", "✾", "✿", "❀", "❁", "❂", "❃", "❄", "❅", 
    "❆", "❇", "❈", "❉", "❊", "❋", "❌", "❍", "❎", "❏"
];

const SPEED_MODULES = {
    "nc": { name: sc("NC Speed"), key: "ncShared" },
    "spam": { name: sc("Spam Speed"), key: "spam" },
    "fdspam": { name: sc("Fdspam Speed"), key: "fdspam" },
    "pollspam": { name: sc("Pollspam Speed"), key: "pollspam" },
    "panelspam": { name: sc("Panelspam Speed"), key: "panelspam" },
    "slide": { name: sc("Slide Speed"), key: "slide" },
    "vn": { name: sc("VN Speed"), key: "vn" },
    "pfp": { name: sc("PFP Speed"), key: "pfp" },
    "photospam": { name: sc("Photospam Speed"), key: "photospam" },
    "desnc": { name: sc("DesNC Speed"), key: "desnc" }
};

const MENU_SECTIONS = {
    status: { name: sc("Status"), commands: [] },
    exec: { name: sc("Reply"), commands: [["!reply", sc("Shadow Bind")], ["!dreply", sc("Break Echo")]] },
    delay: { name: sc("Delay Settings"), commands: [] },
    rift: { name: sc("AutoChange"), commands: [["!nc", sc("Warp Name")], ["!dnc", sc("Stabilize Name")], ["!desnc", sc("Warp Desc")], ["!desdnc", sc("Stabilize Desc")]] },
    weave: { name: sc("PFP"), commands: [["!pfp", sc("Cast Image")], ["!dpfp", sc("Dispel Image")]] },
    legion: { name: sc("Spam"), commands: [
        ["!spam", sc("Summon Chaos")], 
        ["!dspam", sc("Dismiss Chaos")], 
        ["!fdspam", sc("Forward Spam")], 
        ["!dfdspam", sc("Stop Forward Spam")], 
        ["!pollspam", sc("Poll Spam")], 
        ["!dpollspam", sc("Stop Poll Spam")], 
        ["!panelspam", sc("Panel Spam")], 
        ["!dpanelspam", sc("Stop Panel Spam")]
    ]},
    script: { name: sc("Slide"), commands: [["!slide", sc("Scroll Onslaught")], ["!dslide", sc("End Onslaught")]] },
    call: { name: sc("Voice"), commands: [["!vn", sc("Echo Voice")], ["!dvn", sc("Silence Echo")]] },
    arsenal: { name: sc("Photos"), commands: [["!photoreload", sc("Store Weapon")], ["!resetphoto", sc("Clear Arsenal")], ["!photoreply", sc("Auto Strike")], ["!dphotoreply", sc("Cease Strike")], ["!photospam", sc("Image Storm")], ["!dphotospam", sc("Calm Storm")]] },
    silence: { name: sc("Mute"), commands: [["!mute", sc("Banish")], ["!unmute", sc("Recall")], ["!mutelist", sc("List Banished")]] },
    throne: { name: sc("Admin"), commands: [["!sudo", sc("Grant Power")], ["!rmsudo", sc("Revoke Power")], ["!on", sc("Awaken")]] },
    pin: { name: sc("AutoPin"), commands: [["!autopin", sc("Activate Pin Mode")], ["!dautopin", sc("Deactivate Pin Mode")]] },
    react: { name: sc("React"), commands: [["!reactall", sc("React to ALL")], ["!react", sc("React to Target")], ["!stopreact", sc("Stop All")]] },
    stopall: { name: sc("StopAll"), commands: [["!stopall", sc("Stop ALL Active Modules")]] }
};

const WIZARD_CONFIG = {
    "!reply": { prompt: sc("Enter ID & text separated by | (e.g. 123456 | Hello):") },
    "!dreply": { prompt: sc("Enter the Target ID to break the echo:") },
    "!speed": { prompt: sc("Enter module & delay (e.g. spam 1000):") },
    "!nc": { prompt: sc("Enter names separated by | (e.g. Name1 | Name2):") },
    "!desnc": { prompt: sc("Enter descriptions separated by | (e.g. Desc1 | Desc2):") },
    "!pfp": { prompt: sc("Please send the photo you wish to cast:") },
    "!spam": { prompt: sc("Enter the text to initiate the chaos barrage:") },
    "!fdspam": { prompt: sc("Enter SOURCE_CHAT_ID and MESSAGE_ID separated by | (e.g. -1001234567 | 42):\nOr reply to any message with !fdspam manually.") },
    "!pollspam": { prompt: sc("Enter the question for the poll:") },
    "!panelspam": { prompt: sc("Enter the text for the panel buttons:") },
    "!slide": { prompt: sc("Enter ID & texts by | (e.g. 123456 | Text1 | Text2):") },
    "!vn": { prompt: sc("Enter ID & voice text by | (e.g. 123456 | Hello):") },
    "!photoreload": { prompt: sc("Enter slot 1-5 and send the photo:") },
    "!photoreply": { prompt: sc("Enter ID & caption (e.g. 123456 | hi):") },
    "!photospam": { prompt: sc("Please send the photo to initiate the image storm:") },
    "!mute": { prompt: sc("Enter the User ID to enforce eternal silence:") },
    "!unmute": { prompt: sc("Enter the User ID to break silence:") },
    "!sudo": { prompt: sc("Enter the User ID to grant admin power:") },
    "!rmsudo": { prompt: sc("Enter the User ID to revoke admin power:") },
    "!reactall": { prompt: sc("Enter the emoji for divine reaction:") },
    "!react": { prompt: sc("Enter ID & emoji by | (e.g. 123456 | 🔥):") }
};

function buildMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "📊 " + sc("Status"), callback_data: "menu:status" }, { text: "🎯 " + sc("Reply"), callback_data: "menu:exec" }],
            [{ text: "⏱️ " + sc("Delay"), callback_data: "menu:delay" }, { text: "🌀 " + sc("AutoChange"), callback_data: "menu:rift" }],
            [{ text: "🖼️ " + sc("PFP"), callback_data: "menu:weave" }, { text: "💥 " + sc("Spam"), callback_data: "menu:legion" }],
            [{ text: "📜 " + sc("Slide"), callback_data: "menu:script" }, { text: "🎙️ " + sc("Voice"), callback_data: "menu:call" }],
            [{ text: "📸 " + sc("Photos"), callback_data: "menu:arsenal" }, { text: "🔇 " + sc("Mute"), callback_data: "menu:silence" }],
            [{ text: "👑 " + sc("Admin"), callback_data: "menu:throne" }, { text: "📌 " + sc("AutoPin"), callback_data: "menu:pin" }],
            [{ text: "🎭 " + sc("React"), callback_data: "menu:react" }, { text: "🛑 " + sc("StopAll"), callback_data: "menu:stopall" }],
            [{ text: "❌ " + sc("Close"), callback_data: "menu:close" }]
        ]
    };
}

function buildSectionKeyboard(sectionId) {
    const section = MENU_SECTIONS[sectionId];
    if (!section) return buildMainMenuKeyboard();
    let buttons = [];
    
    if (sectionId === "status") {
        buttons.push([{ text: "⟳ " + sc("Refresh Status"), callback_data: "menu:status" }]);
    } else if (sectionId === "delay") {
        const mods = Object.keys(SPEED_MODULES);
        for (let i = 0; i < mods.length; i += 2) {
            const row = [];
            const mod1 = mods[i];
            row.push({ text: SPEED_MODULES[mod1].name, callback_data: `speed:${mod1}` });
            if (i + 1 < mods.length) {
                const mod2 = mods[i + 1];
                row.push({ text: SPEED_MODULES[mod2].name, callback_data: `speed:${mod2}` });
            }
            buttons.push(row);
        }
    } else {
        const cmds = section.commands.map(([cmd, desc]) => ({ text: sc(cmd), callback_data: `wizard:${Buffer.from(cmd).toString('base64')}` }));
        for (let i = 0; i < cmds.length; i += 2) {
            if (i + 1 < cmds.length) {
                buttons.push([cmds[i], cmds[i + 1]]);
            } else {
                buttons.push([cmds[i]]);
            }
        }
    }
    buttons.push([{ text: "◀ " + sc("Back"), callback_data: "menu:main" }, { text: sc("Close"), callback_data: "menu:close" }]);
    return { inline_keyboard: buttons };
}

function buildMainMenuText() {
    return `👑 ${sc("BM ULTIMATE")} 👑\n⚡ ${sc("CONTROL PANEL")} ⚡\n👇 ${sc("SELECT A MODULE TO MANAGE:")}`;
}

function buildSectionText(sectionId, chatId) {
    if (sectionId === "status") return buildStatusText(chatId);
    const section = MENU_SECTIONS[sectionId];
    if (!section) return buildMainMenuText();
    
    let text = `⚡ ${sc("BM")} | ${sc(section.name)} ⚡\n\n`;
    
    if (sectionId === "delay") {
        text += `${sc("Select a module to set its delay:")}\n`;
        Object.keys(SPEED_MODULES).forEach(key => {
            const mod = SPEED_MODULES[key];
            const current = chatState.delay[mod.key] || 0;
            text += `${mod.name}: ${current}ms\n`;
        });
        text += `\n👇 ${sc("Tap any button below to change.")}`;
    } else {
        section.commands.forEach(([cmd, desc]) => {
            text += `${sc(cmd)} » ${desc}\n`; 
        });
        text += `\n👇 ${sc("Tap any button below to execute.")}`;
    }
    return text;
}

function sendAdvResponse(bot, chatId, title, text, replyToMsg) {
    const cleanText = `${sc(title)} - ${sc(text)}`.replace(/\n/g, ' ');
    const msgText = `✨ ${cleanText}`;
    bot.sendMessage(chatId, msgText, { parse_mode: "Markdown", reply_to_message_id: replyToMsg?.message_id }).then(msg => {
        if (msg && msg.message_id && chatState.autopin && chatState.autopin[chatId]) {
            bot.pinChatMessage(chatId, msg.message_id).catch(() => {});
        }
    }).catch(() => {});
}

function buildStatusText(chatId) {
    const cs = chatState[chatId] || {};
    const delay = chatState.delay || {};
    const on = "🟢"; const off = "🔴";
    
    return `📊 ${sc("LIVE STATUS PANEL")} 📊
🌀 ${sc("Name Change")}: ${cs.nc?.active ? on : off}
🌀 ${sc("Desc Change")}: ${cs.desnc?.active ? on : off}
💣 ${sc("Spam")}: ${cs.spam?.active ? on : off}
📤 ${sc("Fwd Spam")}: ${chatState.fdspam?.[chatId]?.active ? on : off}
📊 ${sc("Poll Spam")}: ${chatState.pollspam?.[chatId]?.active ? on : off}
🔲 ${sc("Panel Spam")}: ${chatState.panelspam?.[chatId]?.active ? on : off}
📜 ${sc("Slide")}: ${cs.slide?.active ? on : off}
🎙️ ${sc("Voice Note")}: ${cs.vn?.active ? on : off}
🖼️ ${sc("PFP Change")}: ${cs.pfp?.active ? on : off}
📸 ${sc("Photo Spam")}: ${chatState.photospam?.[chatId]?.active ? on : off}
📌 ${sc("Auto-Pin")}: ${chatState.autopin?.[chatId] ? on : off}
🎭 ${sc("React All")}: ${chatState.reactions?.[chatId]?.reactall?.active ? on : off}
🎯 ${sc("React Target")}: ${chatState.reactions?.[chatId]?.react?.active ? on : off}
⚡ ${sc("NC Speed")}: ${delay.ncShared || 200}ms
💣 ${sc("Spam Speed")}: ${delay.spam || 2500}ms`;
}

const rateLimiters = {};

function isAuthorized(userId) {
    const id = Number(userId);
    if (OWNER_IDS.includes(id)) return true;
    if (chatState.admins && Array.isArray(chatState.admins)) {
        return chatState.admins.includes(id);
    }
    return false;
}

async function safeSendMessage(bot, chatId, text, replyToMsg, opts = {}) {
    const options = Object.assign({ parse_mode: "Markdown" }, opts);
    try {
        if (replyToMsg && replyToMsg.message_id) options.reply_to_message_id = replyToMsg.message_id;
        return await bot.sendMessage(chatId, text, options);
    } catch (err) { return null; }
}

function createStableBot(token, botIndex) {
    const botOptions = {
        polling: {
            interval: 100, autoStart: true,
            params: { timeout: 30, limit: 100, allowed_updates: ["message", "callback_query", "new_chat_members", "new_chat_title", "new_chat_photo", "delete_chat_photo"] }
        },
        request: { timeout: 10000, forever: true, pool: { maxSockets: 50, maxFreeSockets: 10, timeout: 60000, freeSocketTimeout: 30000 } }
    };
    const bot = new TelegramBot(token, botOptions);
    rateLimiters[botIndex] = { lastRequest: 0 };
    bot.on("polling_error", (error) => {
        if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
            console.log(`[BOT ${botIndex}] Critical error, restarting polling...`);
            setTimeout(() => {
                bot.stopPolling().then(() => { setTimeout(() => bot.startPolling(), 500); }).catch(() => {});
            }, RECONNECT_DELAY);
        }
    });
    bot.on("error", (error) => { console.log(`[BOT ${botIndex}] Error: ${error.message}`); });
    bot.on("webhook_error", () => {});
    setInterval(async () => { try { await bot.getMe(); } catch (e) {} }, 300000);
    return bot;
}

async function rateLimitedRequest(botIndex, fn) {
    const limiter = rateLimiters[botIndex];
    if (!limiter) return fn();
    const now = Date.now();
    const t = now - limiter.lastRequest;
    if (t < 20) await new Promise(resolve => setTimeout(resolve, 20 - t));
    limiter.lastRequest = Date.now();
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try { return await fn(); } catch (e) {
            if (e.response && e.response.statusCode === 429) {
                const waitTime = (e.response.body?.parameters?.retry_after || 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            if (retry >= 3) throw e;
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retry)));
        }
    }
}

const globalNcNextRun = {};
const ncBotCooldown = {};

BOT_TOKENS.forEach((token, botIndex) => {
    if (!token || token.includes("YOUR_BOT_TOKEN")) return;
    let retryCount = 0;
    function initBot() {
        try {
            const bot = createStableBot(token, botIndex);
            setupBotHandlers(bot, token, botIndex);
            console.log(`[BOT ${botIndex}] Connected & Stable`);
        } catch (e) {
            if (retryCount < MAX_RETRIES) { retryCount++; setTimeout(initBot, RECONNECT_DELAY * retryCount); }
        }
    }
    initBot();
});

function setupBotHandlers(bot, token, botIndex) {
    let botUserId = null;
    bot.getMe().then(me => { botUserId = me.id; }).catch(() => {});

    // Local memory per bot to prevent double replies from the SAME bot
    const localProcessedMsgs = new Set();
    const localProcessedCallbacks = new Set();
    setInterval(() => { localProcessedMsgs.clear(); localProcessedCallbacks.clear(); }, 60000);

    bot.on("new_chat_members", async (msg) => {
        if (!botUserId) return;
        if (msg.new_chat_members.some(m => m.id === botUserId)) {
            const greeting = `👑 ${sc("BM BOT ONLINE")} - ${sc("THE PRESENCE OF THE HUNTER HAS BEEN ESTABLISHED. YOUR ADVERSARIES SHALL BE SYSTEMATICALLY DISMANTLED WITH NO CLEMENCY AND NO ULTIMATUMS. THE OPERATION COMMENCES IMMEDIATELY.")}`;
            await bot.sendMessage(msg.chat.id, greeting).catch(() => {});
        }
    });

    async function runNC(chatId) {
        const cs = chatState[chatId];
        if (!cs?.nc?.active) return;

        const baseDelay = Math.max(parseInt(chatState.delay.ncShared) || 200, 10); 
        const now = Date.now();

        if (!ncBotCooldown[chatId]) ncBotCooldown[chatId] = {};
        if (ncBotCooldown[chatId][botIndex] && now < ncBotCooldown[chatId][botIndex]) {
            setTimeout(() => runNC(chatId), baseDelay + 10);
            return;
        }

        if (!globalNcNextRun[chatId]) globalNcNextRun[chatId] = 0;

        if (now < globalNcNextRun[chatId]) {
            const waitTime = Math.max(10, globalNcNextRun[chatId] - now);
            setTimeout(() => runNC(chatId), waitTime);
            return;
        }

        globalNcNextRun[chatId] = Date.now() + baseDelay;

        try {
            const emoji1 = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
            const emoji2 = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
            const text = cs.nc.texts[Math.floor(Math.random() * cs.nc.texts.length)];
            
            await bot.setChatTitle(chatId, `${emoji1} ${text} ${emoji2}`);
            
            globalNcNextRun[chatId] = Date.now() + baseDelay;
            setTimeout(() => runNC(chatId), baseDelay);

        } catch (e) {
            if (e.response?.statusCode === 429) {
                const retryAfter = (e.response.body?.parameters?.retry_after || 5) * 1000;
                ncBotCooldown[chatId][botIndex] = Date.now() + retryAfter;
                
                globalNcNextRun[chatId] = Date.now() + 10;
                setTimeout(() => runNC(chatId), 10);
            } else {
                globalNcNextRun[chatId] = Date.now() + baseDelay;
                setTimeout(() => runNC(chatId), baseDelay);
            }
        }
    }

    async function runDescNC(chatId) {
        const cs = chatState[chatId];
        if (!cs?.desnc?.active) return;
        const currentDelay = cs.desnc?.currentDelay || chatState.delay.desnc || 100;
        try {
            await rateLimitedRequest(botIndex, async () => {
                const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
                const text = cs.desnc.texts[Math.floor(Math.random() * cs.desnc.texts.length)];
                return await bot.setChatDescription(chatId, `${emoji} ${text} ${emoji}`);
            });
            const newDelay = Math.max(50, currentDelay - 10);
            if (!cs.desnc) cs.desnc = {};
            cs.desnc.currentDelay = newDelay;
            saveStateAndSync();
            setTimeout(() => runDescNC(chatId), newDelay);
        } catch (e) {
            if (e.response?.statusCode === 429) {
                const retryAfter = (e.response.body?.parameters?.retry_after || 3) * 1000;
                const increasedDelay = Math.min(5000, currentDelay + 200);
                if (!cs.desnc) cs.desnc = {};
                cs.desnc.currentDelay = increasedDelay;
                saveStateAndSync();
                setTimeout(() => runDescNC(chatId), retryAfter);
            } else setTimeout(() => runDescNC(chatId), 500);
        }
    }

    async function runPFP(chatId, fileId) {
        if (!chatState[chatId]?.pfp?.active) return;
        try {
            const fileStream = await bot.getFileStream(fileId);
            await rateLimitedRequest(botIndex, () => bot.setChatPhoto(chatId, fileStream));
        } catch (e) {
            if (e.response?.statusCode === 429) { setTimeout(() => runPFP(chatId, fileId), 5000); return; }
        }
        setTimeout(() => runPFP(chatId, fileId), chatState.delay.pfp || 3000);
    }

    async function runSpam(chatId) {
        const s = chatState[chatId]?.spam;
        if (!s?.active) return;
        try {
            const sentMsg = await rateLimitedRequest(botIndex, () => bot.sendMessage(chatId, s.text));
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runSpam(chatId), chatState.delay.spam || 2500);
    }

    async function runFdspam(chatId) {
        const fd = ensureFdspam(chatId);
        if (!fd.active || !fd.fromChatId || !fd.messageId) return;
        try {
            const sentMsg = await rateLimitedRequest(botIndex, () => bot.forwardMessage(chatId, fd.fromChatId, fd.messageId));
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runFdspam(chatId), chatState.delay.fdspam || 2000);
    }

    async function runPollSpam(chatId) {
        const ps = ensurePollSpam(chatId);
        if (!ps.active || !ps.question) return;
        try {
            const options = POLL_EMOJIS.map(e => `${ps.question} ${e}`);
            const sentMsg = await rateLimitedRequest(botIndex, () => 
                bot.sendPoll(chatId, ps.question, options, { is_anonymous: true })
            );
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runPollSpam(chatId), chatState.delay.pollspam || 3000);
    }

    async function runPanelSpam(chatId) {
        const ps = ensurePanelSpam(chatId);
        if (!ps.active || !ps.question) return;
        try {
            const rows = [];
            for (let i = 0; i < 12; i += 3) {
                const row = [];
                for (let j = 0; j < 3; j++) {
                    const idx = i + j;
                    if (idx < 12) {
                        row.push({ 
                            text: `${ps.question} ${POLL_EMOJIS[idx]}`, 
                            callback_data: `pspam:${idx}` 
                        });
                    }
                }
                if (row.length > 0) rows.push(row);
            }
            const sentMsg = await rateLimitedRequest(botIndex, () => 
                bot.sendMessage(chatId, `📊 ${ps.question}`, {
                    reply_markup: { inline_keyboard: rows }
                })
            );
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runPanelSpam(chatId), chatState.delay.panelspam || 3000);
    }

    async function runSlide(chatId) {
        const cs = chatState[chatId];
        if (!cs?.slide?.active) return;
        try {
            if (cs.slide.targetId && cs.slide.texts?.length > 0) {
                for (let i = 0; i < cs.slide.texts.length; i++) {
                    setTimeout(async () => { 
                        const sentMsg = await bot.sendMessage(chatId, cs.slide.texts[i], { reply_to_message_id: cs.slide.replyToMsgId }).catch(() => {});
                        if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
                    }, i * 100);
                }
            }
        } catch (e) {}
        setTimeout(() => runSlide(chatId), chatState.delay.slide || 300);
    }

    async function runVN(chatId) {
        const cs = chatState[chatId];
        if (!cs?.vn?.active) return;
        try {
            const vnPath = path.join(__dirname, `vn_${botIndex}_${Date.now()}.mp3`);
            await new Promise((resolve, reject) => {
                new gTTS(cs.vn.text, 'hi').save(vnPath, (err) => { if (err) reject(err); else resolve(); });
            });
            const sentVoice = await bot.sendVoice(chatId, vnPath, { reply_to_message_id: cs.vn.replyToMsgId }).catch(() => {});
            if (sentVoice && sentVoice.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentVoice.message_id).catch(() => {});
            
            const sentText = await bot.sendMessage(chatId, cs.vn.text, { reply_to_message_id: cs.vn.replyToMsgId }).catch(() => {});
            if (sentText && sentText.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentText.message_id).catch(() => {});
            
            try { fs.unlinkSync(vnPath); } catch (e) {}
        } catch (e) {}
        setTimeout(() => runVN(chatId), chatState.delay.vn || 3500);
    }

    async function runPhotoSpam(chatId) {
        const ps = chatState.photospam[chatId];
        if (!ps?.active) return;
        try { 
            const sentMsg = await bot.sendPhoto(chatId, ps.photoFileId).catch(() => {});
            if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        } catch (e) {}
        setTimeout(() => runPhotoSpam(chatId), chatState.delay.photospam || 2000);
    }

    bot.on("message", async (msg) => {
        if (!msg || !msg.chat) return;
        const chatId = msg.chat.id;
        const text = msg.text || "";
        const fromId = msg.from ? Number(msg.from.id) : null;
        const messageId = msg.message_id;

        // Prevent the SAME bot from processing the SAME message twice (handles Telegram API glitches)
        const msgKey = `${chatId}_${messageId}`;
        if (localProcessedMsgs.has(msgKey)) return;
        localProcessedMsgs.add(msgKey);

        const mutedList = ensureList(chatId, 'muted');
        if (fromId && mutedList.includes(fromId)) {
            try {
                if (mutedList._canDeleteChecked === undefined) {
                    const me = await bot.getMe();
                    const member = await bot.getChatMember(chatId, me.id);
                    mutedList._canDelete = member.status === 'administrator' && member.can_delete_messages;
                    mutedList._canDeleteChecked = true;
                }
                if (mutedList._canDelete) await bot.deleteMessage(chatId, messageId);
            } catch (e) {
                try { await bot.deleteMessage(chatId, messageId); } catch (e2) {}
            }
            return;
        }

        if (fromId && isAuthorized(fromId)) {
            const wiz = chatState.wizard[chatId];
            if (wiz && wiz.step === "input" && wiz.action) {
                const isPhotoCmd = ["!pfp", "!photospam", "!photoreload"].includes(wiz.action);
                let valid = false;
                if (isPhotoCmd) {
                    if (msg.photo && msg.photo.length > 0) {
                        wiz.data.photo = msg.photo[msg.photo.length - 1].file_id;
                        if (wiz.action === "!photoreload") wiz.data.text = text.trim();
                        valid = true;
                    }
                } else if (text && !text.startsWith("!")) {
                    wiz.data.text = text.trim();
                    valid = true;
                }
                if (valid) {
                    await executeWizardAction(wiz.action, wiz.data, chatId, bot);
                    chatState.wizard[chatId] = null;
                    saveStateAndSync();
                }
                return;
            }
        }

        const reactState = ensureReactions(chatId);
        if (reactState.reactall && reactState.reactall.active) {
            const emoji = reactState.reactall.emoji || "🔥";
            if (fromId !== botUserId && !text.startsWith("!")) {
                try { await bot.setMessageReaction(chatId, messageId, { reaction: [{ type: "emoji", emoji: emoji }] }).catch(() => {}); } catch (e) {}
            }
        }
        if (reactState.react && reactState.react.active) {
            const tid = reactState.react.targetId;
            const emoji = reactState.react.emoji || "🔥";
            if (fromId === tid && !text.startsWith("!")) {
                try { await bot.setMessageReaction(chatId, messageId, { reaction: [{ type: "emoji", emoji: emoji }] }).catch(() => {}); } catch (e) {}
            }
        }

        const prChat = ensurePhotoReply(chatId);
        const randomPhoto = getRandomReloadPhoto(chatId);
        if (fromId && randomPhoto) {
            if (prChat[fromId] && prChat[fromId].active) {
                const caption = prChat[fromId].caption || "";
                bot.sendPhoto(chatId, randomPhoto.fileId, { caption: caption, reply_to_message_id: messageId }).then(sent => {
                    if (sent && sent.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sent.message_id).catch(()=>{});
                }).catch(() => {});
            }
        }

        const replyObj = ensureReplies(chatId);
        if (fromId && replyObj[fromId]) {
            bot.sendMessage(chatId, replyObj[fromId], { reply_to_message_id: messageId }).then(sent => {
                if (sent && sent.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sent.message_id).catch(()=>{});
            }).catch(() => {});
            return;
        }

        if (text.startsWith("!")) {
            const args = text.trim().split(/\s+/);
            const cmd = args.shift().toLowerCase();

            if (cmd !== "!sudo" && cmd !== "!rmsudo" && !isAuthorized(fromId)) {
                sendAdvResponse(bot, chatId, "Access Denied", "Your clearance level is insufficient to execute this protocol.", msg);
                return;
            }

            if ((cmd === "!sudo" || cmd === "!rmsudo") && !OWNER_IDS.includes(fromId)) {
                sendAdvResponse(bot, chatId, "Access Denied", "Only Super Owners possess the clearance to modify administrator privileges.", msg);
                return;
            }

            if (!chatState[chatId]) chatState[chatId] = {};
            ensureList(chatId, 'muted');
            ensurePhotoReply(chatId);
            ensurePhotoSpam(chatId);
            ensureReplies(chatId);
            ensureReactions(chatId);
            ensureFdspam(chatId);
            ensurePollSpam(chatId);
            ensurePanelSpam(chatId);
            if (!chatState.photoreload[chatId]) chatState.photoreload[chatId] = [];

            switch (cmd) {
                case "!menu": {
                    const sectionArg = args[0]?.toLowerCase();
                    if (sectionArg && MENU_SECTIONS[sectionArg]) {
                        const sent = await bot.sendMessage(chatId, buildSectionText(sectionArg, chatId), {
                            reply_markup: buildSectionKeyboard(sectionArg)
                        }).catch(() => {});
                        if (sent && sent.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sent.message_id).catch(() => {});
                    } else {
                        const sent = await bot.sendMessage(chatId, buildMainMenuText(), {
                            reply_markup: buildMainMenuKeyboard()
                        }).catch(() => {});
                        if (sent && sent.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, sent.message_id).catch(() => {});
                    }
                    break;
                }

                case "!reply": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to a message to establish the auto-reply parameter.", msg); break; }
                    const rt = args.join(" ");
                    if (!rt) { sendAdvResponse(bot, chatId, "Error", "No response text provided for the auto-reply protocol.", msg); break; }
                    const et = Number(msg.reply_to_message.from.id);
                    ensureReplies(chatId)[et] = rt;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Echo Imprinted", `Automated response protocol established for user ${et}. Target will receive tailored replies.`, msg);
                    break;
                }

                case "!dreply": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to the user's message to terminate the auto-reply.", msg); break; }
                    const ret = Number(msg.reply_to_message.from.id);
                    const eo = ensureReplies(chatId);
                    if (eo[ret]) {
                        delete eo[ret]; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Echo Shattered", `Automated response protocol terminated for user ${ret}. The echo has been silenced.`, msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active auto-reply protocol detected for this user.", msg);
                    break;
                }

                case "!speed": {
                    if (args.length < 2) { sendAdvResponse(bot, chatId, "Error", "Invalid syntax. Please specify both the module and the desired interval.", msg); break; }
                    const ty = args[0].toLowerCase(); let msv = parseInt(args[1]);
                    if (ty === 'ncshared' && msv < 10) msv = 10;
                    if (ty === 'nc' && msv < 10) msv = 10;
                    if (ty === 'desnc' && msv < 10) msv = 10;
                    if (ty === 'photospam' && msv < 1000) msv = 1000;
                    if (ty === 'fdspam' && msv < 500) msv = 500;
                    if (ty === 'pollspam' && msv < 1000) msv = 1000;
                    if (ty === 'panelspam' && msv < 1000) msv = 1000;
                    
                    if (ty === 'nc') {
                        chatState.delay.ncShared = msv;
                        saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Velocity Adjusted", `Operational frequency recalibrated. Execution interval for NC is now set to ${msv}ms.`, msg);
                        break;
                    }
                    
                    if (chatState.delay.hasOwnProperty(ty)) {
                        chatState.delay[ty] = msv;
                        saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Velocity Adjusted", `Operational frequency recalibrated. Execution interval for ${ty.toUpperCase()} is now set to ${msv}ms.`, msg);
                    } else sendAdvResponse(bot, chatId, "Error", `Module parameter ${ty} is invalid or unrecognized.`, msg);
                    break;
                }

                case "!nc": {
                    chatState[chatId].nc = { active: true, texts: args.join(" ").split("|") };
                    globalNcNextRun[chatId] = 0;
                    saveStateAndSync(); runNC(chatId);
                    sendAdvResponse(bot, chatId, "Name Change Active", `Reality alteration sequence initiated. Chat title will undergo dynamic mutation every ${chatState.delay.ncShared || 200}ms.`, msg);
                    break;
                }

                case "!dnc": {
                    if (chatState[chatId].nc) chatState[chatId].nc.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Name Change Sealed", "Reality warp terminated. System stability and chat title parameters have been fully restored.", msg);
                    break;
                }

                case "!desnc": {
                    const dt = args.join(" ").split("|").filter(t => t.trim());
                    if (dt.length === 0) { sendAdvResponse(bot, chatId, "Error", "No descriptive text parameters were provided.", msg); break; }
                    chatState[chatId].desnc = { active: true, texts: dt };
                    saveStateAndSync(); runDescNC(chatId);
                    sendAdvResponse(bot, chatId, "Description Active", "Identity modification sequence initiated. Group description is now shifting dynamically.", msg);
                    break;
                }

                case "!desdnc": {
                    if (chatState[chatId].desnc) chatState[chatId].desnc.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Description Sealed", "Description alteration sequence terminated. System parameters are currently locked and stable.", msg);
                    break;
                }

                case "!pfp": {
                    if (!msg.reply_to_message?.photo) { sendAdvResponse(bot, chatId, "Error", "No image data detected. Please reply directly to the target photograph.", msg); break; }
                    chatState[chatId].pfp = { active: true };
                    saveStateAndSync();
                    runPFP(chatId, msg.reply_to_message.photo.pop().file_id);
                    sendAdvResponse(bot, chatId, "Illusion Weaving", "Profile image alteration engaged. Visual flux is now active and continuously shifting.", msg);
                    break;
                }

                case "!dpfp": {
                    if (chatState[chatId].pfp) chatState[chatId].pfp.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Illusion Shattered", "Profile image alteration deactivated. Visual parameters have been stabilized to their original state.", msg);
                    break;
                }

                case "!spam": {
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "No textual payload was provided for the spam sequence.", msg); break; }
                    chatState[chatId].spam = { active: true, text: args.join(" ") };
                    saveStateAndSync(); runSpam(chatId);
                    sendAdvResponse(bot, chatId, "Chaos Barrage Active", `Chaos barrage sequence initiated. Hellfire is raining on the channel with an interval of ${chatState.delay.spam || 2500}ms.`, msg);
                    break;
                }

                case "!dspam": {
                    if (chatState[chatId].spam) chatState[chatId].spam.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Barrage Ceased", "Chaos barrage sequence successfully terminated. Absolute silence is now restored to the channel.", msg);
                    break;
                }

                case "!fdspam": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Forward spam requires a source message. Please reply to the target message.", msg); break; }
                    const replyMsg = msg.reply_to_message;
                    const fd = ensureFdspam(chatId);
                    fd.active = true;
                    fd.fromChatId = replyMsg.chat.id;
                    fd.messageId = replyMsg.message_id;
                    saveStateAndSync(); runFdspam(chatId);
                    sendAdvResponse(bot, chatId, "Forward Spam Active", `Forward spam sequence initiated. Relentless forwarding is active at an interval of ${chatState.delay.fdspam || 2000}ms.`, msg);
                    break;
                }

                case "!dfdspam": {
                    const fdstop = ensureFdspam(chatId);
                    if (fdstop.active) {
                        fdstop.active = false; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Forward Spam Ceased", "Forward spam sequence terminated successfully. Operational relay has been halted.", msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active forward spam sequence was detected.", msg);
                    break;
                }

                case "!pollspam": {
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "No poll question was provided.", msg); break; }
                    const question = args.join(" ");
                    const ps = ensurePollSpam(chatId);
                    ps.active = true; ps.question = question;
                    saveStateAndSync(); runPollSpam(chatId);
                    sendAdvResponse(bot, chatId, "Poll Spam Active", `Poll spam sequence initiated. Creating polls repeatedly at an execution interval of ${chatState.delay.pollspam || 3000}ms.`, msg);
                    break;
                }

                case "!dpollspam": {
                    const psstop = ensurePollSpam(chatId);
                    if (psstop.active) {
                        psstop.active = false; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Poll Spam Ceased", "Poll spam sequence terminated successfully. Operations have been completely ceased.", msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active poll spam sequence was detected.", msg);
                    break;
                }

                case "!panelspam": {
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "No textual payload was provided for the panel spam sequence.", msg); break; }
                    const pquestion = args.join(" ");
                    const ps = ensurePanelSpam(chatId);
                    ps.active = true; ps.question = pquestion;
                    saveStateAndSync(); runPanelSpam(chatId);
                    sendAdvResponse(bot, chatId, "Panel Spam Active", `Panel spam sequence initiated. Executing button barrage at an interval of ${chatState.delay.panelspam || 3000}ms.`, msg);
                    break;
                }

                case "!dpanelspam": {
                    const psstop = ensurePanelSpam(chatId);
                    if (psstop.active) {
                        psstop.active = false; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Panel Spam Ceased", "Panel spam sequence terminated successfully. The button barrage has been halted.", msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active panel spam sequence was detected.", msg);
                    break;
                }

                case "!slide": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to a target message to initiate the slide protocol.", msg); break; }
                    const st = args.join(" ").split("|").filter(t => t.trim());
                    if (st.length === 0) { sendAdvResponse(bot, chatId, "Error", "No textual parameters were provided for the slide sequence.", msg); break; }
                    chatState[chatId].slide = { active: true, targetId: Number(msg.reply_to_message.from.id), replyToMsgId: msg.reply_to_message.message_id, texts: st };
                    saveStateAndSync(); runSlide(chatId);
                    sendAdvResponse(bot, chatId, "Infinite Scroll Active", `Slide sequence deployed. ${st.length} textual payloads are being executed in an unending blitz strike.`, msg);
                    break;
                }

                case "!dslide": {
                    if (chatState[chatId].slide) chatState[chatId].slide.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Scroll Frozen", "Slide sequence successfully terminated. Temporal operations are currently paused and stabilized.", msg);
                    break;
                }

                case "!vn": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to a message to establish the target context for the voice note.", msg); break; }
                    if (args.join(" ").length === 0) { sendAdvResponse(bot, chatId, "Error", "No textual payload was provided for voice synthesis.", msg); break; }
                    const vt = args.join(" ");
                    chatState[chatId].vn = { active: true, text: vt, replyToMsgId: msg.reply_to_message.message_id, targetId: Number(msg.reply_to_message.from.id) };
                    saveStateAndSync(); runVN(chatId);
                    sendAdvResponse(bot, chatId, "Void Echo Invoked", "Voice synthesis sequence initiated. Auditory payload will be deployed on a continuous loop.", msg);
                    break;
                }

                case "!dvn": {
                    if (chatState[chatId].vn) chatState[chatId].vn.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Void Silenced", "Voice synthesis sequence successfully terminated. Auditory operations have completely ceased.", msg);
                    break;
                }

                case "!photoreload": {
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "Invalid syntax. Please specify the storage slot (1-5).", msg); break; }
                    const sn = parseInt(args[0]);
                    if (isNaN(sn) || sn < 1 || sn > 5) { sendAdvResponse(bot, chatId, "Error", "Invalid slot parameter. Please select a value between 1 and 5.", msg); break; }
                    if (!msg.reply_to_message || !msg.reply_to_message.photo) { sendAdvResponse(bot, chatId, "Error", `Please reply to a photograph to store it in slot ${sn}.`, msg); break; }
                    const pi = sn - 1;
                    const ph = getReloadPhotos(chatId);
                    const fid = msg.reply_to_message.photo.pop().file_id;
                    while (ph.length <= pi) ph.push(null);
                    ph[pi] = { fileId: fid, index: sn };
                    chatState.photoreload[chatId] = ph;
                    saveStateAndSync();
                    const vc = ph.filter(p => p !== null).length;
                    sendAdvResponse(bot, chatId, "Armory Loaded", `Weapon stored in slot ${sn}. Arsenal capacity is now operating at ${vc}/5 photographs.`, msg);
                    break;
                }

                case "!resetphoto": {
                    chatState.photoreload[chatId] = [];
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Armory Cleared", "All stored image data has been purged. The armory is currently empty and ready.", msg);
                    break;
                }

                case "!photoreply": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to a target message to initiate the photo retaliation protocol.", msg); break; }
                    const pl2 = getReloadPhotos(chatId);
                    if (pl2.filter(p => p !== null).length === 0) { sendAdvResponse(bot, chatId, "Error", "Armory empty. Please load photographs using the photoreload command first.", msg); break; }
                    const tgu = Number(msg.reply_to_message.from.id);
                    const ct = args.join(" ") || "🔥";
                    ensurePhotoReply(chatId)[tgu] = { active: true, caption: ct };
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Photo Retaliation Active", `Photo retaliation sequence initiated for target ${tgu}. Every subsequent message will be countered with an image payload.`, msg);
                    break;
                }

                case "!dphotoreply": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to the target user's message to terminate the photo retaliation.", msg); break; }
                    const su = Number(msg.reply_to_message.from.id);
                    const pr2 = ensurePhotoReply(chatId);
                    if (pr2[su]) {
                        delete pr2[su]; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Retaliation Ceased", `The photo retaliation sequence has been terminated for target ${su}.`, msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active photo retaliation protocol detected for this user.", msg);
                    break;
                }

                case "!photospam": {
                    if (!msg.reply_to_message || !msg.reply_to_message.photo) { sendAdvResponse(bot, chatId, "Error", "Please reply to a photograph to initiate the image barrage sequence.", msg); break; }
                    const spid = msg.reply_to_message.photo.pop().file_id;
                    ensurePhotoSpam(chatId);
                    chatState.photospam[chatId] = { active: true, photoFileId: spid };
                    saveStateAndSync(); runPhotoSpam(chatId);
                    sendAdvResponse(bot, chatId, "Photo Spam Active", `Image barrage sequence initiated. Execution interval established at ${chatState.delay.photospam || 2000}ms.`, msg);
                    break;
                }

                case "!dphotospam": {
                    const ps = ensurePhotoSpam(chatId);
                    if (ps.active) {
                        ps.active = false; saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Photo Spam Ceased", "The image barrage sequence has been successfully terminated. Operations have been ceased.", msg);
                    } else sendAdvResponse(bot, chatId, "Error", "No active image barrage sequence was detected.", msg);
                    break;
                }

                case "!mute": {
                    let mi = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!mi || isNaN(mi)) { sendAdvResponse(bot, chatId, "Error", "Target identification failed. Please specify a valid user or reply to their message.", msg); break; }
                    if (OWNER_IDS.includes(mi)) { sendAdvResponse(bot, chatId, "Error", "Unauthorized operation. Cannot enforce silence protocols on the system administrator.", msg); break; }
                    const ml = ensureList(chatId, 'muted');
                    if (!ml.includes(mi)) { ml.push(mi); saveStateAndSync(); }
                    sendAdvResponse(bot, chatId, "Eternal Silence Active", `Silence protocol successfully enforced on target ${mi}. All subsequent messages will be purged automatically.`, msg);
                    break;
                }

                case "!unmute": {
                    let ui = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ui || isNaN(ui)) { sendAdvResponse(bot, chatId, "Error", "Target identification failed. Please specify a valid user.", msg); break; }
                    const ul = ensureList(chatId, 'muted');
                    if (ul.includes(ui)) {
                        chatState.muted[chatId] = ul.filter(id => id !== ui);
                        saveStateAndSync();
                        sendAdvResponse(bot, chatId, "Silence Broken", `The silence protocol has been lifted for target ${ui}. Communication privileges have been restored.`, msg);
                    } else sendAdvResponse(bot, chatId, "Error", "The specified user is not currently under silence protocol.", msg);
                    break;
                }

                case "!mutelist": {
                    const mlc = ensureList(chatId, 'muted');
                    if (mlc.length === 0) {
                        sendAdvResponse(bot, chatId, "Silence List", "The active silence protocol list is currently empty. No operations are active.", msg);
                    } else {
                        const lines = [`Total entities silenced: ${mlc.length}. `];
                        mlc.forEach((id, i) => { lines.push(`${i+1}. ${id} `); });
                        lines.push(`All listed entities are currently experiencing communication blackout.`);
                        sendAdvResponse(bot, chatId, "Silence List", lines.join(""), msg);
                    }
                    break;
                }

                case "!sudo": {
                    let ni = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ni || isNaN(ni)) { sendAdvResponse(bot, chatId, "Error", "Target identification failed. Please specify a valid user to elevate.", msg); break; }
                    if (!chatState.admins.includes(ni)) { chatState.admins.push(ni); saveStateAndSync(); }
                    sendAdvResponse(bot, chatId, "Elevation Successful", `Target ${ni} has been granted elevated administrative authority. System access expanded.`, msg);
                    break;
                }

                case "!rmsudo": {
                    let ri = msg.reply_to_message ? Number(msg.reply_to_message.from.id) : Number(args[0]);
                    if (!ri || isNaN(ri)) { sendAdvResponse(bot, chatId, "Error", "Target identification failed. Please specify a valid user to demote.", msg); break; }
                    if (OWNER_IDS.includes(ri)) { sendAdvResponse(bot, chatId, "Error", "Unauthorized operation. Cannot revoke authority from the Super Owner.", msg); break; }
                    if (chatState.admins.includes(ri)) { chatState.admins = chatState.admins.filter(id => id !== ri); saveStateAndSync(); }
                    sendAdvResponse(bot, chatId, "Authority Revoked", `Administrative authority has been successfully revoked from target ${ri}. Access privileges have been restricted.`, msg);
                    break;
                }

                case "!on": {
                    sendAdvResponse(bot, chatId, "BM Awakened", "System fully operational and awaiting your command directives.", msg);
                    break;
                }

                case "!autopin": {
                    chatState.autopin[chatId] = true;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Auto-Pin Activated", "Automated pinning sequence engaged. All critical transmissions will be secured to the channel top.", msg);
                    break;
                }

                case "!dautopin": {
                    chatState.autopin[chatId] = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Auto-Pin Deactivated", "Automated pinning sequence deactivated. Transmissions will now flow without securing protocols.", msg);
                    break;
                }

                case "!reactall": {
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "No emoji parameter was provided for the reaction protocol.", msg); break; }
                    const rae = args[0];
                    chatState.reactions[chatId].reactall = { active: true, emoji: rae };
                    if (chatState.reactions[chatId].react) chatState.reactions[chatId].react.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "React All Active", `Global reaction protocol initiated. All incoming transmissions will be annotated with ${rae}.`, msg);
                    break;
                }

                case "!react": {
                    if (!msg.reply_to_message) { sendAdvResponse(bot, chatId, "Error", "Please reply to a target message to establish the reaction context.", msg); break; }
                    if (args.length === 0) { sendAdvResponse(bot, chatId, "Error", "No emoji parameter was provided for the reaction protocol.", msg); break; }
                    const re = args[0];
                    const tu = Number(msg.reply_to_message.from.id);
                    chatState.reactions[chatId].react = { active: true, targetId: tu, emoji: re };
                    if (chatState.reactions[chatId].reactall) chatState.reactions[chatId].reactall.active = false;
                    saveStateAndSync();
                    sendAdvResponse(bot, chatId, "Reaction Locked", `Targeted reaction protocol initiated against user ${tu}. Emoji parameter locked to ${re}.`, msg);
                    break;
                }

                case "!stopreact": {
                    const rs = ensureReactions(chatId);
                    let stopped = false;
                    if (rs.reactall && rs.reactall.active) { rs.reactall.active = false; stopped = true; }
                    if (rs.react && rs.react.active) { rs.react.active = false; stopped = true; }
                    saveStateAndSync();
                    if (stopped) sendAdvResponse(bot, chatId, "Reactions Stopped", "The reaction protocol has been globally deactivated. No further annotations will be processed.", msg);
                    else sendAdvResponse(bot, chatId, "Error", "No active reaction protocols were detected for termination.", msg);
                    break;
                }

                case "!stopall": {
                    const cs2 = chatState[chatId] || {};
                    let stoppedModules = [];

                    if (cs2.nc?.active) { cs2.nc.active = false; stoppedModules.push("Name Change"); }
                    if (cs2.desnc?.active) { cs2.desnc.active = false; stoppedModules.push("Desc Change"); }
                    if (cs2.spam?.active) { cs2.spam.active = false; stoppedModules.push("Spam"); }
                    if (chatState.fdspam?.[chatId]?.active) { chatState.fdspam[chatId].active = false; stoppedModules.push("Forward Spam"); }
                    if (chatState.pollspam?.[chatId]?.active) { chatState.pollspam[chatId].active = false; stoppedModules.push("Poll Spam"); }
                    if (chatState.panelspam?.[chatId]?.active) { chatState.panelspam[chatId].active = false; stoppedModules.push("Panel Spam"); }
                    if (cs2.slide?.active) { cs2.slide.active = false; stoppedModules.push("Slide"); }
                    if (cs2.vn?.active) { cs2.vn.active = false; stoppedModules.push("Voice Note"); }
                    if (cs2.pfp?.active) { cs2.pfp.active = false; stoppedModules.push("PFP Change"); }
                    if (chatState.photospam?.[chatId]?.active) { chatState.photospam[chatId].active = false; stoppedModules.push("Photo Spam"); }
                    if (chatState.reactions?.[chatId]?.reactall?.active) { chatState.reactions[chatId].reactall.active = false; stoppedModules.push("React All"); }
                    if (chatState.reactions?.[chatId]?.react?.active) { chatState.reactions[chatId].react.active = false; stoppedModules.push("React Target"); }

                    saveStateAndSync();

                    if (stoppedModules.length === 0) {
                        sendAdvResponse(bot, chatId, "Emergency Stop", "No active operations were detected. All modules are currently idle.", msg);
                    } else {
                        const lines = [`Successfully terminated the following modules: `];
                        stoppedModules.forEach(m => lines.push(`▪️ ${m} `));
                        lines.push(`Total operations halted: ${stoppedModules.length}. All sequence activities have been successfully suspended.`);
                        sendAdvResponse(bot, chatId, "Emergency Stop Executed", lines.join(""), msg);
                    }
                    break;
                }

                default: break;
            }
        }
    });

    bot.on("callback_query", async (query) => {
        // Prevent the SAME bot from processing the SAME callback twice
        const queryId = query.id;
        if (localProcessedCallbacks.has(queryId)) return;
        localProcessedCallbacks.add(queryId);
        
        const data = query.data || "";
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const fromId = query.from.id;

        if (!isAuthorized(fromId)) {
            bot.answerCallbackQuery(query.id, { text: sc("Unauthorized operation. Administrative clearance required."), show_alert: true }).catch(() => {});
            return;
        }

        if (data.startsWith("pspam:")) {
            bot.answerCallbackQuery(query.id, { text: sc("Button interaction acknowledged.") }).catch(() => {});
            return;
        }

        if (data.startsWith("speed:")) {
            const modKey = data.split(":")[1];
            const modInfo = SPEED_MODULES[modKey];
            
            chatState.wizard[chatId] = { action: "!speed", step: "input", data: { module: modKey } };
            saveStateAndSync();

            await bot.editMessageText(`⏱️ ${sc("DELAY SETTINGS")} - ${sc("Enter delay for")} ${modInfo.name} ${sc("(in ms):")}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "❌ " + sc("Abort"), callback_data: "wizard_cancel" }]] } }).catch(() => {});
            bot.answerCallbackQuery(query.id).catch(() => {});
            return;
        }

        if (data.startsWith("wizard:")) {
            const cmdStr = Buffer.from(data.split(":")[1], 'base64').toString('utf-8');
            
            if ((cmdStr === "!sudo" || cmdStr === "!rmsudo") && !OWNER_IDS.includes(fromId)) {
                bot.answerCallbackQuery(query.id, { text: sc("Only Super Owners can execute this protocol."), show_alert: true }).catch(() => {});
                return;
            }

            if (["!dnc", "!dpfp", "!desdnc", "!dspam", "!dfdspam", "!dpollspam", "!dpanelspam", "!dslide", "!dvn", "!dphotoreply", "!dphotospam", "!dautopin", "!stopreact", "!mutelist", "!on", "!resetphoto", "!stopall"].includes(cmdStr)) {
                executeNoInputAction(cmdStr, chatId, bot);
                bot.answerCallbackQuery(query.id, { text: sc("Executed") }).catch(() => {});
                await bot.editMessageText(`✅ ${sc("SUCCESS")} - ${sc("Command executed successfully.")}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "◀ " + sc("Menu"), callback_data: "menu:main" }, { text: "❌ " + sc("Close"), callback_data: "menu:close" }]] } }).catch(() => {});
                return;
            }
            
            const config = WIZARD_CONFIG[cmdStr];
            if (!config) { bot.answerCallbackQuery(query.id, { text: sc("Configuration not found.") }).catch(() => {}); return; }
            chatState.wizard[chatId] = { action: cmdStr, step: "input", data: {} }; saveStateAndSync();
            await bot.editMessageText(`⚡ ${sc("TERMINAL INPUT REQUIRED")} - ${config.prompt}`, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [[{ text: "❌ " + sc("Abort"), callback_data: "wizard_cancel" }]] } }).catch(() => {});
            bot.answerCallbackQuery(query.id).catch(() => {});
            return;
        }

        if (data === "wizard_confirm") {
            const wiz = chatState.wizard[chatId];
            if (!wiz || wiz.step !== "confirm") { bot.answerCallbackQuery(query.id, { text: sc("Invalid state detected.") }).catch(() => {}); return; }
            await executeWizardAction(wiz.action, wiz.data, chatId, bot);
            chatState.wizard[chatId] = null; saveStateAndSync(); bot.deleteMessage(chatId, messageId).catch(() => {}); bot.answerCallbackQuery(query.id, { text: sc("Initiated!") }).catch(() => {});
            return;
        }

        if (data === "wizard_cancel") {
            chatState.wizard[chatId] = null; saveStateAndSync(); bot.deleteMessage(chatId, messageId).catch(() => {}); bot.answerCallbackQuery(query.id, { text: sc("Operation aborted.") }).catch(() => {});
            return;
        }

        if (data.startsWith("action:")) {
            const parts = data.split(":");
            const action = parts[1];

            switch (action) {
                case "dspam": if (chatState[chatId]?.spam) chatState[chatId].spam.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Spam sequence halted.") }).catch(() => {}); break;
                case "dnc": if (chatState[chatId]?.nc) chatState[chatId].nc.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("NC sequence halted.") }).catch(() => {}); break;
                case "desdnc": if (chatState[chatId]?.desnc) chatState[chatId].desnc.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("DesNC sequence halted.") }).catch(() => {}); break;
                case "dpfp": if (chatState[chatId]?.pfp) chatState[chatId].pfp.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("PFP sequence halted.") }).catch(() => {}); break;
                case "dfdspam": if (chatState.fdspam?.[chatId]) chatState.fdspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Forward spam halted.") }).catch(() => {}); break;
                case "dpollspam": if (chatState.pollspam?.[chatId]) chatState.pollspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Poll spam halted.") }).catch(() => {}); break;
                case "dpanelspam": if (chatState.panelspam?.[chatId]) chatState.panelspam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Panel spam halted.") }).catch(() => {}); break;
                case "dslide": if (chatState[chatId]?.slide) chatState[chatId].slide.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Slide sequence halted.") }).catch(() => {}); break;
                case "dvn": if (chatState[chatId]?.vn) chatState[chatId].vn.active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Voice note halted.") }).catch(() => {}); break;
                case "dphotospam": if (chatState.photospam?.[chatId]) chatState.photospam[chatId].active = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Photo spam halted.") }).catch(() => {}); break;
                case "stopreact":
                    if (chatState.reactions?.[chatId]?.reactall) chatState.reactions[chatId].reactall.active = false;
                    if (chatState.reactions?.[chatId]?.react) chatState.reactions[chatId].react.active = false;
                    saveStateAndSync();
                    bot.answerCallbackQuery(query.id, { text: sc("Reactions halted.") }).catch(() => {});
                    break;
                case "dautopin": chatState.autopin[chatId] = false; saveStateAndSync(); bot.answerCallbackQuery(query.id, { text: sc("Auto-pin halted.") }).catch(() => {}); break;
                case "unmute":
                    const uid = Number(parts[2]);
                    if (uid && chatState.muted?.[chatId]) {
                        chatState.muted[chatId] = chatState.muted[chatId].filter(id => id !== uid);
                        saveStateAndSync();
                    }
                    bot.answerCallbackQuery(query.id, { text: sc("Silence protocol lifted for") + ` ${uid}` }).catch(() => {});
                    break;
                case "rmsudo":
                    const rid = Number(parts[2]);
                    if (rid && chatState.admins.includes(rid) && !OWNER_IDS.includes(rid)) {
                        chatState.admins = chatState.admins.filter(id => id !== rid);
                        saveStateAndSync();
                    }
                    bot.answerCallbackQuery(query.id, { text: sc("Authority revoked from") + ` ${rid}` }).catch(() => {});
                    break;
                default: bot.answerCallbackQuery(query.id).catch(() => {});
            }
            return;
        }

        if (data === "menu:close") {
            bot.answerCallbackQuery(query.id, { text: sc("Panel closed.") }).catch(() => {});
            bot.deleteMessage(chatId, messageId).catch(() => {});
            return;
        }

        if (data === "menu:main") {
            bot.answerCallbackQuery(query.id).catch(() => {});
            bot.editMessageText(buildMainMenuText(), {
                chat_id: chatId, message_id: messageId,
                reply_markup: buildMainMenuKeyboard()
            }).catch(() => {});
            return;
        }

        if (data.startsWith("menu:")) {
            const sectionId = data.split(":")[1];
            if (sectionId === "status") {
                bot.answerCallbackQuery(query.id, { text: sc("Refreshing status data...") }).catch(() => {});
                bot.editMessageText(buildStatusText(chatId), {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: buildSectionKeyboard("status")
                }).catch(() => {});
                return;
            }
            if (MENU_SECTIONS[sectionId]) {
                bot.answerCallbackQuery(query.id).catch(() => {});
                bot.editMessageText(buildSectionText(sectionId, chatId), {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: buildSectionKeyboard(sectionId)
                }).catch(() => {});
            } else {
                bot.answerCallbackQuery(query.id, { text: sc("Requested section not found.") }).catch(() => {});
            }
            return;
        }

        bot.answerCallbackQuery(query.id).catch(() => {});
    });

    async function executeNoInputAction(action, chatId, bot) {
        const cs = chatState[chatId] || {};
        if (action === "!dspam" && cs.spam) cs.spam.active = false;
        if (action === "!dnc" && cs.nc) cs.nc.active = false;
        if (action === "!desdnc" && cs.desnc) cs.desnc.active = false;
        if (action === "!dpfp" && cs.pfp) cs.pfp.active = false;
        if (action === "!dfdspam") ensureFdspam(chatId).active = false;
        if (action === "!dpollspam") ensurePollSpam(chatId).active = false;
        if (action === "!dpanelspam") ensurePanelSpam(chatId).active = false;
        if (action === "!dslide" && cs.slide) cs.slide.active = false;
        if (action === "!dvn" && cs.vn) cs.vn.active = false;
        if (action === "!dphotoreply") chatState.photoreply[chatId] = {};
        if (action === "!dphotospam") ensurePhotoSpam(chatId).active = false;
        if (action === "!dautopin") chatState.autopin[chatId] = false;
        if (action === "!stopreact") { chatState.reactions[chatId].reactall = { active: false }; chatState.reactions[chatId].react = { active: false }; }
        if (action === "!resetphoto") chatState.photoreload[chatId] = [];
        if (action === "!on") {
            const m = await bot.sendMessage(chatId, `👁️ ${sc("System Online - Awaiting your command directives.")}`);
            if (m && m.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, m.message_id).catch(()=>{});
        }
        if (action === "!mutelist") { 
            const mlc = ensureList(chatId, 'muted'); 
            let txt;
            if (mlc.length === 0) txt = `🔇 ${sc("No active silence protocols detected.")}`;
            else txt = `📋 ${sc("Active Silence Protocols:")} ${mlc.map((id, i) => `${i+1}. \`${id}\``).join(' ')}`;
            
            const m = await bot.sendMessage(chatId, txt);
            if (m && m.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, m.message_id).catch(()=>{});
        }
        if (action === "!stopall") {
            if (cs.nc) cs.nc.active = false; if (cs.desnc) cs.desnc.active = false; if (cs.spam) cs.spam.active = false;
            if (cs.slide) cs.slide.active = false; if (cs.vn) cs.vn.active = false; if (cs.pfp) cs.pfp.active = false;
            if (chatState.fdspam?.[chatId]) chatState.fdspam[chatId].active = false; if (chatState.pollspam?.[chatId]) chatState.pollspam[chatId].active = false;
            if (chatState.panelspam?.[chatId]) chatState.panelspam[chatId].active = false; if (chatState.photospam?.[chatId]) chatState.photospam[chatId].active = false;
            chatState.autopin[chatId] = false; chatState.photoreply[chatId] = {}; chatState.replies[chatId] = {};
            chatState.reactions[chatId] = { reactall: { active: false }, react: { active: false } };
            const m = await bot.sendMessage(chatId, `🛑 ${sc("Emergency Stop Executed - All active modules have been successfully terminated. System is now idle.")}`);
            if (m && m.message_id && chatState.autopin[chatId]) bot.pinChatMessage(chatId, m.message_id).catch(()=>{});
        }
        saveStateAndSync();
    }

    async function executeWizardAction(action, data, chatId, bot) {
        const cs = chatState[chatId] || {};
        const input = data.text || "";
        const args = input.split("|").map(s => s.trim());
        let successMsg = `⚡ ${sc("Protocol Initiated - Module has been successfully activated.")}`;

        switch (action) {
            case "!reply": 
                if (Number(args[0]) && args[1]) ensureReplies(chatId)[Number(args[0])] = args[1]; 
                saveStateAndSync();
                successMsg = `🔊 ${sc("Echo Imprinted")} - ${sc("Automated response protocol established for user")} ${args[0]}.`;
                break;
            case "!dreply": 
                if (ensureReplies(chatId)[Number(input)]) delete ensureReplies(chatId)[Number(input)]; 
                saveStateAndSync();
                successMsg = `🔇 ${sc("Echo Broken")} - ${sc("Automated response protocol terminated for user")} ${input}.`;
                break;
            case "!speed": 
                if (data.module) {
                    const ms = parseInt(input);
                    if (!isNaN(ms)) {
                        const key = SPEED_MODULES[data.module]?.key || data.module;
                        chatState.delay[key] = Math.max(10, ms);
                        saveStateAndSync();
                        successMsg = `⏱️ ${sc("Velocity Adjusted")} - ${sc("Execution interval for module")} ${key} ${sc("recalibrated to")} ${ms}ms.`;
                    } else {
                        successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid interval parameter provided. Please enter numerical values only.")}`;
                    }
                }
                break;
            case "!nc": 
                if (args.length === 0) { successMsg = `⚠️ ${sc("Error")} - ${sc("Name parameters required for sequence initiation.")}`; break; }
                cs.nc = { active: true, texts: args }; 
                globalNcNextRun[chatId] = 0;
                saveStateAndSync(); 
                runNC(chatId); 
                successMsg = `🌀 ${sc("Reality Warp Initiated")} - ${sc("Name alteration protocol is now active.")}`;
                break;
            case "!desnc": 
                if (args.length === 0) { successMsg = `⚠️ ${sc("Error")} - ${sc("Description parameters required for sequence initiation.")}`; break; }
                cs.desnc = { active: true, texts: args }; 
                saveStateAndSync(); 
                runDescNC(chatId); 
                successMsg = `🌪️ ${sc("Description Warp Initiated")} - ${sc("Description alteration protocol is now active.")}`;
                break;
            case "!spam": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No textual payload provided for the spam sequence.")}`; break; }
                cs.spam = { active: true, text: input }; 
                saveStateAndSync(); 
                runSpam(chatId); 
                successMsg = `💣 ${sc("Chaos Barrage Initiated")} - ${sc("Spam protocol is now active.")}`;
                break;
            case "!fdspam": {
                if (args.length < 2) { 
                    successMsg = `⚠️ ${sc("Error")} - ${sc("Required format: SOURCE_CHAT_ID | MESSAGE_ID")} ${sc("Example:")} -1001234567 | 42`; 
                    break; 
                }
                const srcChatId = Number(args[0]);
                const srcMsgId = Number(args[1]);
                if (isNaN(srcChatId) || isNaN(srcMsgId)) {
                    successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid chat identification or message parameter provided.")}`;
                    break;
                }
                const fd = ensureFdspam(chatId);
                fd.active = true;
                fd.fromChatId = srcChatId;
                fd.messageId = srcMsgId;
                saveStateAndSync();
                runFdspam(chatId);
                successMsg = `📤 ${sc("Forward Spam Initiated")} - ${sc("Source:")} ${srcChatId} | ${sc("Message:")} ${srcMsgId} ${sc("Execution interval:")} ${chatState.delay.fdspam || 2000}ms`;
                break;
            }
            case "!pollspam": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No poll question provided for sequence initiation.")}`; break; }
                const ps = ensurePollSpam(chatId); 
                ps.active = true; ps.question = input; 
                saveStateAndSync(); 
                runPollSpam(chatId); 
                successMsg = `📊 ${sc("Poll Spam Initiated")} - ${sc("Poll barrage protocol is now active.")}`;
                break;
            case "!panelspam": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No textual payload provided for the panel spam sequence.")}`; break; }
                const ps2 = ensurePanelSpam(chatId); 
                ps2.active = true; ps2.question = input; 
                saveStateAndSync(); 
                runPanelSpam(chatId); 
                successMsg = `🔲 ${sc("Panel Spam Initiated")} - ${sc("Button barrage protocol is now active.")}`;
                break;
            case "!slide": 
                if (Number(args[0]) && args.length > 1) { 
                    cs.slide = { active: true, targetId: Number(args[0]), replyToMsgId: null, texts: args.slice(1) }; 
                    saveStateAndSync(); 
                    runSlide(chatId); 
                    successMsg = `📜 ${sc("Infinite Scroll Initiated")} - ${sc("Slide protocol active for target")} ${args[0]}.`;
                } else {
                    successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid syntax. Required format: ID | Text1 | Text2")}`;
                }
                break;
            case "!vn": 
                if (Number(args[0]) && args[1]) { 
                    cs.vn = { active: true, text: args[1], replyToMsgId: null, targetId: Number(args[0]) }; 
                    saveStateAndSync(); 
                    runVN(chatId); 
                    successMsg = `🎙️ ${sc("Void Echo Initiated")} - ${sc("Voice note protocol active for target")} ${args[0]}.`;
                } else {
                    successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid syntax. Required format: ID | Text")}`;
                }
                break;
            case "!pfp": 
                if (data.photo) { 
                    cs.pfp = { active: true }; 
                    saveStateAndSync(); 
                    runPFP(chatId, data.photo); 
                    successMsg = `🖼️ ${sc("Illusion Weave Initiated")} - ${sc("Profile image alteration protocol is now active.")}`;
                } 
                break;
            case "!photospam": 
                if (data.photo) { 
                    ensurePhotoSpam(chatId); 
                    chatState.photospam[chatId] = { active: true, photoFileId: data.photo }; 
                    saveStateAndSync(); 
                    runPhotoSpam(chatId); 
                    successMsg = `📸 ${sc("Image Storm Initiated")} - ${sc("Photo spam protocol is now active.")}`;
                } 
                break;
            case "!photoreload": {
                if (!data.photo) { successMsg = `⚠️ ${sc("Error")} - ${sc("No image data detected for armory storage.")}`; break; }
                const slot = parseInt(input);
                if (isNaN(slot) || slot < 1 || slot > 5) { successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid slot parameter. Please select a value between 1 and 5.")}`; break; }
                const pi = slot - 1;
                const ph = getReloadPhotos(chatId);
                while (ph.length <= pi) ph.push(null);
                ph[pi] = { fileId: data.photo, index: slot };
                chatState.photoreload[chatId] = ph;
                saveStateAndSync();
                const vc = ph.filter(p => p !== null).length;
                successMsg = `📦 ${sc("Armory Loaded")} - ${sc("Slot")} ${slot} ${sc("successfully populated. Current arsenal capacity:")} ${vc}/5 ${sc("photographs.")}`;
                break;
            }
            case "!mute": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No target identification provided for silence protocol.")}`; break; }
                const ml = ensureList(chatId, 'muted'); 
                if (!ml.includes(Number(input))) ml.push(Number(input)); 
                saveStateAndSync(); 
                successMsg = `🔇 ${sc("Eternal Silence Enforced")} - ${sc("Target")} ${input} ${sc("has been successfully silenced.")}`;
                break;
            case "!unmute": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No target identification provided for protocol termination.")}`; break; }
                chatState.muted[chatId] = ensureList(chatId, 'muted').filter(id => id !== Number(input)); 
                saveStateAndSync(); 
                successMsg = `🔊 ${sc("Silence Broken")} - ${sc("Target")} ${input} ${sc("has been released from the silence protocol.")}`;
                break;
            case "!sudo": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No target identification provided for authority elevation.")}`; break; }
                if (!chatState.admins.includes(Number(input))) chatState.admins.push(Number(input)); 
                saveStateAndSync(); 
                successMsg = `👑 ${sc("Elevation Successful")} - ${sc("Target")} ${input} ${sc("has been granted elevated administrative authority.")}`;
                break;
            case "!rmsudo": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No target identification provided for authority revocation.")}`; break; }
                chatState.admins = chatState.admins.filter(id => id !== Number(input)); 
                saveStateAndSync(); 
                successMsg = `💀 ${sc("Authority Revoked")} - ${sc("Target")} ${input} ${sc("has been demoted to standard clearance level.")}`;
                break;
            case "!reactall": 
                if (!input) { successMsg = `⚠️ ${sc("Error")} - ${sc("No emoji parameter provided for reaction protocol.")}`; break; }
                chatState.reactions[chatId].reactall = { active: true, emoji: input }; 
                saveStateAndSync(); 
                successMsg = `🎭 ${sc("Divine Reaction Initiated")} - ${sc("All incoming transmissions will be annotated with")} ${input}.`;
                break;
            case "!react": 
                if (Number(args[0]) && args[1]) chatState.reactions[chatId].react = { active: true, targetId: Number(args[0]), emoji: args[1] }; 
                saveStateAndSync(); 
                successMsg = `🎯 ${sc("Target Reaction Initiated")} - ${sc("Reacting to target")} ${args[0]} ${sc("with annotation")} ${args[1]}.`;
                break;
            case "!photoreply": {
                if (!data.text) { successMsg = `⚠️ ${sc("Error")} - ${sc("No operational parameters provided.")}`; break; }
                const pl2 = getReloadPhotos(chatId);
                if (pl2.filter(p => p !== null).length === 0) { successMsg = `⚠️ ${sc("Error")} - ${sc("Armory empty. Please load photographs using the photoreload command first.")}`; break; }
                if (Number(args[0]) && args[1]) {
                    const tgu = Number(args[0]);
                    const ct = args[1] || "🔥";
                    ensurePhotoReply(chatId)[tgu] = { active: true, caption: ct };
                    saveStateAndSync();
                    successMsg = `📸 ${sc("Photo Retaliation Active")} - ${sc("Target")} ${tgu}. ${sc("Every subsequent message will be countered with an image payload.")}`;
                } else {
                    successMsg = `⚠️ ${sc("Error")} - ${sc("Invalid syntax. Required format: ID | Caption")}`;
                }
                break;
            }
        }
        
        const sentMsg = await bot.sendMessage(chatId, successMsg);
        if (sentMsg && sentMsg.message_id && chatState.autopin[chatId]) {
            bot.pinChatMessage(chatId, sentMsg.message_id).catch(() => {});
        }
    }
}

console.log("BM ULTIMATE V6 - SECURE ADMIN ONLY READY");