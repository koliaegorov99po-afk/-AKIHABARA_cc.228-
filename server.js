<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$AKIHABARA_cc.228$</title>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

body {
  background: #050509;
  color: #fff;
  font-family: Arial, sans-serif;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    linear-gradient(
      rgba(0,0,0,.40),
      rgba(0,0,0,.72)
    ),
    url("/background.jpg") center/cover fixed;
  z-index: -1;
}

.wrap {
  width: min(1000px, 96%);
  height: 94vh;
  margin: 3vh auto;

  background: rgba(5,5,10,.88);

  border: 2px solid #ff0055;
  border-radius: 16px;

  box-shadow:
    0 0 20px rgba(255,0,85,.35),
    0 0 50px rgba(0,234,255,.12);

  display: flex;
  flex-direction: column;

  padding: 12px;
}

.top {
  padding: 10px;

  display: flex;
  justify-content: space-between;
  align-items: center;

  gap: 8px;
  flex-wrap: wrap;

  border: 1px solid #333;
  border-radius: 10px;

  background: rgba(17,17,25,.9);
}

.logo {
  color: #ff0055;
  font-size: 18px;
  font-weight: bold;
}

.admin-name {
  color: #00eaff;
}

.users-count {
  color: #fff;
}

.btn,
.tabs button {
  border: 1px solid #444;

  background: #181820;
  color: #fff;

  border-radius: 7px;

  padding: 8px 12px;

  cursor: pointer;
}

.btn:hover,
.tabs button:hover {
  border-color: #ff0055;
}

.tabs {
  padding: 7px;

  display: flex;
  gap: 6px;

  flex-wrap: wrap;

  margin: 8px 0;

  border: 1px solid #333;
  border-radius: 10px;

  background: rgba(17,17,25,.9);
}

.tabs button.active {
  background: #ff0055;
  border-color: #ff0055;
}

.section {
  display: none;

  flex: 1;
  min-height: 0;

  overflow: auto;
}

.section.active {
  display: flex;
  flex-direction: column;
}

.title {
  text-align: center;

  color: #00eaff;

  padding: 10px;

  border-bottom: 1px solid #333;

  font-weight: bold;
}

.messages {
  flex: 1;

  overflow-y: auto;

  padding: 10px;

  display: flex;
  flex-direction: column;

  gap: 9px;
}

.msg {
  max-width: 88%;

  padding: 9px;

  border: 1px solid #333;
  border-radius: 10px;

  background: rgba(22,22,28,.95);

  position: relative;
}

.msg.own {
  align-self: flex-end;

  border-color: #ff0055;

  background: rgba(36,13,24,.95);
}

.msg.ad {
  border: 2px dashed #ff0055;
}

.head {
  font-size: 12px;

  color: #00eaff;

  display: flex;

  justify-content: space-between;

  gap: 12px;
}

.text {
  white-space: pre-wrap;

  word-break: break-word;

  margin-top: 5px;
}

.media {
  max-width: 100%;
  max-height: 320px;

  margin-top: 8px;

  border-radius: 7px;
}

.actions {
  display: flex;

  gap: 5px;

  margin-top: 7px;

  flex-wrap: wrap;
}

.actions button {
  font-size: 12px;

  padding: 5px 8px;

  background: #222;

  color: #00eaff;

  border: 1px solid #444;

  border-radius: 5px;
}

.actions button:hover {
  border-color: #ff0055;
}

.like.active {
  color: #ff0055 !important;
}

.mention {
  color: #00eaff;

  background: rgba(0,234,255,.12);

  padding: 1px 3px;

  border-radius: 3px;
}

.composer {
  padding: 8px;

  display: flex;

  gap: 7px;

  border: 1px solid #333;

  border-radius: 10px;

  background: rgba(17,17,25,.95);
}

.composer input[type="text"] {
  flex: 1;

  min-width: 0;

  background: #000;

  color: #fff;

  border: 1px solid #444;

  border-radius: 8px;

  padding: 11px;
}

.composer input[type="file"] {
  display: none;
}

.pinned {
  display: none;

  padding: 8px;

  margin: 8px;

  background: rgba(0,234,255,.08);

  border: 1px solid #00eaff;

  border-radius: 8px;
}

.profile,
.directory {
  padding: 10px;
}

.card {
  padding: 10px;

  display: flex;

  justify-content: space-between;

  gap: 10px;

  align-items: center;

  border: 1px solid #333;

  border-radius: 10px;

  background: rgba(17,17,25,.9);

  margin-bottom: 8px;
}

.card img {
  width: 48px;
  height: 48px;

  border-radius: 50%;

  object-fit: cover;
}

.row {
  display: flex;

  gap: 7px;

  align-items: center;

  flex-wrap: wrap;
}

.small {
  font-size: 12px;

  color: #aaa;
}

.notify {
  color: #ff0055;
}

.admin {
  background: rgba(24,10,20,.95);

  border: 1px dashed #ff0055;

  padding: 10px;

  border-radius: 10px;

  margin-top: 10px;
}

.admin input,
.admin textarea,
.admin select {
  width: 100%;

  margin: 4px 0;

  padding: 8px;

  background: #000;

  color: #fff;

  border: 1px solid #444;

  border-radius: 6px;
}

.admin textarea {
  min-height: 80px;
}

.gamebox {
  padding: 12px;

  text-align: center;
}

.game {
  background: rgba(17,17,17,.95);

  border: 1px solid #333;

  border-radius: 10px;

  padding: 15px;

  margin: 8px 0;
}

.game-result {
  font-size: 28px;

  margin: 12px;
}

textarea {
  color: #fff;
}

@media (max-width: 600px) {

  .wrap {
    width: 100%;
    height: 100vh;

    margin: 0;

    border-radius: 0;

    padding: 7px;
  }

  .tabs button {
    flex: 1 1 30%;

    font-size: 12px;

    padding: 7px 5px;
  }

  .msg {
    max-width: 94%;
  }

  .top {
    font-size: 13px;
  }
}
</style>
</head>

<body>

<div class="wrap">

  <div class="top">

    <span class="logo">
      ⛩️ $AKIHABARA_cc.228$
    </span>

    <span class="admin-name">
      👑 @koliaegorov99po-afk
    </span>

    <span class="users-count">
      👥 <b id="count">...</b>
    </span>

    <a
      id="tg"
      class="btn"
      href="https://t.me/+K9gPO5PUyttlN2Zi"
      target="_blank"
    >
      Telegram чат
    </a>

  </div>


  <div class="tabs">

    <button
      class="active"
      onclick="tab('chat',this)"
    >
      💬 Общение
    </button>

    <button
      onclick="tab('ads',this)"
    >
      📢 Реклама
    </button>

    <button
      onclick="tab('games',this)"
    >
      🎮 Игры
    </button>

    <button
      onclick="tab('ex',this)"
    >
      🔄 Обменники
    </button>

    <button
      onclick="tab('shops',this)"
    >
      🛍 Магазины
    </button>

    <button
      onclick="tab('profile',this)"
    >
      👤 Профиль
    </button>

  </div>


  <!-- CHAT -->

  <div
    id="chat"
    class="section active"
  >

    <div class="title">
      💬 ЧАТ • ЛАЙКИ • ТЕГИ • ОТВЕТЫ • ЗАКРЕПЛЕНИЯ
    </div>

    <div
      id="pin"
      class="pinned"
    ></div>

    <div
      id="messages"
      class="messages"
    ></div>

    <div class="composer">

      <label class="btn">

        📎

        <input
          id="file"
          type="file"
          accept="image/*,video/*"
        >

      </label>

      <input
        id="input"
        type="text"
        placeholder="Напишите сообщение… @username для упоминания"
      >

      <button
        class="btn"
        onclick="send()"
      >
        ➤
      </button>

    </div>

  </div>


  <!-- ADS -->

  <div
    id="ads"
    class="section"
  >

    <div class="title">
      📢 РЕКЛАМА И ПОСТЫ
    </div>

    <div class="profile">

      <p class="small">
        Здесь можно публиковать рекламные посты,
        добавлять фото или видео и сразу закреплять пост.
      </p>

      <textarea
        id="adtext"
        style="
          width:100%;
          height:120px;
          background:#000;
          color:#fff;
          border:1px solid #444;
          border-radius:7px;
          padding:8px;
        "
        placeholder="Текст рекламного поста"
      ></textarea>

      <input
        id="adfile"
        type="file"
        accept="image/*,video/*"
        style="margin:8px 0"
      >

      <div class="row">

        <label>
          <input
            id="adpin"
            type="checkbox"
          >
          📌 Закрепить сразу
        </label>

        <button
          class="btn"
          onclick="publishAd()"
        >
          Опубликовать
        </button>

      </div>

    </div>

  </div>


  <!-- GAMES -->

  <div
    id="games"
    class="section"
  >

    <div class="title">
      🎮 ИГРЫ
    </div>

    <div class="gamebox">

      <div class="game">

        <b>🎲 Кубик</b>

        <div
          id="dice"
          class="game-result"
        >
          —
        </div>

        <button
          class="btn"
          onclick="rollDice()"
        >
          Бросить кубик
        </button>

      </div>


      <div class="game">

        <b>🪙 Орёл или решка</b>

        <div
          id="coin"
          class="game-result"
        >
          —
        </div>

        <button
          class="btn"
          onclick="flipCoin()"
        >
          Подбросить
        </button>

      </div>


      <div class="game">

        <b>🎰 Мини-слоты</b>

        <div
          id="slots"
          class="game-result"
        >
          🍒 • 🍋 • ⭐
        </div>

        <button
          class="btn"
          onclick="spin()"
        >
          Крутить
        </button>

      </div>

    </div>

  </div>


  <!-- EXCHANGERS -->

  <div
    id="ex"
    class="section"
  >

    <div class="title">
      🔄 ДОВЕРЕННЫЕ ОБМЕННИКИ
    </div>

    <div
      id="exlist"
      class="directory"
    ></div>

  </div>


  <!-- SHOPS -->

  <div
    id="shops"
    class="section"
  >

    <div class="title">
      🛍 ДОВЕРЕННЫЕ МАГАЗИНЫ
    </div>

    <div
      id="shoplist"
      class="directory"
    ></div>

  </div>


  <!-- PROFILE -->

  <div
    id="profile"
    class="section"
  >

    <div class="title">
      👤 ПРОФИЛЬ
    </div>

    <div class="profile">

      <h3 id="uname">
        ...
      </h3>

      <p id="urole"></p>

      <p>
        🔗 Реферальная ссылка:
      </p>

      <input
        id="ref"
        readonly
        style="
          width:100%;
          padding:8px;
          background:#000;
          color:#fff;
          border:1px solid #444;
          border-radius:6px;
        "
      >

      <button
        class="btn"
        onclick="copyRef()"
      >
        Скопировать
      </button>


      <h4>
        🔔 Упоминания
        <span
          id="ncount"
          class="notify"
        >
          0
        </span>
      </h4>

      <div id="notices"></div>


      <div
        id="admin"
        class="admin"
        style="display:none"
      ></div>


      <a
        class="btn"
        href="/logout"
        style="
          display:block;
          text-align:center;
          margin-top:10px;
          text-decoration:none;
        "
      >
        Выйти
      </a>

    </div>

  </div>

</div>


<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io();

let me = null;
let users = [];
let messages = [];

const $ = id =>
  document.getElementById(id);


/* =========================
   API
========================= */

async function api(url, options) {

  const response =
    await fetch(url, options);

  if (!response.ok) {

    const data =
      await response
        .json()
        .catch(() => ({}));

    throw new Error(
      data.error || 'Ошибка'
    );
  }

  return response.json();
}


/* =========================
   INIT
========================= */

async function init() {

  try {

    me =
      await api('/api/user');

    users =
      await api('/api/users');

    const stats =
      await api('/api/stats');


    $('count').textContent =
      stats.totalUsers;


    $('tg').href =
      stats.tgChatLink ||
      'https://t.me/+K9gPO5PUyttlN2Zi';


    $('uname').textContent =
      '@' + me.username;


    $('urole').textContent =
      'Статус: ' +
      String(me.status).toUpperCase();


    $('ref').value =
      location.origin +
      '/?ref=' +
      encodeURIComponent(me.username);


    await loadNotices();


    if (me.status === 'admin') {
      await loadAdmin();
    }

    await loadDir('ex');
    await loadDir('shops');

  } catch (error) {

    location.href =
      '/login.html';
  }
}


/* =========================
   TABS
========================= */

function tab(id, button) {

  document
    .querySelectorAll('.section')
    .forEach(section => {
      section.classList.remove('active');
    });


  document
    .querySelectorAll('.tabs button')
    .forEach(btn => {
      btn.classList.remove('active');
    });


  $(id).classList.add('active');

  button.classList.add('active');


  if (id === 'ex') {
    loadDir('ex');
  }

  if (id === 'shops') {
    loadDir('shops');
  }

}


/* =========================
   ESCAPE
========================= */

function esc(value) {

  return String(value ?? '')
    .replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
    );
}


/* =========================
   MESSAGE TEXT
========================= */

function renderText(text) {

  return esc(text)
    .replace(
      /@([A-Za-z0-9_-]{2,64})/g,
      '<span class="mention">@$1</span>'
    );
}


/* =========================
   ADD MESSAGE
========================= */

function addMsg(message) {

  messages.push(message);

  const own =
    message.username === me.username;


  const element =
    document.createElement('div');


  element.className =
    'msg ' +
    (own ? 'own ' : '') +
    (message.isAd ? 'ad' : '');


  element.id =
    'm' + message.id;


  let media = '';


  if (message.mediaUrl) {

    if (
      message.mediaType === 'video'
    ) {

      media = `
        <video
          class="media"
          controls
          src="${esc(message.mediaUrl)}"
        ></video>
      `;

    } else {

      media = `
        <img
          class="media"
          src="${esc(message.mediaUrl)}"
        >
      `;
    }
  }


  const adminButtons =
    me.status === 'admin'
      ? `
        <button
          onclick="pin(${message.id})"
        >
          📌 ${message.isPinned
            ? 'Открепить'
            : 'Закрепить'}
        </button>
      `
      : '';


  const ownerButtons =
    own || me.status === 'admin'
      ? `
        <button
          onclick="edit(${message.id})"
        >
          ✏️
        </button>

        <button
          onclick="del(${message.id})"
        >
          🗑
        </button>
      `
      : '';


  element.innerHTML = `

    <div class="head">

      <b>
        @${esc(message.username)}
      </b>

      <span>
        ${
          message.category === 'ad'
            ? '📢 РЕКЛАМА '
            : ''
        }

        ${new Date(
          message.timestamp
        ).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}

      </span>

    </div>


    <div class="text">
      ${renderText(message.text)}
    </div>


    ${media}


    <div class="actions">

      <button
        class="like ${
          message.liked
            ? 'active'
            : ''
        }"
        onclick="like(${message.id})"
      >
        ❤️
        <span>
          ${message.likeCount || 0}
        </span>
      </button>


      <button
        onclick="reply(${message.id})"
      >
        ↩ Ответить
      </button>


      ${adminButtons}

      ${ownerButtons}

    </div>

  `;


  $('messages')
    .appendChild(element);


  if (message.isPinned) {
    showPin(message);
  }

}


/* =========================
   LOAD MESSAGES
========================= */

async function loadMessages() {

  messages = [];

  $('messages').innerHTML = '';


  const data =
    await api('/api/messages');


  data.forEach(addMsg);


  $('messages').scrollTop =
    $('messages').scrollHeight;
}


/* =========================
   SEND MESSAGE
========================= */

async function send() {

  const input =
    $('input');

  const text =
    input.value.trim();


  const file =
    $('file').files[0];


  if (!text && !file) {
    return;
  }


  let mediaUrl = null;
  let mediaType = null;


  if (file) {

    const form =
      new FormData();

    form.append(
      'media',
      file
    );


    const result =
      await api(
        '/api/upload',
        {
          method: 'POST',
          body: form
        }
      );


    mediaUrl =
      result.mediaUrl;

    mediaType =
      result.mediaType;
  }


  socket.emit(
    'chat_message',
    {
      text,
      mediaUrl,
      mediaType,
      category: 'chat'
    }
  );


  input.value = '';

  $('file').value = '';
}


/* =========================
   PUBLISH AD
========================= */

async function publishAd() {

  const text =
    $('adtext')
      .value
      .trim();


  if (!text) {

    alert(
      'Введите текст рекламы'
    );

    return;
  }


  let mediaUrl = null;
  let mediaType = null;


  const file =
    $('adfile').files[0];


  if (file) {

    const form =
      new FormData();

    form.append(
      'media',
      file
    );


    const result =
      await api(
        '/api/upload',
        {
          method: 'POST',
          body: form
        }
      );


    mediaUrl =
      result.mediaUrl;

    mediaType =
      result.mediaType;
  }


  socket.emit(
    'chat_message',
    {
      text,
      mediaUrl,
      mediaType,

      isAd: true,

      category: 'ad',

      isPinned:
        $('adpin').checked

    },
    result => {

      if (
        result &&
        result.error
      ) {

        alert(result.error);

        return;
      }


      $('adtext').value = '';

      $('adfile').value = '';

      $('adpin').checked = false;

      alert(
        'Рекламный пост опубликован'
      );
    }
  );
}


/* =========================
   LIKE
========================= */

function like(id) {

  socket.emit(
    'like_message',
    { id }
  );
}


/* =========================
   REPLY
========================= */

function reply(id) {

  const message =
    messages.find(
      item => item.id === id
    );


  if (!message) {
    return;
  }


  $('input').value =
    '@' +
    message.username +
    ' ';


  $('input').focus();
}


/* =========================
   EDIT
========================= */

function edit(id) {

  const message =
    messages.find(
      item => item.id === id
    );


  if (!message) {
    return;
  }


  const text =
    prompt(
      'Введите новый текст',
      message.text
    );


  if (text !== null) {

    socket.emit(
      'edit_message',
      {
        id,
        text
      }
    );
  }
}


/* =========================
   DELETE
========================= */

function del(id) {

  if (
    !confirm(
      'Удалить сообщение?'
    )
  ) {
    return;
  }


  socket.emit(
    'delete_message',
    { id }
  );
}


/* =========================
   PIN
========================= */

function pin(id) {

  socket.emit(
    'pin_message',
    { id }
  );
}


/* =========================
   SHOW PIN
========================= */

function showPin(message) {

  const pin =
    $('pin');


  pin.style.display =
    'block';


  pin.innerHTML =
    '📌 <b>Закреплено:</b> ' +
    renderText(
      message.text || ''
    );
}


/* =========================
   DIRECTORY
========================= */

async function loadDir(kind) {

  const url =
    kind === 'ex'
      ? '/api/exchangers'
      : '/api/shops';


  const list =
    await api(url);


  const box =
    $(
      kind === 'ex'
        ? 'exlist'
        : 'shoplist'
    );


  box.innerHTML = '';


  if (!list.length) {

    box.innerHTML =
      '<p class="small">Пока ничего не добавлено.</p>';

    return;
  }


  list.forEach(item => {

    const card =
      document.createElement('div');


    card.className =
      'card';


    card.innerHTML = `

      <div class="row">

        <img
          src="${esc(
            item.photoUrl ||
            '/background.jpg'
          )}"
        >

        <div>

          <b>
            ${esc(item.name)}
          </b>

          <div class="small">
            @${esc(
              item.owner ||
              'admin'
            )}
          </div>

          <div class="small">
            ${esc(
              item.description ||
              ''
            )}
          </div>

        </div>

      </div>


      <div class="row">

        ${
          item.can_ads
            ? `
              <button
                class="btn"
                onclick="useAd(${JSON.stringify(
                  item.name
                )})"
              >
                📢 Реклама
              </button>
            `
            : ''
        }


        <button
          class="btn"
          onclick="complain(
            ${JSON.stringify(
              kind
            )},
            ${JSON.stringify(
              item.name
            )}
          )"
        >
          ⚠️ Жалоба
        </button>


        <a
          class="btn"
          href="${esc(
            item.telegramUrl ||
            '#'
          )}"
          target="_blank"
        >
          Telegram
        </a>

      </div>

    `;


    box.appendChild(card);

  });

}


/* =========================
   USE AD
========================= */

function useAd(name) {

  const button =
    document.querySelectorAll(
      '.tabs button'
    )[1];


  tab(
    'ads',
    button
  );


  $('adtext').value =
    '📢 РЕКЛАМА: ' +
    name +
    '\n\n';
}


/* =========================
   COMPLAINT
========================= */

async function complain(
  type,
  name
) {

  const reason =
    prompt(
      'Укажите причину жалобы'
    );


  if (!reason) {
    return;
  }


  await api(
    '/api/complaint',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        target_type:
          type === 'ex'
            ? 'Обменник'
            : 'Магазин',

        target_name:
          name,

        reason
      })
    }
  );


  alert(
    'Жалоба отправлена'
  );
}


/* =========================
   NOTIFICATIONS
========================= */

async function loadNotices() {

  const data =
    await api(
      '/api/notifications'
    );


  const unread =
    data.filter(
      item => !item.isRead
    ).length;


  $('ncount').textContent =
    unread;


  $('notices').innerHTML =
    data.map(item => `

      <div class="small">

        🔔 ${esc(item.text)}

        •
        ${new Date(
          item.createdAt
        ).toLocaleString()}

      </div>

    `).join('');


  await api(
    '/api/notifications/read',
    {
      method: 'POST'
    }
  );
}


/* =========================
   ADMIN
========================= */

async function loadAdmin() {

  const data =
    await api(
      '/api/admin/data'
    );


  const admin =
    $('admin');


  admin.style.display =
    'block';


  const usersOptions =
    data.users
      .filter(
        user =>
          user.username
            .toLowerCase() !==
          'koliaegorov99po-afk'
      )
      .map(
        user =>
          `
          <option
            value="${esc(
              user.username
            )}"
          >
            @${esc(
              user.username
            )}
          </option>
          `
      )
      .join('');


  const complaints =
    data.complaints
      .map(
        item =>
          `
          <div class="small">

            [${esc(
              item.target_type
            )}]

            ${esc(
              item.target_name
            )}

            —

            @${esc(
              item.complainant
            )}

            :

            ${esc(
              item.reason
            )}

          </div>
          `
      )
      .join('');


  admin.innerHTML = `

    <h3>
      👑 Панель администратора
    </h3>


    <p>
      Пользователей:
      <b>${data.users.length}</b>
    </p>


    <hr>


    <h4>
      🔗 Telegram чат
    </h4>


    <input
      id="chatlink"
      value="${esc(
        data.tgChatLink
      )}"
      placeholder="Ссылка Telegram"
    >


    <button
      class="btn"
      onclick="saveLink()"
    >
      Сохранить ссылку
    </button>


    <hr>


    <h4>
      👑 Управление пользователями
    </h4>


    <select id="target">
      ${usersOptions}
    </select>


    <select id="status">

      <option value="admin">
        Дать админку
      </option>

      <option value="user">
        Убрать админку
      </option>

    </select>


    <button
      class="btn"
      onclick="setStatus()"
    >
      Сохранить статус
    </button>


    <hr>


    <h4>
      ➕ Добавить обменник / магазин
    </h4>


    <select id="dtype">

      <option value="exchanger">
        🔄 Обменник
      </option>

      <option value="shop">
        🛍 Магазин
      </option>

    </select>


    <input
      id="dn"
      placeholder="Название"
    >


    <input
      id="du"
      placeholder="Telegram URL"
    >


    <input
      id="do"
      placeholder="@username владельца"
    >


    <textarea
      id="dd"
      placeholder="Описание"
    ></textarea>


    <label>

      <input
        id="da"
        type="checkbox"
      >

      Разрешить рекламу

    </label>


    <br><br>


    <button
      class="btn"
      onclick="addDir()"
    >
      Добавить
    </button>


    <hr>


    <h4>
      ⚠️ Жалобы
    </h4>


    ${
      complaints ||
      '<div class="small">Жалоб нет</div>'
    }

  `;
}


/* =========================
   SAVE TELEGRAM LINK
========================= */

async function saveLink() {

  const link =
    $('chatlink').value.trim();


  await api(
    '/api/admin/update-chat-link',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        tgChatLink: link
      })
    }
  );


  alert(
    'Ссылка Telegram сохранена'
  );
}


/* =========================
   SET STATUS
========================= */

async function setStatus() {

  await api(
    '/api/admin/set-status',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({

        targetUser:
          $('target').value,

        newStatus:
          $('status').value

      })
    }
  );


  alert(
    'Статус пользователя изменён'
  );


  await loadAdmin();
}


/* =========================
   ADD DIRECTORY
========================= */

async function addDir() {

  const type =
    $('dtype').value;


  const url =
    type === 'exchanger'
      ? '/api/admin/add-exchanger'
      : '/api/admin/add-shop';


  await api(
    url,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({

        name:
          $('dn').value,

        telegramUrl:
          $('du').value,

        owner:
          $('do').value,

        description:
          $('dd').value,

        can_ads:
          $('da').checked

      })
    }
  );


  alert(
    'Добавлено'
  );


  $('dn').value = '';
  $('du').value = '';
  $('do').value = '';
  $('dd').value = '';
  $('da').checked = false;


  await loadDir(
    type === 'ex'
      ? 'ex'
      : 'shops'
  );
}


/* =========================
   COPY REF
========================= */

function copyRef() {

  navigator.clipboard
    .writeText(
      $('ref').value
    )
    .then(() => {

      alert(
        'Реферальная ссылка скопирована'
      );

    });
}


/* =========================
   GAMES
========================= */

function rollDice() {

  const value =
    Math.floor(
      Math.random() * 6
    ) + 1;


  $('dice').textContent =
    '🎲 ' + value;
}


function flipCoin() {

  $('coin').textContent =
    Math.random() < .5
      ? '🦅 Орёл'
      : '🪙 Решка';
}


function spin() {

  const symbols = [
    '🍒',
    '🍋',
    '⭐',
    '💎',
    '7️⃣'
  ];


  const result =
    [0,1,2]
      .map(
        () =>
          symbols[
            Math.floor(
              Math.random() *
              symbols.length
            )
          ]
      )
      .join(' • ');


  $('slots').textContent =
    result;
}


/* =========================
   SOCKET EVENTS
========================= */

socket.on(
  'chat_history',
  data => {

    messages = [];

    $('messages').innerHTML = '';


    data.forEach(
      addMsg
    );


    $('messages').scrollTop =
      $('messages').scrollHeight;
  }
);


socket.on(
  'new_message',
  message => {

    addMsg(message);


    $('messages').scrollTop =
      $('messages').scrollHeight;
  }
);


socket.on(
  'message_updated',
  data => {

    const message =
      messages.find(
        item =>
          item.id === data.id
      );


    if (message) {
      message.text =
        data.text;
    }


    const element =
      $('m' + data.id);


    if (element) {

      const text =
        element.querySelector(
          '.text'
        );


      if (text) {

        text.innerHTML =
          renderText(
            data.text
          );
      }
    }
  }
);


socket.on(
  'message_deleted',
  data => {

    const element =
      $('m' + data.id);


    if (element) {
      element.remove();
    }
  }
);


socket.on(
  'like_updated',
  data => {

    const element =
      $('m' + data.messageId);


    if (!element) {
      return;
    }


    const button =
      element.querySelector(
        '.like'
      );


    if (!button) {
      return;
    }


    const count =
      button.querySelector(
        'span'
      );


    if (count) {

      count.textContent =
        data.likeCount;
    }


    button.classList.toggle(
      'active',
      data.liked
    );
  }
);


socket.on(
  'message_pinned',
  message => {

    showPin(message);
  }
);


socket.on(
  'message_unpinned',
  () => {

    $('pin').style.display =
      'none';
  }
);


socket.on(
  'system_message',
  async message => {

    addMsg({

      id:
        'system-' +
        Date.now(),

      username:
        'SYSTEM',

      text:
        message.text,

      timestamp:
        new Date(),

      likeCount: 0,

      liked: false,

      category:
        'chat'

    });


    const stats =
      await api(
        '/api/stats'
      );


    $('count').textContent =
      stats.totalUsers;
  }
);


socket.on(
  'mention',
  () => {

    loadNotices();
  }
);


socket.on(
  'chat_link_updated',
  data => {

    $('tg').href =
      data.tgChatLink;
  }
);


/* =========================
   ENTER SEND
========================= */

$('input')
  .addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Enter'
      ) {

        event.preventDefault();

        send();
      }
    }
  );


/* =========================
   START
========================= */

init()
  .then(
    () => loadMessages()
  )
  .catch(
    console.error
  );

</script>

</body>
</html>
