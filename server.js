const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Инициализация базы данных SQLite (файл базы сохраняется локально)
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Ошибка подключения к SQLite:', err.message);
    } else {
        console.log('Подключено к базе данных SQLite.');
    }
});

// Создание таблиц, если они еще не существуют
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        role TEXT DEFAULT 'user',
        balance REAL DEFAULT 0.0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Настройка middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'akihabara-secret-key-2026',
    resave: false,
    saveUninitialized: true
}));

// Главная страница с киберпанк-интерфейсом и P2P панелью
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AKIHABARA Platform // P2P</title>
            <style>
                :root {
                    --bg-color: #0b0f19;
                    --panel-bg: #131c2e;
                    --accent-cyan: #00f3ff;
                    --accent-pink: #ff0055;
                    --text-color: #e2e8f0;
                    --border-color: #1e293b;
                }
                body {
                    margin: 0;
                    padding: 0;
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    font-family: 'Courier New', Courier, monospace;
                }
                header {
                    background: var(--panel-bg);
                    border-bottom: 2px solid var(--accent-cyan);
                    padding: 15px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                h1 {
                    margin: 0;
                    font-size: 1.5rem;
                    color: var(--accent-cyan);
                    text-shadow: 0 0 10px rgba(0, 243, 255, 0.4);
                }
                .container {
                    max-width: 1200px;
                    margin: 20px auto;
                    padding: 0 20px;
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 20px;
                }
                .panel {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                .chat-box {
                    height: 350px;
                    overflow-y: auto;
                    border: 1px solid var(--border-color);
                    padding: 10px;
                    margin-bottom: 15px;
                    background: #080c14;
                }
                .message {
                    margin-bottom: 8px;
                    border-bottom: 1px dashed var(--border-color);
                    padding-bottom: 4px;
                }
                .message span {
                    color: var(--accent-pink);
                    font-weight: bold;
                }
                input, button {
                    background: #0f172a;
                    border: 1px solid var(--accent-cyan);
                    color: var(--text-color);
                    padding: 10px;
                    font-family: inherit;
                    outline: none;
                }
                input {
                    width: calc(100% - 110px);
                }
                button {
                    cursor: pointer;
                    background: var(--accent-cyan);
                    color: #0b0f19;
                    font-weight: bold;
                    transition: 0.2s;
                }
                button:hover {
                    background: var(--accent-pink);
                    border-color: var(--accent-pink);
                    color: #fff;
                }
                .p2p-info {
                    font-size: 0.9rem;
                    line-height: 1.6;
                }
            </style>
        </head>
        <body>
            <header>
                <h1>AKIHABARA // P2P SYSTEM</h1>
                <div>STATUS: <span style="color: #00ff66;">ONLINE</span></div>
            </header>
            <div class="container">
                <div class="panel">
                    <h2>Оперативный чат / P2P Лог</h2>
                    <div class="chat-box" id="chatBox"></div>
                    <form id="chatForm" onsubmit="sendMessage(event)">
                        <input type="text" id="msgInput" placeholder="Введите сообщение или реквизиты..." autocomplete="off">
                        <button type="submit">Отправить</button>
                    </form>
                </div>
                <div class="panel p2p-info">
                    <h2>Панель P2P Оператора</h2>
                    <p><b>Модель:</b> Ручная верификация транзакций.</p>
                    <p><b>Поддерживаемые активы:</b> ПМР рубли, РФ рубли, МД леи, USDT, BTC, LTC.</p>
                    <hr style="border-color: var(--border-color);">
                    <p style="color: var(--accent-cyan); font-size: 0.8rem;">Система активна и готова к обработке заявок.</p>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const chatBox = document.getElementById('chatBox');

                function appendMessage(user, text) {
                    const div = document.createElement('div');
                    div.className = 'message';
                    div.innerHTML = \`<span>\${user}:</span> \${text}\`;
                    chatBox.appendChild(div);
                    chatBox.scrollTop = chatBox.scrollHeight;
                }

                // Загрузка истории при старте
                fetch('/messages')
                    .then(res => res.json())
                    .then(data => {
                        data.forEach(m => appendMessage(m.user, m.text));
                    });

                socket.on('chat message', function(msg) {
                    appendMessage(msg.user, msg.text);
                });

                function sendMessage(e) {
                    e.preventDefault();
                    const input = document.getElementById('msgInput');
                    if (!input.value.trim()) return;
                    
                    const msgData = { user: 'Оператор', text: input.value };
                    socket.emit('chat message', msgData);
                    input.value = '';
                }
            </script>
        </body>
        </html>
    `);
});

// API для получения истории сообщений из SQLite
app.get('/messages', (req, res) => {
    db.all("SELECT user, text FROM messages ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows.reverse());
    });
});

// Настройка веб-сокетов для реалтайм чата и уведомлений
io.on('connection', (socket) => {
    console.log('Пользователь подключен к сокету');

    socket.on('chat message', (msg) => {
        // Сохранение сообщения в базу данных
        db.run("INSERT INTO messages (user, text) VALUES (?, ?)", [msg.user, msg.text], (err) => {
            if (err) {
                console.error("Ошибка сохранения сообщения:", err.message);
            }
        });
        // Рассылка всем участникам
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
