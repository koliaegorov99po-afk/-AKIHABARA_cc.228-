const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAIN_IMAGE = '/banner.png';
const MAIN_ADMIN = 'koliaegorov99po-afk';

const db = new sqlite3.Database(
  path.join(__dirname, 'akihabara.db')
);

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const sessionMiddleware = session({
  secret:
    process.env.SESSION_SECRET ||
    'CHANGE_THIS_AKIHABARA_SECRET',

  resave: false,
  saveUninitialized: false,

  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

/* =========================
   HELPERS
========================= */

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .slice(0, 64);
}

function isMainAdmin(name) {
  return (
    cleanUsername(name).toLowerCase() ===
    MAIN_ADMIN.toLowerCase()
  );
}

function requireLogin(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

function ensureUser(
  username,
  status = 'user',
  invitedBy = null,
  avatarUrl = MAIN_IMAGE,
  cb = () => {}
) {
  username = cleanUsername(username);

  if (!username) {
    return cb(null);
  }

  db.run(
    `
    INSERT OR IGNORE INTO users
    (
      username,
      status,
      avatarUrl,
      invitedBy
    )
    VALUES (?, ?, ?, ?)
    `,
    [
      username,
      status,
      avatarUrl,
      invitedBy
    ],
    err => cb(err)
  );
}

function emitStats() {
  io.emit('stats_updated');
}

/* =========================
   MULTER
========================= */

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, uploadDir);
  },

  filename: (_, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    const filename =
      `${Date.now()}-` +
      `${Math.random().toString(36).slice(2, 10)}` +
      ext;

    cb(null, filename);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 50 * 1024 * 1024
  },

  fileFilter: (_, file, cb) => {
    const allowed =
      /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime))$/i;

    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Разрешены JPG, PNG, GIF, WEBP, MP4, WEBM и MOV'
        ),
        false
      );
    }
  }
});

/* =========================
   DATABASE
========================= */

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'user',
      avatarUrl TEXT,
      referralCode TEXT,
      invitedBy TEXT,
      invites INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      avatarUrl TEXT,
      text TEXT,
      mediaUrl TEXT,
      mediaType TEXT,
      isAd INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      replyTo INTEGER,
      category TEXT DEFAULT 'chat',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS message_likes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      messageId INTEGER NOT NULL,
      username TEXT NOT NULL,
      UNIQUE(messageId, username)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mentions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      messageId INTEGER,
      mentionedUser TEXT,
      byUser TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      type TEXT,
      messageId INTEGER,
      text TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exchangers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      photoUrl TEXT,
      telegramUrl TEXT,
      description TEXT,
      owner TEXT,
      can_post INTEGER DEFAULT 0,
      can_ads INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shops(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      photoUrl TEXT,
      telegramUrl TEXT,
      description TEXT,
      owner TEXT,
      can_post INTEGER DEFAULT 0,
      can_ads INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS complaints(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT,
      target_name TEXT,
      complainant TEXT,
      reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings(
      key TEXT UNIQUE,
      value TEXT
    )
  `);

  db.run(
    `
    INSERT OR IGNORE INTO users
    (
      username,
      status,
      avatarUrl
    )
    VALUES (?, ?, ?)
    `,
    [
      MAIN_ADMIN,
      'admin',
      MAIN_IMAGE
    ]
  );

  db.run(
    `
    INSERT OR IGNORE INTO settings
    (
      key,
      value
    )
    VALUES ('tg_chat_link', ?)
    `,
    [
      'https://t.me/+K9gPO5PUyttlN2Zi'
    ]
  );
});

/* =========================
   CAPTCHA
========================= */

function makeCaptchaText() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let result = '';

  for (let i = 0; i < 5; i++) {
    result +=
      chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
  }

  return result;
}

app.get('/captcha.svg', (req, res) => {

  const code = makeCaptchaText();

  req.session.captchaAnswer = code;
  req.session.captchaCreatedAt = Date.now();

  const lines = Array.from(
    { length: 7 },
    () => `
      <line
        x1="${Math.random() * 220}"
        y1="${Math.random() * 70}"
        x2="${Math.random() * 220}"
        y2="${Math.random() * 70}"
        stroke="#${Math.floor(
          Math.random() * 0xffffff
        )
          .toString(16)
          .padStart(6, '0')}"
        stroke-width="${1 + Math.random() * 2}"
        opacity=".55"
      />
    `
  ).join('');

  const charsSvg = [...code]
    .map((char, index) => {

      const x = 28 + index * 39;

      return `
        <text
          x="${x}"
          y="52"
          transform="rotate(
            ${Math.floor(Math.random() * 25 - 12)}
            ${x}
            52
          )"
          font-family="Arial,sans-serif"
          font-size="32"
          font-weight="bold"
          fill="#fff"
        >
          ${char}
        </text>
      `;
    })
    .join('');

  res.set(
    'Content-Type',
    'image/svg+xml'
  );

  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );

  res.send(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="220"
      height="70"
      viewBox="0 0 220 70"
    >

      <rect
        width="220"
        height="70"
        rx="10"
        fill="#090909"
      />

      ${lines}

      <circle
        cx="${20 + Math.random() * 180}"
        cy="${10 + Math.random() * 50}"
        r="${10 + Math.random() * 18}"
        fill="#ff0055"
        opacity=".12"
      />

      ${charsSvg}

    </svg>
  `);
});

/* =========================
   LOGIN
========================= */

app.post('/login', (req, res) => {

  const username =
    cleanUsername(req.body.username);

  const ref =
    cleanUsername(req.body.ref);

  const captcha =
    String(req.body.captcha || '')
      .trim()
      .toUpperCase();

  const answer =
    String(
      req.session.captchaAnswer || ''
    ).toUpperCase();

  const created =
    Number(
      req.session.captchaCreatedAt || 0
    );

  req.session.captchaAnswer = null;
  req.session.captchaCreatedAt = null;

  if (!username) {
    return res.redirect('/login.html');
  }

  if (
    !answer ||
    !captcha ||
    captcha !== answer ||
    !created ||
    Date.now() - created > 5 * 60 * 1000
  ) {
    return res.status(400).send(`
      Неверная или просроченная CAPTCHA.
      <br><br>
      <a href="/login.html">
        Вернуться
      </a>
    `);
  }

  req.session.username = username;

  const role =
    isMainAdmin(username)
      ? 'admin'
      : 'user';

  db.get(
    `
    SELECT *
    FROM users
    WHERE username = ?
    `,
    [username],
    (err, user) => {

      if (err) {
        return res
          .status(500)
          .send('Database error');
      }

      if (user) {

        if (
          isMainAdmin(username) &&
          user.status !== 'admin'
        ) {
          db.run(
            `
            UPDATE users
            SET status = 'admin'
            WHERE username = ?
            `,
            [username]
          );
        }

        return res.redirect('/');
      }

      if (ref && ref !== username) {

        db.get(
          `
          SELECT username
          FROM users
          WHERE username = ?
          `,
          [ref],
          (e, refUser) => {

            const invitedBy =
              refUser
                ? refUser.username
                : null;

            if (refUser) {
              db.run(
                `
                UPDATE users
                SET invites = invites + 1
                WHERE username = ?
                `,
                [refUser.username]
              );
            }

            ensureUser(
              username,
              role,
              invitedBy,
              MAIN_IMAGE,
              () => {

                io.emit(
                  'system_message',
                  {
                    text:
                      `🎉 Пользователь @${username} ` +
                      `присоединился к платформе!`
                  }
                );

                emitStats();

                res.redirect('/');
              }
            );
          }
        );

      } else {

        ensureUser(
          username,
          role,
          null,
          MAIN_IMAGE,
          () => {

            io.emit(
              'system_message',
              {
                text:
                  `🎉 Пользователь @${username} ` +
                  `присоединился к платформе!`
              }
            );

            emitStats();

            res.redirect('/');
          }
        );
      }
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

/* =========================
   USER API
========================= */

app.get(
  '/api/user',
  requireLogin,
  (req, res) => {

    db.get(
      `
      SELECT *
      FROM users
      WHERE username = ?
      `,
      [req.session.username],
      (err, user) => {

        if (err || !user) {
          return res
            .status(404)
            .json({
              error: 'User not found'
            });
        }

        res.json(user);
      }
    );
  }
);

app.get(
  '/api/users',
  requireLogin,
  (req, res) => {

    db.all(
      `
      SELECT
        username,
        status,
        avatarUrl,
        createdAt
      FROM users
      ORDER BY createdAt ASC
      `,
      (err, rows) => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json(rows);
      }
    );
  }
);

app.get('/api/stats', (req, res) => {

  db.get(
    `
    SELECT COUNT(*) count
    FROM users
    `,
    (e, row) => {

      db.get(
        `
        SELECT value
        FROM settings
        WHERE key = 'tg_chat_link'
        `,
        (e2, setting) => {

          res.json({
            totalUsers:
              row?.count || 0,

            tgChatLink:
              setting?.value || ''
          });
        }
      );
    }
  );
});

app.get(
  '/api/referrals',
  requireLogin,
  (req, res) => {

    db.all(
      `
      SELECT
        username,
        status,
        createdAt
      FROM users
      WHERE invitedBy = ?
      ORDER BY createdAt DESC
      `,
      [req.session.username],
      (err, rows) => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json(rows);
      }
    );
  }
);

/* =========================
   NOTIFICATIONS
========================= */

app.get(
  '/api/notifications',
  requireLogin,
  (req, res) => {

    db.all(
      `
      SELECT *
      FROM notifications
      WHERE username = ?
      ORDER BY id DESC
      LIMIT 50
      `,
      [req.session.username],
      (err, rows) => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json(rows);
      }
    );
  }
);

app.post(
  '/api/notifications/read',
  requireLogin,
  (req, res) => {

    db.run(
      `
      UPDATE notifications
      SET isRead = 1
      WHERE username = ?
      `,
      [req.session.username],
      () => {

        res.json({
          success: true
        });
      }
    );
  }
);

/* =========================
   UPLOAD
========================= */

app.post(
  '/api/upload',
  requireLogin,
  (req, res) => {

    upload.single('media')(
      req,
      res,
      err => {

        if (err) {
          return res
            .status(400)
            .json({
              error: err.message
            });
        }

        if (!req.file) {
          return res
            .status(400)
            .json({
              error: 'Файл не выбран'
            });
        }

        const mediaType =
          req.file.mimetype.startsWith('video/')
            ? 'video'
            : 'image';

        res.json({
          success: true,

          mediaUrl:
            `/uploads/${req.file.filename}`,

          mediaType
        });
      }
    );
  }
);

/* =========================
   MESSAGES API
========================= */

app.get(
  '/api/messages',
  requireLogin,
  (req, res) => {

    const username =
      req.session.username;

    db.all(
      `
      SELECT
        m.*,

        COALESCE(
          (
            SELECT COUNT(*)
            FROM message_likes l
            WHERE l.messageId = m.id
          ),
          0
        ) AS likeCount,

        EXISTS(
          SELECT 1
          FROM message_likes l2
          WHERE
            l2.messageId = m.id
            AND l2.username = ?
        ) AS liked

      FROM messages m
      ORDER BY m.id DESC
      LIMIT 100
      `,
      [username],
      (err, rows) => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json(rows.reverse());
      }
    );
  }
);

/* =========================
   LIKE
========================= */

app.post(
  '/api/messages/:id/like',
  requireLogin,
  (req, res) => {

    const id =
      Number(req.params.id);

    const username =
      req.session.username;

    db.run(
      `
      INSERT OR IGNORE INTO
      message_likes
      (
        messageId,
        username
      )
      VALUES (?, ?)
      `,
      [id, username],
      function (err) {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        if (this.changes === 0) {

          db.run(
            `
            DELETE FROM message_likes
            WHERE
              messageId = ?
              AND username = ?
            `,
            [id, username]
          );
        }

        db.get(
          `
          SELECT COUNT(*) count
          FROM message_likes
          WHERE messageId = ?
          `,
          [id],
          (e, row) => {

            db.get(
              `
              SELECT 1
              FROM message_likes
              WHERE
                messageId = ?
                AND username = ?
              `,
              [id, username],
              (e2, exists) => {

                const result = {
                  messageId: id,
                  likeCount:
                    row?.count || 0,
                  liked:
                    !!exists
                };

                io.emit(
                  'like_updated',
                  result
                );

                res.json(result);
              }
            );
          }
        );
      }
    );
  }
);

/* =========================
   ADMIN
========================= */

function mainAdminOnly(
  req,
  res,
  next
) {

  if (!req.session.username) {
    return res
      .status(401)
      .json({
        error: 'Unauthorized'
      });
  }

  if (
    !isMainAdmin(
      req.session.username
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          'Только главный администратор'
      });
  }

  next();
}

function anyAdmin(
  req,
  res,
  next
) {

  if (!req.session.username) {
    return res
      .status(401)
      .json({
        error: 'Unauthorized'
      });
  }

  db.get(
    `
    SELECT status
    FROM users
    WHERE username = ?
    `,
    [req.session.username],
    (err, user) => {

      if (
        user &&
        user.status === 'admin'
      ) {
        return next();
      }

      res
        .status(403)
        .json({
          error: 'Access denied'
        });
    }
  );
}

/* =========================
   ADMIN DATA
========================= */

app.get(
  '/api/admin/data',
  anyAdmin,
  (req, res) => {

    db.all(
      `
      SELECT
        username,
        status,
        invitedBy,
        invites,
        createdAt
      FROM users
      ORDER BY createdAt DESC
      `,
      (e, users) => {

        db.all(
          `
          SELECT *
          FROM complaints
          ORDER BY timestamp DESC
          `,
          (e2, complaints) => {

            db.all(
              `
              SELECT *
              FROM exchangers
              ORDER BY id DESC
              `,
              (e3, exchangers) => {

                db.all(
                  `
                  SELECT *
                  FROM shops
                  ORDER BY id DESC
                  `,
                  (e4, shops) => {

                    db.get(
                      `
                      SELECT value
                      FROM settings
                      WHERE key = 'tg_chat_link'
                      `,
                      (e5, setting) => {

                        res.json({
                          users,
                          complaints,
                          exchangers,
                          shops,

                          currentAdmin:
                            req.session.username,

                          tgChatLink:
                            setting?.value || ''
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);

/* =========================
   TELEGRAM CHAT LINK
========================= */

app.post(
  '/api/admin/update-chat-link',
  mainAdminOnly,
  (req, res) => {

    const link =
      String(
        req.body.tgChatLink || ''
      ).trim();

    if (
      !/^https?:\/\//i.test(link)
    ) {
      return res
        .status(400)
        .json({
          error:
            'Некорректная ссылка'
        });
    }

    db.run(
      `
      INSERT OR REPLACE INTO
      settings
      (
        key,
        value
      )
      VALUES
      (
        'tg_chat_link',
        ?
      )
      `,
      [link],
      err => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        io.emit(
          'chat_link_updated',
          {
            tgChatLink: link
          }
        );

        res.json({
          success: true
        });
      }
    );
  }
);

/* =========================
   ADMIN STATUS
========================= */

app.post(
  '/api/admin/set-status',
  mainAdminOnly,
  (req, res) => {

    const target =
      cleanUsername(
        req.body.targetUser
      );

    const status =
      req.body.newStatus === 'admin'
        ? 'admin'
        : 'user';

    if (isMainAdmin(target)) {
      return res
        .status(400)
        .json({
          error:
            'Нельзя изменить статус главного администратора'
        });
    }

    db.run(
      `
      UPDATE users
      SET status = ?
      WHERE username = ?
      `,
      [status, target],
      function (err) {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json({
          success:
            this.changes > 0
        });
      }
    );
  }
);

/* =========================
   DELETE USER
========================= */

app.post(
  '/api/admin/delete-user',
  mainAdminOnly,
  (req, res) => {

    const target =
      cleanUsername(
        req.body.targetUser
      );

    if (isMainAdmin(target)) {
      return res
        .status(400)
        .json({
          error:
            'Нельзя удалить главного администратора'
        });
    }

    db.run(
      `
      DELETE FROM users
      WHERE username = ?
      `,
      [target],
      function (err) {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json({
          success:
            this.changes > 0
        });
      }
    );
  }
);

/* =========================
   EXCHANGERS / SHOPS
========================= */

function addDirectoryItem(
  table,
  req,
  res
) {

  const {
    name,
    photoUrl,
    telegramUrl,
    description,
    owner,
    can_post,
    can_ads
  } = req.body;

  const ownerName =
    cleanUsername(owner);

  if (ownerName) {
    ensureUser(
      ownerName,
      'user',
      null,
      photoUrl || MAIN_IMAGE
    );
  }

  db.run(
    `
    INSERT INTO ${table}
    (
      name,
      photoUrl,
      telegramUrl,
      description,
      owner,
      can_post,
      can_ads
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      name,
      photoUrl || MAIN_IMAGE,
      telegramUrl,
      description,
      ownerName,
      can_post ? 1 : 0,
      can_ads ? 1 : 0
    ],
    err => {

      if (err) {
        return res
          .status(500)
          .json({
            error: err.message
          });
      }

      res.json({
        success: true
      });
    }
  );
}

function editDirectoryItem(
  table,
  req,
  res
) {

  const {
    id,
    name,
    photoUrl,
    telegramUrl,
    description,
    owner,
    can_post,
    can_ads
  } = req.body;

  const ownerName =
    cleanUsername(owner);

  if (ownerName) {
    ensureUser(ownerName);
  }

  db.run(
    `
    UPDATE ${table}
    SET
      name = ?,
      photoUrl = ?,
      telegramUrl = ?,
      description = ?,
      owner = ?,
      can_post = ?,
      can_ads = ?
    WHERE id = ?
    `,
    [
      name,
      photoUrl || MAIN_IMAGE,
      telegramUrl,
      description,
      ownerName,
      can_post ? 1 : 0,
      can_ads ? 1 : 0,
      id
    ],
    err => {

      if (err) {
        return res
          .status(500)
          .json({
            error: err.message
          });
      }

      res.json({
        success: true
      });
    }
  );
}

for (
  const table of [
    'exchangers',
    'shops'
  ]
) {

  const singular =
    table === 'exchangers'
      ? 'exchanger'
      : 'shop';

  app.get(
    `/api/${table}`,
    requireLogin,
    (req, res) => {

      db.all(
        `
        SELECT *
        FROM ${table}
        ORDER BY id DESC
        `,
        (err, rows) => {

          if (err) {
            return res
              .status(500)
              .json({
                error: err.message
              });
          }

          res.json(rows);
        }
      );
    }
  );

  app.post(
    `/api/admin/add-${singular}`,
    anyAdmin,
    (req, res) => {
      addDirectoryItem(
        table,
        req,
        res
      );
    }
  );

  app.post(
    `/api/admin/edit-${singular}`,
    anyAdmin,
    (req, res) => {
      editDirectoryItem(
        table,
        req,
        res
      );
    }
  );

  app.post(
    `/api/admin/delete-${singular}`,
    anyAdmin,
    (req, res) => {

      db.run(
        `
        DELETE FROM ${table}
        WHERE id = ?
        `,
        [req.body.id],
        err => {

          if (err) {
            return res
              .status(500)
              .json({
                error: err.message
              });
          }

          res.json({
            success: true
          });
        }
      );
    }
  );
}

/* =========================
   COMPLAINTS
========================= */

app.post(
  '/api/complaint',
  requireLogin,
  (req, res) => {

    const {
      target_type,
      target_name,
      reason
    } = req.body;

    db.run(
      `
      INSERT INTO complaints
      (
        target_type,
        target_name,
        complainant,
        reason
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        target_type,
        target_name,
        req.session.username,
        reason
      ],
      err => {

        if (err) {
          return res
            .status(500)
            .json({
              error: err.message
            });
        }

        res.json({
          success: true
        });
      }
    );
  }
);

/* =========================
   MAIN PAGE
========================= */

app.get('/', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'index.html'
    )
  );
});

/* =========================
   SOCKET.IO CHAT
========================= */

io.on('connection', socket => {

  const username =
    cleanUsername(
      socket.request.session?.username
    );

  if (!username) {
    return socket.disconnect(true);
  }

  socket.join(
    `user:${username.toLowerCase()}`
  );

  /* CHAT HISTORY */

  db.all(
    `
    SELECT
      m.*,

      COALESCE(
        (
          SELECT COUNT(*)
          FROM message_likes l
          WHERE l.messageId = m.id
        ),
        0
      ) AS likeCount,

      EXISTS(
        SELECT 1
        FROM message_likes l2
        WHERE
          l2.messageId = m.id
          AND l2.username = ?
      ) AS liked

    FROM messages m
    ORDER BY m.id DESC
    LIMIT 100
    `,
    [username],
    (err, rows) => {

      if (!err) {
        socket.emit(
          'chat_history',
          rows.reverse()
        );
      }
    }
  );

  /* =========================
     SEND MESSAGE
  ========================= */

  socket.on(
    'chat_message',
    (data, ack) => {

      const text =
        String(data.text || '')
          .slice(0, 5000);

      if (
        !text &&
        !data.mediaUrl
      ) {
        return;
      }

      const isAd =
        data.isAd ? 1 : 0;

      const category =
        [
          'chat',
          'ad',
          'game'
        ].includes(data.category)
          ? data.category
          : 'chat';

      const pinned =
        data.isPinned ? 1 : 0;

      const replyTo =
        Number(data.replyTo) || null;

      db.get(
        `
        SELECT avatarUrl
        FROM users
        WHERE username = ?
        `,
        [username],
        (err, user) => {

          const avatar =
            user?.avatarUrl ||
            MAIN_IMAGE;

          db.run(
            `
            INSERT INTO messages
            (
              username,
              avatarUrl,
              text,
              mediaUrl,
              mediaType,
              isAd,
              isPinned,
              replyTo,
              category
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              username,
              avatar,
              text,
              data.mediaUrl || null,
              data.mediaType || null,
              isAd,
              pinned,
              replyTo,
              category
            ],
            function (insertError) {

              if (insertError) {

                if (ack) {
                  ack({
                    error:
                      insertError.message
                  });
                }

                return;
              }

              const id =
                this.lastID;

              if (pinned) {
                db.run(
                  `
                  UPDATE messages
                  SET isPinned = 0
                  WHERE id <> ?
                  `,
                  [id]
                );
              }

              const message = {
                id,
                username,
                avatarUrl: avatar,
                text,
                mediaUrl:
                  data.mediaUrl || null,
                mediaType:
                  data.mediaType || null,
                isAd,
                isPinned: pinned,
                replyTo,
                category,
                likeCount: 0,
                liked: false,
                timestamp:
                  new Date()
              };

              io.emit(
                'new_message',
                message
              );

              if (pinned) {
                io.emit(
                  'message_pinned',
                  message
                );
              }

              handleMentions(
                id,
                text,
                username
              );

              if (ack) {
                ack({
                  success: true,
                  id
                });
              }
            }
          );
        }
      );
    }
  );

  /* =========================
     EDIT
  ========================= */

  socket.on(
    'edit_message',
    data => {

      const id =
        Number(data.id);

      const text =
        String(data.text || '')
          .slice(0, 5000);

      db.get(
        `
        SELECT username
        FROM messages
        WHERE id = ?
        `,
        [id],
        (err, message) => {

          if (!message) return;

          if (
            message.username !== username &&
            !isMainAdmin(username)
          ) {
            return;
          }

          db.run(
            `
            UPDATE messages
            SET text = ?
            WHERE id = ?
            `,
            [text, id],
            updateError => {

              if (updateError) return;

              io.emit(
                'message_updated',
                {
                  id,
                  text
                }
              );

              handleMentions(
                id,
                text,
                username
              );
            }
          );
        }
      );
    }
  );

  /* =========================
     DELETE
  ========================= */

  socket.on(
    'delete_message',
    data => {

      const id =
        Number(data.id);

      db.get(
        `
        SELECT username
        FROM messages
        WHERE id = ?
        `,
        [id],
        (err, message) => {

          if (!message) return;

          if (
            message.username !== username &&
            !isMainAdmin(username)
          ) {
            return;
          }

          db.run(
            `
            DELETE FROM messages
            WHERE id = ?
            `,
            [id],
            () => {

              io.emit(
                'message_deleted',
                {
                  id
                }
              );
            }
          );
        }
      );
    }
  );

  /* =========================
     LIKE
  ========================= */

  socket.on(
    'like_message',
    data => {

      const id =
        Number(data.id);

      db.run(
        `
        INSERT OR IGNORE INTO
        message_likes
        (
          messageId,
          username
        )
        VALUES (?, ?)
        `,
        [id, username],
        function (err) {

          if (err) return;

          if (this.changes === 0) {

            db.run(
              `
              DELETE FROM message_likes
              WHERE
                messageId = ?
                AND username = ?
              `,
              [id, username]
            );
          }

          db.get(
            `
            SELECT COUNT(*) count
            FROM message_likes
            WHERE messageId = ?
            `,
            [id],
            (e, row) => {

              db.get(
                `
                SELECT 1
                FROM message_likes
                WHERE
                  messageId = ?
                  AND username = ?
                `,
                [id, username],
                (e2, exists) => {

                  io.emit(
                    'like_updated',
                    {
                      messageId: id,
                      likeCount:
                        row?.count || 0,
                      liked:
                        !!exists
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );

  /* =========================
     PIN
  ========================= */

  socket.on(
    'pin_message',
    data => {

      if (!isMainAdmin(username)) {
        return;
      }

      const id =
        Number(data.id);

      db.run(
        `
        UPDATE messages
        SET isPinned = 0
        `,
        [],
        () => {

          db.run(
            `
            UPDATE messages
            SET isPinned = 1
            WHERE id = ?
            `,
            [id],
            () => {

              db.get(
                `
                SELECT *
                FROM messages
                WHERE id = ?
                `,
                [id],
                (err, message) => {

                  if (message) {

                    io.emit(
                      'message_pinned',
                      message
                    );
                  }
                }
              );
            }
          );
        }
      );
    }
  );

  /* =========================
     UNPIN
  ========================= */

  socket.on(
    'unpin_message',
    () => {

      if (!isMainAdmin(username)) {
        return;
      }

      db.run(
        `
        UPDATE messages
        SET isPinned = 0
        `,
        [],
        () => {

          io.emit(
            'message_unpinned'
          );
        }
      );
    }
  );
});

/* =========================
   MENTIONS
========================= */

function handleMentions(
  messageId,
  text,
  byUser
) {

  const names = [
    ...text.matchAll(
      /@([A-Za-z0-9_\-]{2,64})/g
    )
  ]
    .map(match =>
      cleanUsername(match[1])
    )
    .filter(Boolean);

  if (!names.length) {
    return;
  }

  const placeholders =
    names.map(() => '?').join(',');

  db.all(
    `
    SELECT username
    FROM users
    WHERE lower(username)
    IN (${placeholders})
    `,
    names.map(name =>
      name.toLowerCase()
    ),
    (err, rows) => {

      if (err) return;

      (rows || []).forEach(user => {

        if (
          user.username.toLowerCase() ===
          byUser.toLowerCase()
        ) {
          return;
        }

        db.run(
          `
          INSERT INTO mentions
          (
            messageId,
            mentionedUser,
            byUser
          )
          VALUES (?, ?, ?)
          `,
          [
            messageId,
            user.username,
            byUser
          ]
        );

        db.run(
          `
          INSERT INTO notifications
          (
            username,
            type,
            messageId,
            text
          )
          VALUES (?, ?, ?, ?)
          `,
          [
            user.username,
            'mention',
            messageId,
            `@${byUser} упомянул вас в чате`
          ]
        );

        io.to(
          `user:${user.username.toLowerCase()}`
        ).emit(
          'mention',
          {
            messageId,
            byUser,
            text:
              `@${byUser} упомянул вас в чате`
          }
        );
      });
    }
  );
}

/* =========================
   START
========================= */

server.listen(
  PORT,
  () => {

    console.log(
      `AKIHABARA server running: ` +
      `http://localhost:${PORT}`
    );
  }
);
