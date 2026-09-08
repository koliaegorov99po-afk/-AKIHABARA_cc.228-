const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Инициализация базы данных SQLite с поддержкой категорий/комнат
const dbPath = path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('База данных SQLite успешно подключена.');
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT,
            username TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Раздача статических файлов из корня проекта
app.use(express.static(__dirname));

// Обработка подключений через WebSockets
io.on('connection', (socket) => {
    console.log('Новый пользователь подключился к платформе');

    // Подключение к определенной комнате
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`Пользователь вошел в комнату: ${room}`);

        // Загрузка последних 50 сообщений для конкретной комнаты
        db.all(
            `SELECT username, message, time(timestamp) as time FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50`,
            [room],
            (err, rows) => {
                if (!err) {
                    socket.emit('load_history', rows);
                }
            }
        );
    });

    // Получение и сохранение сообщения
    socket.on('send_message', (data) => {
        const { room, username, message } = data;
        if (!room || !username || !message) return;

        const stmt = db.prepare(`INSERT INTO messages (room, username, message) VALUES (?, ?, ?)`);
        stmt.run(room, username, message, function (err) {
            if (!err) {
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // Отправляем сообщение только участникам этой комнаты
                io.to(room).emit('receive_message', {
                    username: username,
                    message: message,
                    time: timeStr
                });
            }
        });
        stmt.finalize();
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен и работает на порту ${PORT}`);
});
