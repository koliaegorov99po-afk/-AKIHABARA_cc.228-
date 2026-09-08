const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dbPath = path.join(__dirname, 'akihabara.db');
const db = new sqlite3.Database(dbPath);

const MAIN_IMAGE = '/banner.png';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'akihabara_secret_key',
    resave: false,
    saveUninitialized: true,
}));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, status TEXT, avatarUrl TEXT, referralCode TEXT, invites INTEGER DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, avatarUrl TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS exchangers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, photoUrl TEXT, telegramUrl TEXT, description TEXT, owner TEXT, can_post INTEGER DEFAULT 0, can_ads INTEGER DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, photoUrl TEXT, telegramUrl TEXT, description TEXT, owner TEXT, can_post INTEGER DEFAULT 0, can_ads INTEGER DEFAULT 0)");
    db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES ('koliaegorov99po-afk', 'admin', ?)", [MAIN_IMAGE]);
});

app.post('/login', (req, res) => {
    const username = req.body.username ? req.body.username.trim().replace('@', '') : '';
    if (!username) return res.redirect('/');
    req.session.username = username;
    
    const role = (username.toLowerCase() === 'koliaegorov99po-afk') ? 'admin' : 'user';

    db.run("INSERT INTO users (username, status, avatarUrl) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET status=?", 
        [username, role, MAIN_IMAGE, role], () => {
        res.redirect('/');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.get("SELECT * FROM users WHERE username = ?", [req.session.username], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

app.get('/api/exchangers', (req, res) => {
    db.all("SELECT * FROM exchangers", (err, exchangers) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(exchangers);
    });
});

app.get('/api/shops', (req, res) => {
    db.all("SELECT * FROM shops", (err, shops) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(shops);
    });
});

// Админ маршруты управления
app.post('/api/admin/add-exchanger', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.get("SELECT status FROM users WHERE username = ?", [req.session.username], (err, user) => {
        if (!user || user.status !== 'admin') return res.status(403).json({ error: 'Access denied' });
        
        const { name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
        db.run("INSERT INTO exchangers (name, photoUrl, telegramUrl, description, owner, can_post, can_ads) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [name, photoUrl || MAIN_IMAGE, telegramUrl, description, owner, can_post ? 1 : 0, can_ads ? 1 : 0], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    });
});

app.post('/api/admin/add-shop', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.get("SELECT status FROM users WHERE username = ?", [req.session.username], (err, user) => {
        if (!user || user.status !== 'admin') return res.status(403).json({ error: 'Access denied' });
        
        const { name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
        db.run("INSERT INTO shops (name, photoUrl, telegramUrl, description, owner, can_post, can_ads) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [name, photoUrl || MAIN_IMAGE, telegramUrl, description, owner, can_post ? 1 : 0, can_ads ? 1 : 0], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    });
});

app.get('/', (req, res) => {
    if (!req.session.username) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>$AKIHABARA_cc.228$ - Авторизация</title>
                <style>
                    * { box-sizing: border-box; }
                    body { margin: 0; padding: 20px; background: #000 url('${MAIN_IMAGE}') no-repeat center center fixed; background-size: cover; min-height: 100vh; width: 100vw; display: flex; justify-content: center; align-items: center; font-family: sans-serif; overflow-y: auto; }
                    body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 0; }
                    .login-box { position: relative; z-index: 1; background: rgba(20,20,20,0.95); padding: 30px; border-radius: 12px; border: 2px solid #ff0055; box-shadow: 0 0 25px #ff0055; text-align: center; width: 90%; max-width: 320px; }
                    h2 { color: #00eaff; margin-bottom: 20px; text-shadow: 0 0 10px #00eaff; font-size: 1.4em; }
                    input { width: 100%; padding: 12px; margin-bottom: 20px; background: #000; border: 1px solid #ff0055; color: #00eaff; border-radius: 6px; font-size: 1em; outline: none; }
                    button { width: 100%; padding: 12px; background: #ff0055; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1em; }
                </style>
            </head>
            <body>
                <div class="login-box">
                    <h2>$AKIHABARA$</h2>
                    <form method="POST" action="/login">
                        <input type="text" name="username" placeholder="Ваш Telegram ник" required autocomplete="off">
                        <button type="submit">Войти</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$AKIHABARA_cc.228$ - Premium Platform</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                body {
                    background: #000 url('${MAIN_IMAGE}') no-repeat center center fixed;
                    background-size: cover;
                    min-height: 100vh;
                    width: 100vw;
                    color: #fff;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    overflow-y: auto;
                    padding: 20px 0;
                }
                body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 0; }

                .central-wrapper {
                    position: relative; z-index: 2; width: 95%; max-width: 800px;
                    background: rgba(15, 15, 15, 0.90); border: 2px solid #ff0055; border-radius: 12px;
                    box-shadow: 0 0 30px rgba(255,0,85,0.5); display: flex; flex-direction: column;
                    height: 85vh; min-height: 500px; max-height: 900px; padding: 20px; backdrop-filter: blur(12px);
                }

                .menu-tabs {
                    display: flex; gap: 10px; margin-bottom: 15px; background: rgba(0,0,0,0.6);
                    padding: 8px; border-radius: 8px; border: 1px solid #333; justify-content: center; flex-wrap: wrap;
                }
                .tab-btn {
                    background: #222; border: 1px solid #444; color: #fff; padding: 8px 18px;
                    border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: 0.3s;
                }
                .tab-btn.active {
                    background: #ff0055; border-color: #ff0055; box-shadow: 0 0 10px #ff0055; color: #fff;
                }
                .tab-btn:hover { border-color: #00eaff; color: #00eaff; }

                .section-content { display: none; flex: 1; flex-direction: column; overflow-y: auto; }
                .section-content.active { display: flex; }

                .list-box-title {
                    text-align: center; color: #00eaff; font-size: 1.15em; margin-bottom: 15px;
                    text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 8px;
                }

                #messages-box { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 10px; }
                .msg-card { display: flex; gap: 10px; max-width: 85%; background: rgba(25,25,25,0.85); padding: 8px 12px; border-radius: 8px; border: 1px solid #333; position: relative; }
                .msg-card.own { align-self: flex-end; background: rgba(255, 0, 85, 0.15); border-color: #ff0055; flex-direction: row-reverse; }
                .msg-card img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #00eaff; flex-shrink: 0; }
                .msg-content { flex: 1; min-width: 0; }
                .msg-info { display: flex; justify-content: space-between; font-size: 0.7em; color: #00eaff; margin-bottom: 3px; }
                .msg-text { font-size: 0.9em; word-break: break-word; line-height: 1.3; }
                .msg-time { font-size: 0.6em; color: #777; margin-left: 6px; }

                .chat-input-box { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid #333; position: relative; }
                .chat-input { flex: 1; background: #000; border: 1px solid #444; padding: 10px; border-radius: 6px; color: #fff; outline: none; font-size: 0.9em; min-width: 0; }
                .chat-input:focus { border-color: #00eaff; }
                .action-icon-btn { background: #222; border: 1px solid #444; color: #00eaff; padding: 0 12px; border-radius: 6px; cursor: pointer; font-size: 1.1em; }

                #emoji-picker { display: none; position: absolute; bottom: 65px; left: 0; background: #111; border: 1px solid #ff0055; border-radius: 8px; padding: 8px; grid-template-columns: repeat(6, 1fr); gap: 5px; z-index: 10; box-shadow: 0 0 15px rgba(0,0,0,0.9); }
                #emoji-picker.open { display: grid; }
                .emoji-opt { font-size: 1.2em; cursor: pointer; text-align: center; padding: 3px; border-radius: 4px; }
                .emoji-opt:hover { background: rgba(255,0,85,0.3); }

                .exchangers-grid, .shops-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
                .ex-card, .shop-card { background: rgba(20,20,20,0.85); border: 1px solid #333; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; }
                .ex-card:hover, .shop-card:hover { border-color: #00eaff; }
                .ex-info, .shop-info { display: flex; align-items: center; gap: 12px; }
                .ex-info img, .shop-info img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #ff0055; }
                .ex-tg-btn { background: #0088cc; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 0.8em; font-weight: bold; text-decoration: none; }
                
                .admin-panel { background: rgba(30,0,20,0.9); border: 1px dashed #ff0055; padding: 15px; border-radius: 8px; margin-top: 15px; display: none; text-align: left; }
                .admin-panel input, .admin-panel textarea { width: 100%; padding: 8px; margin-bottom: 10px; background: #000; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 0.85em; }
                .admin-panel label { font-size: 0.8em; color: #00eaff; display: block; margin-bottom: 5px; }
                .admin-btn { background: #00eaff; color: #000; border: none; padding: 8px 15px; font-weight: bold; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="central-wrapper">
                <div class="menu-tabs">
                    <button class="tab-btn active" onclick="switchTab('chat', this)">Чат & Игры</button>
                    <button class="tab-btn" onclick="switchTab('exchangers', this)">Обменники</button>
                    <button class="tab-btn" onclick="switchTab('shops', this)">Магазины</button>
                    <button class="tab-btn" onclick="switchTab('profile', this)">Профиль</button>
                </div>

                <div id="chat" class="section-content active">
                    <div class="list-box-title">Киберпанк Чат</div>
                    <div id="messages-box"></div>
                    <div class="chat-input-box">
                        <button class="action-icon-btn" onclick="toggleEmojiPicker()"><i class="fa-regular fa-face-smile"></i></button>
                        <input type="text" id="msg-input" class="chat-input" placeholder="Введите сообщение..." autocomplete="off">
                        <button class="action-icon-btn" onclick="sendMessage()"><i class="fa-solid fa-paper-plane"></i></button>
                        
                        <div id="emoji-picker">
                            <span class="emoji-opt" onclick="addEmoji('🔥')">🔥</span>
                            <span class="emoji-opt" onclick="addEmoji('🚀')">🚀</span>
                            <span class="emoji-opt" onclick="addEmoji('💎')">💎</span>
                            <span class="emoji-opt" onclick="addEmoji('😎')">😎</span>
                            <span class="emoji-opt" onclick="addEmoji('⚡')">⚡</span>
                            <span class="emoji-opt" onclick="addEmoji('💀')">💀</span>
                            <span class="emoji-opt" onclick="addEmoji('🎉')">🎉</span>
                            <span class="emoji-opt" onclick="addEmoji('👍')">👍</span>
                            <span class="emoji-opt" onclick="addEmoji('❤️')">❤️</span>
                            <span class="emoji-opt" onclick="addEmoji('🤖')">🤖</span>
                            <span class="emoji-opt" onclick="addEmoji('🍒')">🍒</span>
                            <span class="emoji-opt" onclick="addEmoji('💰')">💰</span>
                        </div>
                    </div>
                </div>

                <div id="exchangers" class="section-content">
                    <div class="list-box-title">Список доверенных обменников</div>
                    <div class="exchangers-grid" id="exchangers-list"></div>
                </div>

                <div id="shops" class="section-content">
                    <div class="list-box-title">Список доверенных магазинов</div>
                    <div class="shops-grid" id="shops-list"></div>
                </div>

                <div id="profile" class="section-content">
                    <div class="list-box-title">Ваш Профиль</div>
                    <div style="text-align: center; padding: 15px;">
                        <img src="${MAIN_IMAGE}" style="width: 70px; height: 70px; border-radius: 50%; border: 2px solid #00eaff; object-fit: cover; margin-bottom: 10px;">
                        <h3 id="user-name" style="color: #00eaff;">Загрузка...</h3>
                        <p id="user-role" style="color: #ff0055; font-size: 0.8em; margin-top: 5px;">СТАТУС</p>
                        <div style="margin-top: 15px; background: #000; padding: 10px; border-radius: 6px; border: 1px solid #00eaff;">
                            <p style="font-size: 0.75em; color: #00eaff; margin-bottom: 5px;">Ваша реферальная ссылка:</p>
                            <span id="ref-link" style="font-size: 0.7em; color: #aaa; word-break: break-all;">Загрузка...</span>
                        </div>
                        
                        <!-- ПАНЕЛЬ АДМИНА -->
                        <div id="admin-section" class="admin-panel">
                            <h4 style="color: #ff0055; margin-bottom: 10px; text-align:center;">Управление сайтом (Админ)</h4>
                            
                            <hr style="border-color: #444; margin: 10px 0;">
                            <p style="color: #00eaff; font-size: 0.85em; margin-bottom: 5px;">Добавить обменник / выдать права</p>
                            <input type="text" id="ex-name" placeholder="Название обменника">
                            <input type="text" id="ex-url" placeholder="Ссылка на Telegram (например https://t.me/...)">
                            <input type="text" id="ex-owner" placeholder="Ник владельца (@username)">
                            <textarea id="ex-desc" placeholder="Описание / Курс"></textarea>
                            <div style="text-align:left; margin-bottom:8px;">
                                <label><input type="checkbox" id="ex-post"> Разрешить посты</label>
                                <label><input type="checkbox" id="ex-ads"> Разрешить рекламу</label>
                            </div>
                            <button class="admin-btn" onclick="addExchanger()">Добавить обменник</button>

                            <hr style="border-color: #444; margin: 15px 0 10px 0;">
                            <p style="color: #00eaff; font-size: 0.85em; margin-bottom: 5px;">Добавить магазин / выдать права</p>
                            <input type="text" id="shop-name" placeholder="Название магазина">
                            <input type="text" id="shop-url" placeholder="Ссылка на Telegram">
                            <input type="text" id="shop-owner" placeholder="Ник владельца (@username)">
                            <textarea id="shop-desc" placeholder="Описание магазина"></textarea>
                            <div style="text-align:left; margin-bottom:8px;">
                                <label><input type="checkbox" id="shop-post"> Разрешить посты</label>
                                <label><input type="checkbox" id="shop-ads"> Разрешить рекламу</label>
                            </div>
                            <button class="admin-btn" onclick="addShop()">Добавить магазин</button>
                        </div>

                        <a href="/logout" style="display: block; margin-top: 15px; padding: 10px; background: #ff0055; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.9em; text-align: center;">Выйти из аккаунта</a>
                    </div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let currentUser = null;

                async function loadUserData() {
                    const res = await fetch('/api/user');
                    if (res.ok) {
                        currentUser = await res.json();
                        document.getElementById('user-name').innerText = '@' + currentUser.username;
                        document.getElementById('user-role').innerText = currentUser.status.toUpperCase();
                        document.getElementById('ref-link').innerText = window.location.origin + '?ref=' + currentUser.username;
                        
                        if (currentUser.status === 'admin') {
                            document.getElementById('admin-section').style.display = 'block';
                        }
                    }
                }
                loadUserData();

                function switchTab(tabId, el) {
                    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.getElementById(tabId).classList.add('active');
                    el.classList.add('active');
                    if(tabId === 'exchangers') loadExchangers();
                    if(tabId === 'shops') loadShops();
                }

                function toggleEmojiPicker() {
                    document.getElementById('emoji-picker').classList.toggle('open');
                }

                function addEmoji(emoji) {
                    const input = document.getElementById('msg-input');
                    input.value += emoji;
                    document.getElementById('emoji-picker').classList.remove('open');
                    input.focus();
                }

                function sendMessage() {
                    const input = document.getElementById('msg-input');
                    const text = input.value.trim();
                    if (!text) return;
                    socket.emit('chat_message', { text });
                    input.value = '';
                }

                document.getElementById('msg-input').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendMessage();
                });

                function appendMessage(msg) {
                    const box = document.getElementById('messages-box');
                    const isOwn = currentUser && msg.username === currentUser.username;
                    const div = document.createElement('div');
                    div.className = 'msg-card' + (isOwn ? ' own' : '');
                    div.innerHTML = \`
                        <img src="\${msg.avatarUrl || '${MAIN_IMAGE}'}" alt="av">
                        <div class="msg-content">
                            <div class="msg-info">
                                <span>@\${msg.username}</span>
                                <span class="msg-time">\${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div class="msg-text">\${msg.text}</div>
                        </div>
                    \`;
                    box.appendChild(div);
                    box.scrollTop = box.scrollHeight;
                }

                async function loadExchangers() {
                    const res = await fetch('/api/exchangers');
                    const list = await res.json();
                    const container = document.getElementById('exchangers-list');
                    container.innerHTML = '';
                    if(list.length === 0) {
                        container.innerHTML = '<p style="color:#888; text-align:center;">Обменники пока не добавлены</p>';
                        return;
                    }
                    list.forEach(ex => {
                        let badges = '';
                        if(ex.can_post) badges += '<span style="background:#00eaff;color:#000;font-size:0.6em;padding:2px 5px;border-radius:3px;margin-right:4px;">Посты: ВКЛ</span>';
                        if(ex.can_ads) badges += '<span style="background:#ff0055;color:#fff;font-size:0.6em;padding:2px 5px;border-radius:3px;">Реклама: ВКЛ</span>';

                        container.innerHTML += \`
                            <div class="ex-card">
                                <div class="ex-info">
                                    <img src="${MAIN_IMAGE}" alt="ex">
                                    <div>
                                        <h4 style="color: #00eaff; font-size: 0.95em;">\${ex.name} <span style="font-size:0.7em;color:#aaa;">(Владелец: @\${ex.owner || 'админ'})</span></h4>
                                        <p style="font-size: 0.75em; color: #aaa; margin: 2px 0;">\${ex.description}</p>
                                        <div>\${badges}</div>
                                    </div>
                                </div>
                                <a href="\${ex.telegramUrl}" target="_blank" class="ex-tg-btn">Перейти</a>
                            </div>
                        \`;
                    });
                }

                async function loadShops() {
                    const res = await fetch('/api/shops');
                    const list = await res.json();
                    const container = document.getElementById('shops-list');
                    container.innerHTML = '';
                    if(list.length === 0) {
                        container.innerHTML = '<p style="color:#888; text-align:center;">Магазины пока не добавлены</p>';
                        return;
                    }
                    list.forEach(sh => {
                        let badges = '';
                        if(sh.can_post) badges += '<span style="background:#00eaff;color:#000;font-size:0.6em;padding:2px 5px;border-radius:3px;margin-right:4px;">Посты: ВКЛ</span>';
                        if(sh.can_ads) badges += '<span style="background:#ff0055;color:#fff;font-size:0.6em;padding:2px 5px;border-radius:3px;">Реклама: ВКЛ</span>';

                        container.innerHTML += \`
                            <div class="shop-card">
                                <div class="shop-info">
                                    <img src="${MAIN_IMAGE}" alt="shop">
                                    <div>
                                        <h4 style="color: #00eaff; font-size: 0.95em;">\${sh.name} <span style="font-size:0.7em;color:#aaa;">(Владелец: @\${sh.owner || 'админ'})</span></h4>
                                        <p style="font-size: 0.75em; color: #aaa; margin: 2px 0;">\${sh.description}</p>
                                        <div>\${badges}</div>
                                    </div>
                                </div>
                                <a href="\${sh.telegramUrl}" target="_blank" class="ex-tg-btn">Перейти</a>
                            </div>
                        \`;
                    });
                }

                async function addExchanger() {
                    const data = {
                        name: document.getElementById('ex-name').value,
                        telegramUrl: document.getElementById('ex-url').value,
                        owner: document.getElementById('ex-owner').value.replace('@',''),
                        description: document.getElementById('ex-desc').value,
                        can_post: document.getElementById('ex-post').checked,
                        can_ads: document.getElementById('ex-ads').checked
                    };
                    const res = await fetch('/api/admin/add-exchanger', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if(res.ok) {
                        alert('Обменник успешно добавлен!');
                        loadExchangers();
                        document.getElementById('ex-name').value = '';
                        document.getElementById('ex-url').value = '';
                        document.getElementById('ex-owner').value = '';
                        document.getElementById('ex-desc').value = '';
                    } else {
                        alert('Ошибка добавления');
                    }
                }

                async function addShop() {
                    const data = {
                        name: document.getElementById('shop-name').value,
                        telegramUrl: document.getElementById('shop-url').value,
                        owner: document.getElementById('shop-owner').value.replace('@',''),
                        description: document.getElementById('shop-desc').value,
                        can_post: document.getElementById('shop-post').checked,
                        can_ads: document.getElementById('shop-ads').checked
                    };
                    const res = await fetch('/api/admin/add-shop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if(res.ok) {
                        alert('Магазин успешно добавлен!');
                        loadShops();
                        document.getElementById('shop-name').value = '';
                        document.getElementById('shop-url').value = '';
                        document.getElementById('shop-owner').value = '';
                        document.getElementById('shop-desc').value = '';
                    } else {
                        alert('Ошибка добавления');
                    }
                }

                socket.on('chat_history', (messages) => {
                    const box = document.getElementById('messages-box');
                    box.innerHTML = '';
                    messages.forEach(msg => appendMessage(msg));
                });

                socket.on('new_message', (msg) => {
                    appendMessage(msg);
                });
            </script>
        </body>
        </html>
    `);
});

io.on('connection', (socket) => {
    db.all("SELECT * FROM messages ORDER BY timestamp ASC LIMIT 50", (err, rows) => {
        if (!err) socket.emit('chat_history', rows);
    });

    socket.on('chat_message', (data) => {
        db.run("INSERT INTO messages (username, avatarUrl, text) VALUES (?, ?, ?)", ['User', MAIN_IMAGE, data.text], function(err) {
            if (!err) {
                io.emit('new_message', { id: this.lastID, username: 'User', avatarUrl: MAIN_IMAGE, text: data.text, timestamp: new Date() });
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
