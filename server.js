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
    db.run("CREATE TABLE IF NOT EXISTS exchangers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, photoUrl TEXT, telegramUrl TEXT, description TEXT)");
    db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES ('koliaegorov99po-afk', 'admin', 'https://i.ibb.co/6y4G8s5/265.png')");
});

app.post('/login', (req, res) => {
    const username = req.body.username ? req.body.username.trim().replace('@', '') : '';
    if (!username) return res.redirect('/');
    req.session.username = username;
    db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES (?, 'user', 'https://i.ibb.co/6y4G8s5/265.png')", [username], () => {
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
                    body { margin: 0; padding: 0; background: url('https://i.ibb.co/6y4G8s5/265.png') no-repeat center center fixed; background-size: cover; height: 100vh; display: flex; justify-content: center; align-items: center; font-family: sans-serif; }
                    body::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 0; }
                    .login-box { position: relative; z-index: 1; background: rgba(20,20,20,0.9); padding: 40px; border-radius: 12px; border: 2px solid #ff0055; box-shadow: 0 0 25px #ff0055; text-align: center; width: 320px; }
                    h2 { color: #00eaff; margin-bottom: 20px; text-shadow: 0 0 10px #00eaff; }
                    input { width: 100%; padding: 12px; margin-bottom: 20px; background: #000; border: 1px solid #ff0055; color: #00eaff; border-radius: 6px; font-size: 1em; box-sizing: border-box; outline: none; }
                    button { width: 100%; padding: 12px; background: #ff0055; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1em; transition: 0.3s; }
                    button:hover { background: #00eaff; color: #000; box-shadow: 0 0 15px #00eaff; }
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
                    background: #000 url('https://i.ibb.co/6y4G8s5/265.png') no-repeat center center fixed;
                    background-size: cover;
                    height: 100vh;
                    color: #fff;
                    display: flex;
                    overflow: hidden;
                }
                body::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.78); z-index: 0; }

                #sidebar {
                    width: 320px; background: rgba(15, 15, 15, 0.9); backdrop-filter: blur(12px);
                    border-right: 2px solid #ff0055; z-index: 1; display: flex; flex-direction: column; padding: 20px;
                }
                .profile-mini { text-align: center; margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 20px; }
                .profile-mini img { width: 80px; height: 80px; border-radius: 50%; border: 2px solid #00eaff; object-fit: cover; box-shadow: 0 0 10px #00eaff; }
                .profile-mini h3 { color: #00eaff; margin-top: 10px; font-size: 1.1em; }
                .profile-mini span { color: #ff0055; font-size: 0.8em; text-transform: uppercase; font-weight: bold; }

                .nav-menu { list-style: none; display: flex; flex-direction: column; gap: 10px; }
                .nav-btn {
                    display: flex; align-items: center; gap: 15px; padding: 14px 18px; background: rgba(30,30,30,0.6);
                    border: 1px solid #333; border-radius: 8px; color: #fff; cursor: pointer; transition: 0.3s; font-size: 0.95em;
                }
                .nav-btn:hover, .nav-btn.active { background: rgba(255, 0, 85, 0.2); border-color: #ff0055; box-shadow: 0 0 12px rgba(255,0,85,0.4); color: #00eaff; }
                .nav-btn i { font-size: 1.2em; color: #00eaff; }

                .ref-box { margin-top: auto; background: rgba(0, 234, 255, 0.05); border: 1px solid #00eaff; padding: 12px; border-radius: 8px; }
                .ref-box p { font-size: 0.75em; color: #00eaff; margin-bottom: 5px; }
                .ref-link-field { background: #000; padding: 6px; border-radius: 4px; font-size: 0.7em; color: #aaa; word-break: break-all; }

                #content-area { flex: 1; z-index: 1; display: flex; flex-direction: column; background: rgba(0,0,0,0.4); margin: 15px; border-radius: 10px; border: 1px solid #ff0055; overflow: hidden; }
                
                .section { display: none; flex: 1; flex-direction: column; height: 100%; overflow-y: auto; padding: 20px; }
                .section.active { display: flex; }

                .section-header { font-size: 1.4em; color: #00eaff; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 10px; text-shadow: 0 0 8px rgba(0,234,255,0.4); }

                #messages-box { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-bottom: 10px; }
                .msg-card { display: flex; gap: 12px; max-width: 75%; background: rgba(25,25,25,0.8); padding: 10px 14px; border-radius: 8px; border: 1px solid #333; position: relative; }
                .msg-card.own { align-self: flex-end; background: rgba(255, 0, 85, 0.15); border-color: #ff0055; flex-direction: row-reverse; }
                .msg-card img { width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid #00eaff; }
                .msg-content { flex: 1; }
                .msg-info { display: flex; justify-content: space-between; font-size: 0.75em; color: #00eaff; margin-bottom: 4px; }
                .msg-text { font-size: 0.95em; word-break: break-word; line-height: 1.3; }
                .msg-time { font-size: 0.65em; color: #777; margin-left: 8px; }
                
                .msg-actions { position: absolute; top: 5px; right: 8px; display: none; gap: 6px; }
                .msg-card:hover .msg-actions { display: flex; }
                .msg-action-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 0.8em; }
                .msg-action-btn:hover { color: #00eaff; }

                .chat-input-box { display: flex; gap: 10px; padding-top: 15px; border-top: 1px solid #333; position: relative; }
                .chat-input { flex: 1; background: #000; border: 1px solid #444; padding: 12px; border-radius: 6px; color: #fff; outline: none; font-size: 0.95em; }
                .chat-input:focus { border-color: #00eaff; }
                .action-icon-btn { background: #222; border: 1px solid #444; color: #00eaff; padding: 0 15px; border-radius: 6px; cursor: pointer; font-size: 1.2em; transition: 0.3s; }
                .action-icon-btn:hover { background: #ff0055; color: #fff; border-color: #ff0055; }

                #emoji-picker { display: none; position: absolute; bottom: 70px; right: 60px; background: #111; border: 1px solid #ff0055; border-radius: 8px; padding: 10px; grid-template-columns: repeat(6, 1fr); gap: 6px; z-index: 10; box-shadow: 0 0 15px rgba(0,0,0,0.8); }
                #emoji-picker.open { display: grid; }
                .emoji-opt { font-size: 1.3em; cursor: pointer; text-align: center; padding: 4px; border-radius: 4px; }
                .emoji-opt:hover { background: rgba(255,0,85,0.3); }

                .exchangers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 15px; }
                .ex-card { background: rgba(20,20,20,0.85); border: 1px solid #333; border-radius: 8px; padding: 15px; text-align: center; transition: 0.3s; text-decoration: none; color: inherit; display: block; }
                .ex-card:hover { border-color: #00eaff; box-shadow: 0 0 12px rgba(0,234,255,0.3); transform: translateY(-3px); }
                .ex-card img { width: 55px; height: 55px; border-radius: 50%; object-fit: cover; border: 2px solid #ff0055; margin-bottom: 10px; }
                .ex-card h4 { color: #00eaff; margin-bottom: 6px; font-size: 1.05em; }
                .ex-card p { font-size: 0.85em; color: #aaa; margin-bottom: 12px; }
                .ex-tg-btn { display: inline-block; background: #0088cc; color: #fff; padding: 6px 14px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
            </style>
        </head>
        <body>
            <div id="sidebar">
                <div class="profile-mini">
                    <img id="user-avatar" src="https://i.ibb.co/6y4G8s5/265.png" alt="Avatar">
                    <h3 id="user-name">Загрузка...</h3>
                    <span id="user-role">Статус</span>
                </div>
                <ul class="nav-menu">
                    <li class="nav-btn active" onclick="switchTab('chat', this)"><i class="fa-solid fa-comments"></i> Общение и игры</li>
                    <li class="nav-btn" onclick="switchTab('exchangers', this)"><i class="fa-solid fa-coins"></i> Обменники</li>
                    <li class="nav-btn" onclick="switchTab('shops', this)"><i class="fa-solid fa-store"></i> Магазины</li>
                    <li class="nav-btn" onclick="switchTab('profile', this)"><i class="fa-solid fa-user-gear"></i> Профиль</li>
                </ul>
                <div class="ref-box">
                    <p>Ваша реферальная ссылка:</p>
                    <div class="ref-link-field" id="ref-link">Загрузка...</div>
                </div>
            </div>

            <div id="content-area">
                <div id="chat" class="section active">
                    <div class="section-header">Киберпанк Чат & Игры</div>
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

                <div id="exchangers" class="section">
                    <div class="section-header">Проверенные обменники</div>
                    <div class="exchangers-grid" id="exchangers-list"></div>
                </div>

                <div id="shops" class="section">
                    <div class="section-header">Магазины и Сервисы</div>
                    <p style="color: #888;">Раздел магазинов наполняется...</p>
                </div>

                <div id="profile" class="section">
                    <div class="section-header">Настройки профиля</div>
                    <p>Управление вашим аккаунтом, аватаркой и рефералами.</p>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let currentUser = null;
                let editingMsgId = null;

                async function loadUserData() {
                    const res = await fetch('/api/user');
                    if (res.ok) {
                        currentUser = await res.json();
                        document.getElementById('user-name').innerText = '@' + currentUser.username;
                        document.getElementById('user-role').innerText = currentUser.status;
                        if (currentUser.avatarUrl) document.getElementById('user-avatar').src = currentUser.avatarUrl;
                        document.getElementById('ref-link').innerText = window.location.origin + '?ref=' + currentUser.username;
                    }
                }
                loadUserData();

                function switchTab(tabId, el) {
                    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                    document.getElementById(tabId).classList.add('active');
                    el.classList.add('active');
                    if(tabId === 'exchangers') loadExchangers();
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

                    if (editingMsgId) {
                        socket.emit('edit_message', { id: editingMsgId, text });
                        editingMsgId = null;
                    } else {
                        socket.emit('chat_message', { text });
                    }
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
                    div.setAttribute('data-id', msg.id);

                    div.innerHTML = \`
                        <img src="\${msg.avatarUrl || 'https://i.ibb.co/6y4G8s5/265.png'}" alt="av">
                        <div class="msg-content">
                            <div class="msg-info">
                                <span>@\${msg.username}</span>
                                <span class="msg-time">\${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div class="msg-text">\${msg.text}</div>
                        </div>
                        \${isOwn ? \`
                            <div class="msg-actions">
                                <button class="msg-action-btn" onclick="startEdit(\${msg.id}, '\${msg.text.replace(/'/g, "\\\\'")}')"><i class="fa-solid fa-pen"></i></button>
                                <button class="msg-action-btn" onclick="deleteMessage(\${msg.id})"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        \` : ''}
                    \`;
                    box.appendChild(div);
                    box.scrollTop = box.scrollHeight;
                }

                function startEdit(id, text) {
                    editingMsgId = id;
                    const input = document.getElementById('msg-input');
                    input.value = text;
                    input.focus();
                }

                function deleteMessage(id) {
                    socket.emit('delete_message', { id });
                }

                async function loadExchangers() {
                    const res = await fetch('/api/exchangers');
                    const list = await res.json();
                    const container = document.getElementById('exchangers-list');
                    container.innerHTML = '';
                    list.forEach(ex => {
                        container.innerHTML += \`
                            <div class="ex-card">
                                <img src="\${ex.photoUrl}" alt="ex">
                                <h4>\${ex.name}</h4>
                                <p>\${ex.description}</p>
                                <a href="\${ex.telegramUrl}" target="_blank" class="ex-tg-btn"><i class="fa-brands fa-telegram"></i> Перейти</a>
                            </div>
                        \`;
                    });
                }

                socket.on('chat_history', (messages) => {
                    const box = document.getElementById('messages-box');
                    box.innerHTML = '';
                    messages.forEach(msg => appendMessage(msg));
                });

                socket.on('new_message', (msg) => {
                    appendMessage(msg);
                });

                socket.on('message_updated', (updated) => {
                    const el = document.querySelector(\`[data-id='\${updated.id}'] .msg-text\`);
                    if (el) el.innerText = updated.text;
                });

                socket.on('message_deleted', (id) => {
                    const el = document.querySelector(\`[data-id='\${id}']\`);
                    if (el) el.remove();
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
        const username = socket.handshake.headers.cookie ? 'User' : 'User'; 
        db.get("SELECT * FROM users LIMIT 1", (err, user) => {
            const avatar = user ? user.avatarUrl : 'https://i.ibb.co/6y4G8s5/265.png';
            db.run("INSERT INTO messages (username, avatarUrl, text) VALUES (?, ?, ?)", ['User', avatar, data.text], function(err) {
                if (!err) {
                    io.emit('new_message', { id: this.lastID, username: 'User', avatarUrl: avatar, text: data.text, timestamp: new Date() });
                }
            });
        });
    });

    socket.on('edit_message', (data) => {
        db.run("UPDATE messages SET text = ? WHERE id = ?", [data.text, data.id], (err) => {
            if (!err) io.emit('message_updated', { id: data.id, text: data.text });
        });
    });

    socket.on('delete_message', (data) => {
        db.run("DELETE FROM messages WHERE id = ?", [data.id], (err) => {
            if (!err) io.emit('message_deleted', data.id);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
