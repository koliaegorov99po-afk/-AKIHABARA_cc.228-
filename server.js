const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Ошибка БД', err.message);
    else console.log('Подключено к SQLite базе данных.');
});

db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    text TEXT,
    time TEXT
)`);

io.on('connection', (socket) => {
    console.log('Пользователь подключился');

    db.all(`SELECT * FROM messages ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (!err) {
            socket.emit('load_history', rows.reverse());
        }
    });

    socket.on('chat_message', (data) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const messageData = { username: data.username, text: data.text, time };

        db.run(`INSERT INTO messages (username, text, time) VALUES (?, ?, ?)`, 
            [messageData.username, messageData.text, messageData.time], function(err) {
            if (!err) {
                io.emit('chat_message', messageData);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
