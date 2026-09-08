<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$AKIHABARA_cc.228$</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body {
            background-color: #0b0b0f;
            color: #ff2a5f;
            font-family: 'Courier New', Courier, monospace;
            margin: 0;
            padding: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .logo {
            width: 110px;
            height: 110px;
            border-radius: 50%;
            border: 2px solid #ff2a5f;
            object-fit: cover;
            box-shadow: 0 0 15px #ff2a5f;
            margin-top: 10px;
        }
        h1 {
            font-size: 19px;
            text-align: center;
            text-shadow: 0 0 10px #ff2a5f;
            margin: 12px 0 4px 0;
        }
        p.subtitle {
            color: #8a8a9d;
            font-size: 11px;
            text-align: center;
            margin-bottom: 12px;
        }
        /* Навигация по комнатам */
        .rooms-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            width: 100%;
            max-width: 450px;
            margin-bottom: 12px;
        }
        .room-btn {
            background: #15151f;
            border: 1px solid #ff2a5f;
            color: #ff2a5f;
            padding: 9px 6px;
            font-size: 11px;
            cursor: pointer;
            border-radius: 6px;
            transition: 0.2s;
            font-family: inherit;
            text-align: center;
            font-weight: bold;
        }
        .room-btn.active, .room-btn:hover {
            background: #ff2a5f;
            color: #0b0b0f;
            box-shadow: 0 0 12px #ff2a5f;
        }
        /* Окно чата */
        .chat-box {
            background: #12121c;
            border: 1px solid #ff2a5f;
            border-radius: 8px;
            width: 100%;
            max-width: 450px;
            height: 360px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 0 20px rgba(255, 42, 95, 0.2);
        }
        .messages-list {
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .message-item {
            font-size: 13px;
            word-break: break-all;
            border-bottom: 1px solid #1f1f2e;
            padding-bottom: 5px;
        }
        .message-item span.user {
            color: #ff2a5f;
            font-weight: bold;
        }
        .message-item span.time {
            color: #55556b;
            font-size: 10px;
            float: right;
        }
        /* Панель ввода */
        .input-area {
            padding: 10px;
            border-top: 1px solid #ff2a5f;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: #15151f;
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
        }
        input, button.send-btn {
            background: #0b0b0f;
            border: 1px solid #ff2a5f;
            color: #ff2a5f;
            padding: 10px;
            border-radius: 4px;
            font-family: inherit;
            outline: none;
            font-size: 13px;
        }
        input::placeholder {
            color: #55556b;
        }
        button.send-btn {
            background: #ff2a5f;
            color: #0b0b0f;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
        }
        button.send-btn:hover {
            box-shadow: 0 0 10px #ff2a5f;
        }
    </style>
</head>
<body>

    <img src="329.jpg" alt="Logo" class="logo">
    <h1>$AKIHABARA_cc.228$</h1>
    <p class="subtitle">Киберпанк-платформа с изолированными разделами</p>

    <!-- Кнопки переключения комнат -->
    <div class="rooms-container">
        <button class="room-btn active" onclick="switchRoom('general', this)">💬 Общий чат</button>
        <button class="room-btn" onclick="switchRoom('exchanges', this)">🔄 Обменники</button>
        <button class="room-btn" onclick="switchRoom('shops', this)">🛍 Магазины</button>
        <button class="room-btn" onclick="switchRoom('ads', this)">📢 Реклама</button>
    </div>

    <!-- Основной блок сообщений -->
    <div class="chat-box">
        <div id="messagesList" class="messages-list"></div>
        <div class="input-area">
            <input type="text" id="usernameInput" placeholder="Ваше имя / ник...">
            <input type="text" id="messageInput" placeholder="Введите сообщение..." onkeydown="checkEnter(event)">
            <button class="send-btn" onclick="sendMessage()">Отправить</button>
        </div>
    </div>

    <script>
        const socket = io();
        let currentRoom = 'general';

        // Функция переключения между комнатами
        function switchRoom(roomName, btnElement) {
            currentRoom = roomName;
            
            // Подсветка активной кнопки раздела
            document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
            btnElement.classList.add('active');

            // Очищаем экран чата и подключаемся к новой комнате на сервере
            document.getElementById('messagesList').innerHTML = '';
            socket.emit('join_room', currentRoom);
        }

        // Автоматический вход в комнату при открытии сайта
        socket.on('connect', () => {
            socket.emit('join_room', currentRoom);
        });

        // Загрузка истории сообщений для выбранного раздела
        socket.on('load_history', (history) => {
            const list = document.getElementById('messagesList');
            list.innerHTML = '';
            history.forEach(item => {
                appendMessage(item.username, item.message, item.time);
            });
        });

        // Получение нового сообщения в реальном времени
        socket.on('receive_message', (data) => {
            appendMessage(data.username, data.message, data.time);
        });

        // Отправка сообщения
        function sendMessage() {
            const usernameInput = document.getElementById('usernameInput');
            const messageInput = document.getElementById('messageInput');
            
            const username = usernameInput.value.trim();
            const message = messageInput.value.trim();

            if (!username) {
                alert('Пожалуйста, укажите ваше имя!');
                usernameInput.focus();
                return;
            }
            if (!message) {
                return;
            }

            // Отправляем данные на сервер с указанием текущей комнаты
            socket.emit('send_message', {
                room: currentRoom,
                username: username,
                message: message
            });

            messageInput.value = '';
            messageInput.focus();
        }

        // Отправка по нажатию Enter
        function checkEnter(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        }

        // Отрисовка сообщения в списке
        function appendMessage(username, message, time) {
            const list = document.getElementById('messagesList');
            const div = document.createElement('div');
            div.className = 'message-item';
            div.innerHTML = `<span class="user">${escapeHtml(username)}</span>: ${escapeHtml(message)} <span class="time">${time || ''}</span>`;
            list.appendChild(div);
            list.scrollTop = list.scrollHeight;
        }

        // Защита от XSS
        function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
    </script>
</body>
</html>
