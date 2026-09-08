const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
  secret: 'akihabara-super-secret-key-228',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
});

const io = new Server(server);

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Database Setup
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    status TEXT DEFAULT 'user',
    refBy TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    text TEXT,
    mediaUrl TEXT,
    mediaType TEXT,
    category TEXT DEFAULT 'chat',
    isAd INTEGER DEFAULT 0,
    isPinned INTEGER DEFAULT 0,
    likeCount INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    messageId INTEGER,
    username TEXT,
    UNIQUE(messageId, username)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    name TEXT,
    telegramUrl TEXT,
    owner TEXT,
    description TEXT,
    photoUrl TEXT,
    can_ads INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT,
    target_name TEXT,
    complainant TEXT,
    reason TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    text TEXT,
    isRead INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`, () => {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('tgChatLink', 'https://t.me/+K9gPO5PUyttlN2Zi')`);
  });

  db.get(`SELECT * FROM users WHERE username = ?`, ['koliaegorov99po-afk'], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, password, status) VALUES (?, ?, ?)`, ['koliaegorov99po-afk', 'admin123', 'admin']);
    } else if (row.status !== 'admin') {
      db.run(`UPDATE users SET status = 'admin' WHERE username = ?`, ['koliaegorov99po-afk']);
    }
  });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// Multer Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.username) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function isAdmin(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  db.get(`SELECT status FROM users WHERE username = ?`, [req.session.username], (err, row) => {
    if (row && row.status === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  });
}

// Routes: Auth Pages & Endpoints
app.post('/api/register', (req, res) => {
  const { username, password, ref } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const cleanUser = username.trim().replace(/^@/, '');
  db.run(`INSERT INTO users (username, password, refBy) VALUES (?, ?, ?)`, [cleanUser, password, ref || null], function(err) {
    if (err) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    req.session.username = cleanUser;
    res.json({ success: true });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  const cleanUser = username.trim().replace(/^@/, '');
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [cleanUser, password], (err, user) => {
    if (!user) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    req.session.username = user.username;
    res.json({ success: true });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.get('/api/user', isAuthenticated, (req, res) => {
  db.get(`SELECT username, status FROM users WHERE username = ?`, [req.session.username], (err, user) => {
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

app.get('/api/users', isAuthenticated, (req, res) => {
  db.all(`SELECT username, status FROM users`, [], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/stats', isAuthenticated, (req, res) => {
  db.get(`SELECT COUNT(*) as total FROM users`, [], (err, uRow) => {
    db.get(`SELECT value FROM settings WHERE key = 'tgChatLink'`, [], (err, sRow) => {
      res.json({
        totalUsers: uRow ? uRow.total : 0,
        tgChatLink: sRow ? sRow.value : 'https://t.me/+K9gPO5PUyttlN2Zi'
      });
    });
  });
});

app.get('/api/messages', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM messages ORDER BY id ASC`, [], (err, messages) => {
    if (err) return res.json([]);
    const formatted = messages.map(msg => ({
      ...msg,
      isAd: !!msg.isAd,
      isPinned: !!msg.isPinned
    }));
    res.json(formatted);
  });
});

app.post('/api/upload', isAuthenticated, upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const mediaUrl = '/uploads/' + req.file.filename;
  const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  res.json({ mediaUrl, mediaType });
});

app.get('/api/exchangers', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM directories WHERE type = 'exchanger'`, [], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/shops', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM directories WHERE type = 'shop'`, [], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/complaint', isAuthenticated, (req, res) => {
  const { target_type, target_name, reason } = req.body;
  db.run(`INSERT INTO complaints (target_type, target_name, complainant, reason) VALUES (?, ?, ?, ?)`,
    [target_type, target_name, req.session.username, reason], function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    });
});

app.get('/api/notifications', isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM notifications WHERE username = ? ORDER BY id DESC`, [req.session.username], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/notifications/read', isAuthenticated, (req, res) => {
  db.run(`UPDATE notifications SET isRead = 1 WHERE username = ?`, [req.session.username], () => {
    res.json({ success: true });
  });
});

// Admin Routes
app.get('/api/admin/data', isAdmin, (req, res) => {
  db.all(`SELECT username, status FROM users`, [], (err, users) => {
    db.all(`SELECT * FROM complaints`, [], (err, complaints) => {
      db.get(`SELECT value FROM settings WHERE key = 'tgChatLink'`, [], (err, row) => {
        res.json({
          users: users || [],
          complaints: complaints || [],
          tgChatLink: row ? row.value : ''
        });
      });
    });
  });
});

app.post('/api/admin/update-chat-link', isAdmin, (req, res) => {
  const { tgChatLink } = req.body;
  db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tgChatLink', ?)`, [tgChatLink], () => {
    io.emit('chat_link_updated', { tgChatLink });
    res.json({ success: true });
  });
});

app.post('/api/admin/set-status', isAdmin, (req, res) => {
  const { targetUser, newStatus } = req.body;
  if (targetUser === 'koliaegorov99po-afk') {
    return res.status(400).json({ error: 'Cannot change main admin status' });
  }
  db.run(`UPDATE users SET status = ? WHERE username = ?`, [newStatus, targetUser], () => {
    res.json({ success: true });
  });
});

app.post('/api/admin/add-exchanger', isAdmin, (req, res) => {
  const { name, telegramUrl, owner, description, can_ads } = req.body;
  db.run(`INSERT INTO directories (type, name, telegramUrl, owner, description, can_ads) VALUES ('exchanger', ?, ?, ?, ?, ?)`,
    [name, telegramUrl, owner, description, can_ads ? 1 : 0], () => {
      res.json({ success: true });
    });
});

app.post('/api/admin/add-shop', isAdmin, (req, res) => {
  const { name, telegramUrl, owner, description, can_ads } = req.body;
  db.run(`INSERT INTO directories (type, name, telegramUrl, owner, description, can_ads) VALUES ('shop', ?, ?, ?, ?, ?)`,
    [name, telegramUrl, owner, description, can_ads ? 1 : 0], () => {
      res.json({ success: true });
    });
});

// Socket.io Session Integration & Handlers
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const session = socket.request.session;
  const username = session && session.username ? session.username : null;

  socket.on('chat_message', (data, callback) => {
    if (!username) return;
    const isAd = data.isAd ? 1 : 0;
    const isPinned = data.isPinned ? 1 : 0;

    db.run(`INSERT INTO messages (username, text, mediaUrl, mediaType, category, isAd, isPinned) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, data.text || '', data.mediaUrl || null, data.mediaType || null, data.category || 'chat', isAd, isPinned],
      function(err) {
        if (err) {
          if (callback) callback({ error: 'Error saving message' });
          return;
        }
        const messageId = this.lastID;
        db.get(`SELECT * FROM messages WHERE id = ?`, [messageId], (err, row) => {
          if (row) {
            const formatted = { ...row, isAd: !!row.isAd, isPinned: !!row.isPinned };
            io.emit('new_message', formatted);
            if (isPinned) {
              db.run(`UPDATE messages SET isPinned = 0 WHERE id != ?`, [messageId], () => {
                io.emit('message_pinned', formatted);
              });
            }
            if (callback) callback({ success: true });
          }
        });
      });
  });

  socket.on('like_message', (data) => {
    if (!username) return;
    const { id } = data;
    db.get(`SELECT * FROM likes WHERE messageId = ? AND username = ?`, [id, username], (err, existing) => {
      if (existing) {
        db.run(`DELETE FROM likes WHERE messageId = ? AND username = ?`, [id, username], () => {
          db.run(`UPDATE messages SET likeCount = MAX(0, likeCount - 1) WHERE id = ?`, [id], () => {
            db.get(`SELECT likeCount FROM messages WHERE id = ?`, [id], (err, row) => {
              if (row) io.emit('like_updated', { messageId: id, likeCount: row.likeCount, liked: false });
            });
          });
        });
      } else {
        db.run(`INSERT INTO likes (messageId, username) VALUES (?, ?)`, [id, username], () => {
          db.run(`UPDATE messages SET likeCount = likeCount + 1 WHERE id = ?`, [id], () => {
            db.get(`SELECT likeCount FROM messages WHERE id = ?`, [id], (err, row) => {
              if (row) io.emit('like_updated', { messageId: id, likeCount: row.likeCount, liked: true });
            });
          });
        });
      }
    });
  });

  socket.on('delete_message', (data) => {
    if (!username) return;
    db.get(`SELECT * FROM messages WHERE id = ?`, [data.id], (err, msg) => {
      if (!msg) return;
      db.get(`SELECT status FROM users WHERE username = ?`, [username], (err, user) => {
        if (user && (user.status === 'admin' || msg.username === username)) {
          db.run(`DELETE FROM messages WHERE id = ?`, [data.id], () => {
            io.emit('message_deleted', { id: data.id });
          });
        }
      });
    });
  });

  socket.on('edit_message', (data) => {
    if (!username) return;
    db.get(`SELECT * FROM messages WHERE id = ?`, [data.id], (err, msg) => {
      if (!msg) return;
      db.get(`SELECT status FROM users WHERE username = ?`, [username], (err, user) => {
        if (user && (user.status === 'admin' || msg.username === username)) {
          db.run(`UPDATE messages SET text = ? WHERE id = ?`, [data.text, data.id], () => {
            io.emit('message_updated', { id: data.id, text: data.text });
          });
        }
      });
    });
  });

  socket.on('pin_message', (data) => {
    if (!username) return;
    db.get(`SELECT status FROM users WHERE username = ?`, [username], (err, user) => {
      if (user && user.status === 'admin') {
        db.get(`SELECT * FROM messages WHERE id = ?`, [data.id], (err, row) => {
          if (row) {
            const newPinnedState = row.isPinned ? 0 : 1;
            db.run(`UPDATE messages SET isPinned = 0`, [], () => {
              db.run(`UPDATE messages SET isPinned = ? WHERE id = ?`, [newPinnedState, data.id], () => {
                if (newPinnedState) {
                  io.emit('message_pinned', { ...row, isPinned: true });
                } else {
                  io.emit('message_unpinned');
                }
              });
            });
          }
        });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
