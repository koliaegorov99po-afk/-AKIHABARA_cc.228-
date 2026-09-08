const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// База данных SQLite
const dbPath = path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка БД:', err.message);
    } else {
        console.log('База данных подключена.');
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            status TEXT DEFAULT 'pending', -- pending, approved, blocked, admin
            referred_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Таблица сообщений
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT,
            username TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Таблица рекламы (обменники и магазины)
        db.run(`CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT, -- exchanger, shop
            title TEXT,
            url TEXT,
            owner TEXT,
            approved INTEGER DEFAULT 0
        )`);
    }
});

// Укажите ваш Telegram username администратора без @
const ADMIN_USERNAME = 'koliaegorov99po-afk'; // Замените на свой реальный юзернейм

// Главная страница с полным функционалом и фоном
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$AKIHABARA_cc.228$</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background: url('https://i.ibb.co/6y4G8s5/265.png') no-repeat center center fixed;
                    background-size: cover;
                    color: #fff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .overlay {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(10, 10, 15, 0.85);
                    z-index: 1;
                }
                .container {
                    position: relative;
                    z-index: 2;
                    width: 95%;
                    max-width: 800px;
                    background: rgba(20, 20, 30, 0.9);
                    border: 2px solid #ff2a6d;
                    border-radius: 12px;
                    padding: 20px;
                    box-shadow: 0 0 20px rgba(255, 42, 109, 0.4);
                    text-align: center;
                }
                h1 { color: #05d9e8; text-shadow: 0 0 10px rgba(5, 217, 232, 0.5); }
                .btn {
                    background: #ff2a6d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                    text-decoration: none;
                    display: inline-block;
                }
                .btn:hover { background: #d91b55; }
                input {
                    padding: 10px;
                    margin: 5px;
                    border-radius: 6px;
                    border: 1px solid #05d9e8;
                    background: #0b0b14;
                    color: white;
                    width: 80%;
                }
                .hidden { display: none !important; }
                .chat-box {
                    height: 250px;
                    background: #0b0b14;
                    border: 1px solid #333;
                    border-radius: 6px;
                    overflow-y: auto;
                    text-align: left;
                    padding: 10px;
                    margin-bottom: 10px;
                }
                .nav-buttons { display: flex; justify-content: center; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
            </style>
        </head>
        <body>
            <div class="overlay"></div>
            <div class="container" id="auth-screen">
                <h1>$AKIHABARA_cc.228$</h1>
                <p>Добро пожаловать на киберпанк-платформу</p>
                <div id="step-captcha">
                    <p>Пройдите проверку капчи: <b id="captcha-text"></b></p>
                    <input type="text" id="captcha-input" placeholder="Введите ответ...">
                    <br><button class="btn" onclick="checkCaptcha()">Продолжить</button>
                </div>
                <div id="step-login" class="hidden">
                    <p>Авторизуйтесь через Telegram или введите юзернейм:</p>
                    <input type="text" id="username-input" placeholder="@username (обязательно)"><br>
                    <input type="text" id="ref-input" placeholder="Реферальный код (если есть)"><br>
                    <button class="btn" onclick="registerUser()">Войти / Запросить доступ</button>
                </div>
                <div id="step-pending" class="hidden">
                    <h3>Ваша заявка отправлена администратору!</h3>
                    <p>Ожидайте одобрения статуса для получения доступа к рекламе и комнатам.</p>
                </div>
            </div>

            <div class="container hidden" id="main-screen">
                <h2 id="welcome-title">Панель управления</h2>
                <div class="nav-buttons">
                    <button class="btn" onclick="switchRoom('chat')">💬 Общение и игры</button>
                    <button class="btn" onclick="switchRoom('exchangers')">💱 Обменники</button>
                    <button class="btn" onclick="switchRoom('shops')">🛒 Магазины</button>
                    <button class="btn hidden" id="admin-btn" onclick="switchRoom('admin')">⚙️ Админка</button>
                </div>
                
                <div id="room-content">
                    <!-- Динамический контент комнат -->
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let currentUser = null;
                let currentRoom = 'chat';
                let captchaCorrect = 0;

                // Генерация простой капчи
                function generateCaptcha() {
                    let a = Math.floor(Math.random() * 10) + 1;
                    let b = Math.floor(Math.random() * 10) + 1;
                    captchaCorrect = a + b;
                    document.getElementById('captcha-text').innerText = \`\${a} + \${b} = ?\`;
                }
                generateCaptcha();

                function checkCaptcha() {
                    let val = parseInt(document.getElementById('captcha-input').value);
                    if (val === captchaCorrect) {
                        document.getElementById('step-captcha').classList.add('hidden');
                        document.getElementById('step-login').classList.remove('hidden');
                    } else {
                        alert('Неверная капча!');
                        generateCaptcha();
                    }
                }

                function registerUser() {
                    let username = document.getElementById('username-input').value.trim();
                    let ref = document.getElementById('ref-input').value.trim();
                    if (!username) {
                        alert('Укажите ваш юзернейм!');
                        return;
                    }
                    if (!username.startsWith('@')) username = '@' + username;

                    fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, ref })
                    }).then(res => res.json()).then(data => {
                        if (data.status === 'approved' || data.status === 'admin') {
                            currentUser = username;
                            enterMainScreen(data.status);
                        } else if (data.status === 'pending') {
                            document.getElementById('step-login').classList.add('hidden');
                            document.getElementById('step-pending').classList.remove('hidden');
                            setTimeout(checkStatus, 5000);
                        } else if (data.status === 'blocked') {
                            alert('Вы заблокированы администратором.');
                        }
                    });
                }

                function checkStatus() {
                    let username = document.getElementById('username-input').value.trim();
                    if (!username.startsWith('@')) username = '@' + username;
                    fetch('/api/status?username=' + encodeURIComponent(username))
                        .then(res => res.json()).then(data => {
                            if (data.status === 'approved' || data.status === 'admin') {
                                currentUser = username;
                                enterMainScreen(data.status);
                            } else {
                                setTimeout(checkStatus, 5000);
                            }
                        });
                }

                function enterMainScreen(status) {
                    document.getElementById('auth-screen').classList.add('hidden');
                    document.getElementById('main-screen').classList.remove('hidden');
                    document.getElementById('welcome-title').innerText = \`Добро пожаловать, \${currentUser}!\`;
                    if (status === 'admin') {
                        document.getElementById('admin-btn').classList.remove('hidden');
                    }
                    switchRoom('chat');
                }

                function switchRoom(room) {
                    currentRoom = room;
                    let content = document.getElementById('room-content');
                    if (room === 'chat') {
                        content.innerHTML = \`
                            <h3>Общение и игры</h3>
                            <div class="chat-box" id="messages-box"></div>
                            <input type="text" id="msg-input" placeholder="Введите сообщение...">
                            <button class="btn" onclick="sendMessage()">Отправить</button>
                        \`;
                        socket.emit('join_room', 'chat');
                    } else if (room === 'exchangers') {
                        content.innerHTML = \`<h3>Проверенные обменники</h3><div id="ex-list">Загрузка...</div><button class="btn" onclick="requestAd('exchanger')">Подать заявку на рекламу обменника</button>\`;
                        loadAds('exchanger');
                    } else if (room === 'shops') {
                        content.innerHTML = \`<h3>Партнерские магазины</h3><div id="shop-list">Загрузка...</div><button class="btn" onclick="requestAd('shop')">Подать заявку на рекламу магазина</button>\`;
                        loadAds('shop');
                    } else if (room === 'admin') {
                        content.innerHTML = \`<h3>Панель Администратора</h3><div id="admin-panel-data">Загрузка управления...</div>\`;
                        loadAdminData();
                    }
                }

                // Сокет чат
                socket.on('receive_message', (data) => {
                    let box = document.getElementById('messages-box');
                    if (box) {
                        box.innerHTML += \`<div><b>\${data.username}:</b> \${data.message}</div>\`;
                        box.scrollTop = box.scrollHeight;
                    }
                });

                socket.on('load_history', (history) => {
                    let box = document.getElementById('messages-box');
                    if (box) {
                        box.innerHTML = '';
                        history.forEach(m => {
                            box.innerHTML += \`<div><b>\${m.username}:</b> \${m.message}</div>\`;
                        });
                        box.scrollTop = box.scrollHeight;
                    }
                });

                function sendMessage() {
                    let input = document.getElementById('msg-input');
                    if (!input || !input.value.trim()) return;
                    socket.emit('send_message', { room: 'chat', username: currentUser, message: input.value.trim() });
                    input.value = '';
                }

                function loadAds(type) {
                    fetch('/api/ads?type=' + type).then(res => res.json()).then(data => {
                        let html = '';
                        data.forEach(ad => {
                            html += \`<div style="background:#111; padding:10px; margin:5px; border-radius:5px;"><b>\${ad.title}</b> - <a href="\${ad.url}" target="_blank" style="color:#05d9e8;">Перейти</a> (Владелец: \${ad.owner})</div>\`;
                        });
                        let el = document.getElementById(type === 'exchanger' ? 'ex-list' : 'shop-list');
                        if (el) el.innerHTML = html || 'Реклама пока отсутствует.';
                    });
                }

                function requestAd(type) {
                    let title = prompt('Введите название обменника/магазина:');
                    let url = prompt('Введите ссылку на рекламу:');
                    if (!title || !url) return;
                    fetch('/api/add_ad', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type, title, url, owner: currentUser })
                    }).then(() => alert('Заявка на рекламу отправлена администратору!'));
                }

                function loadAdminData() {
                    fetch('/api/admin/data').then(res => res.json()).then(data => {
                        let html = '<h4>Пользователи и Рефералы:</h4>';
                        data.users.forEach(u => {
                            let isMeAdmin = (u.username === '@' + '${ADMIN_USERNAME}' || u.username === '${ADMIN_USERNAME}');
                            html += \`<div style="margin:5px; background:#111; padding:5px;">
                                \${u.username} [Статус: <b>\${u.status}</b>] (Реферал от: \${u.referred_by || 'нет'}) 
                                \${!isMeAdmin ? \`
                                    <button class="btn" style="padding:2px 5px;" onclick="adminAction('approve', '\${u.username}')">Одобрить</button>
                                    <button class="btn" style="padding:2px 5px; background:orange;" onclick="adminAction('block', '\${u.username}')">Блок</button>
                                    <button class="btn" style="padding:2px 5px; background:red;" onclick="adminAction('delete', '\${u.username}')">Удалить</button>
                                \` : ''}
                            </div>\`;
                        });
                        html += '<h4>Заявки на рекламу:</h4>';
                        data.ads.forEach(a => {
                            html += \`<div style="margin:5px; background:#111; padding:5px;">
                                [\${a.type}] \${a.title} (\${a.url}) - Владелец: \${a.owner} [Одобрено: \${a.approved}]
                                \${a.approved === 0 ? \`<button class="btn" style="padding:2px 5px;" onclick="approveAd(\${a.id})">Одобрить рекламу</button>\` : ''}
                            </div>\`;
                        });
                        document.getElementById('admin-panel-data').innerHTML = html;
                    });
                }

                function adminAction(action, username) {
                    fetch('/api/admin/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action, username })
                    }).then(() => loadAdminData());
                }

                function approveAd(id) {
                    fetch('/api/admin/approve_ad', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    }).then(() => loadAdminData());
                }
            </script>
        </body>
        </html>
    `);
});

// API Регистрации и Статусов
app.post('/api/register', (req, res) => {
    let { username, ref } = req.body;
    let cleanAdmin = ADMIN_USERNAME.startsWith('@') ? ADMIN_USERNAME : '@' + ADMIN_USERNAME;
    let initialStatus = (username === cleanAdmin || username === ADMIN_USERNAME) ? 'admin' : 'pending';

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
        if (row) {
            res.json({ status: row.status });
        } else {
            db.run(`INSERT INTO users (username, status, referred_by) VALUES (?, ?, ?)`, [username, initialStatus, ref || null], () => {
                res.json({ status: initialStatus });
            });
        }
    });
});

app.get('/api/status', (req, res) => {
    let username = req.query.username;
    db.get(`SELECT status FROM users WHERE username = ?`, [username], (err, row) => {
        res.json({ status: row ? row.status : 'pending' });
    });
});

// Реклама
app.get('/api/ads', (req, res) => {
    let type = req.query.type;
    db.all(`SELECT * FROM ads WHERE type = ? AND approved = 1`, [type], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/add_ad', (req, res) => {
    let { type, title, url, owner } = req.body;
    db.run(`INSERT INTO ads (type, title, url, owner, approved) VALUES (?, ?, ?, ?, 0)`, [type, title, url, owner], () => {
        res.sendStatus(200);
    });
});

// Админ API
app.get('/api/admin/data', (req, res) => {
    db.all(`SELECT * FROM users`, (err, users) => {
        db.all(`SELECT * FROM ads`, (err2, ads) => {
            res.json({ users: users || [], ads: ads || [] });
        });
    });
});

app.post('/api/admin/action', (req, res) => {
    let { action, username } = req.body;
    if (action === 'approve') {
        db.run(`UPDATE users SET status = 'approved' WHERE username = ?`, [username], () => res.sendStatus(200));
    } else if (action === 'block') {
        db.run(`UPDATE users SET status = 'blocked' WHERE username = ?`, [username], () => res.sendStatus(200));
    } else if (action === 'delete') {
        db.run(`DELETE FROM users WHERE username = ?`, [username], () => res.sendStatus(200));
    } else {
        res.sendStatus(400);
    }
});

app.post('/api/admin/approve_ad', (req, res) => {
    let { id } = req.body;
    db.run(`UPDATE ads SET approved = 1 WHERE id = ?`, [id], () => res.sendStatus(200));
});

// Сокеты для чата
io.on('connection', (socket) => {
    socket.on('join_room', (room) => {
        socket.join(room);
        db.all(`SELECT username, message FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50`, [room], (err, rows) => {
            if (!err) socket.emit('load_history', rows);
        });
    });

    socket.on('send_message', (data) => {
        let { room, username, message } = data;
        if (!room || !username || !message) return;
        db.run(`INSERT INTO messages (room, username, message) VALUES (?, ?, ?)`, [room, username, message], () => {
            io.to(room).emit('receive_message', { username, message });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Киберпанк-платформа запущена на порту ${PORT}`);
});
