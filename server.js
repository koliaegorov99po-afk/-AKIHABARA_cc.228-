Const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "akihabara.db");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

const MAIN_ADMIN = "koliaegorov99po-afk";
const DEFAULT_CHAT =
  "https://t.me/+K9gPO5PUyttlN2Zi";

const MAIN_IMAGE = "/banner.png";
const BACKGROUND_IMAGE = "/background.jpg";

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_FILE);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const sessionMiddleware = session({
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: __dirname
  }),
  secret: process.env.SESSION_SECRET || "AKIHABARA_228_SECRET_CHANGE_ME",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);
app.use(express.static(PUBLIC_DIR));

/* =========================================================
   DATABASE
========================================================= */

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'user',
      avatarUrl TEXT DEFAULT '/banner.png',
      referralCode TEXT UNIQUE,
      invitedBy TEXT,
      invites INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      avatarUrl TEXT,
      text TEXT,
      mediaUrl TEXT,
      mediaType TEXT,
      isAd INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      likedBy TEXT DEFAULT '[]',
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exchangers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      photoUrl TEXT DEFAULT '/banner.png',
      telegramUrl TEXT,
      description TEXT,
      owner TEXT,
      can_post INTEGER DEFAULT 0,
      can_ads INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      photoUrl TEXT DEFAULT '/banner.png',
      telegramUrl TEXT,
      description TEXT,
      owner TEXT,
      can_post INTEGER DEFAULT 0,
      can_ads INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      targetType TEXT,
      targetId INTEGER,
      reason TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(
    `INSERT OR IGNORE INTO settings(key,value)
     VALUES('chatLink', ?)`,
    [DEFAULT_CHAT]
  );

  const referralCode = crypto
    .createHash("sha256")
    .update(MAIN_ADMIN)
    .digest("hex")
    .slice(0, 10);

  db.run(
    `INSERT OR IGNORE INTO users
     (username,status,avatarUrl,referralCode)
     VALUES(?,?,?,?)`,
    [
      MAIN_ADMIN,
      "admin",
      MAIN_IMAGE,
      referralCode
    ]
  );
});

/* =========================================================
   MULTER — UPLOADS
========================================================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();

    const safeName =
      Date.now() +
      "-" +
      crypto.randomBytes(6).toString("hex") +
      ext;

    cb(null, safeName);
  }
});

const allowedImages = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

const allowedVideos = [
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    if (
      allowedImages.includes(file.mimetype) ||
      allowedVideos.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только изображения и видео"));
    }
  }
});

/* =========================================================
   HELPERS
========================================================= */

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^\w.-]/g, "")
    .slice(0, 32);
}

function cleanText(value, max = 2000) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function validHttpUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function isAdmin(req) {
  return (
    req.session &&
    req.session.username
  );
}

function requireLogin(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({
      error: "Требуется авторизация"
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({
      error: "Требуется авторизация"
    });
  }

  db.get(
    `SELECT status FROM users WHERE username = ?`,
    [req.session.username],
    (err, row) => {

      if (err) {
        return res.status(500).json({
          error: "Ошибка базы данных"
        });
      }

      if (!row || row.status !== "admin") {
        return res.status(403).json({
          error: "Нет прав администратора"
        });
      }

      next();
    }
  );
}

function getUser(username, callback) {
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    callback
  );
}

function generateReferralCode(username) {
  return crypto
    .createHash("sha256")
    .update(
      username +
      Date.now() +
      crypto.randomBytes(8).toString("hex")
    )
    .digest("hex")
    .slice(0, 12);
}

/* =========================================================
   AUTH
========================================================= */

app.get("/api/captcha", (req, res) => {

  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;

  req.session.captchaAnswer = String(a + b);

  res.json({
    question: `${a} + ${b} = ?`
  });
});

app.post("/login", (req, res) => {

  const username = cleanUsername(req.body.username);
  const ref = cleanUsername(req.body.ref);
  const captcha = String(req.body.captcha || "").trim();

  if (!username) {
    return res.status(400).send("Введите username");
  }

  if (!captcha) {
    return res.status(400).send("Введите ответ капчи");
  }

  if (
    !req.session.captchaAnswer ||
    captcha !== req.session.captchaAnswer
  ) {
    return res.status(400).send("Неверная капча");
  }

  req.session.captchaAnswer = null;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {

      if (err) {
        console.error(err);
        return res.status(500).send("Ошибка базы данных");
      }

      if (user) {

        req.session.username = user.username;

        return req.session.save(() => {
          res.redirect("/");
        });
      }

      const referralCode = generateReferralCode(username);

      let invitedBy = null;

      const createUser = () => {

        const status =
          username.toLowerCase() === MAIN_ADMIN.toLowerCase()
            ? "admin"
            : "user";

        db.run(
          `INSERT INTO users
           (username,status,avatarUrl,referralCode,invitedBy)
           VALUES(?,?,?,?,?)`,
          [
            username,
            status,
            MAIN_IMAGE,
            referralCode,
            invitedBy
          ],
          function (insertErr) {

            if (insertErr) {
              console.error(insertErr);

              return res
                .status(500)
                .send("Не удалось создать пользователя");
            }

            if (invitedBy) {
              db.run(
                `UPDATE users
                 SET invites = invites + 1
                 WHERE referralCode = ?`,
                [invitedBy]
              );
            }

            req.session.username = username;

            req.session.save(() => {
              res.redirect("/");
            });
          }
        );
      };

      if (!ref) {
        createUser();
        return;
      }

      db.get(
        `SELECT referralCode
         FROM users
         WHERE referralCode = ?
         OR username = ?`,
        [ref, ref],
        (refErr, refUser) => {

          if (!refErr && refUser) {
            invitedBy = refUser.referralCode;
          }

          createUser();
        }
      );
    }
  );
});

app.post("/logout", (req, res) => {

  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

/* =========================================================
   USER API
========================================================= */

app.get("/api/user", requireLogin, (req, res) => {

  getUser(req.session.username, (err, user) => {

    if (err || !user) {
      return res.status(404).json({
        error: "Пользователь не найден"
      });
    }

    res.json(user);
  });
});

app.get("/api/referrals", requireLogin, (req, res) => {

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [req.session.username],
    (err, user) => {

      if (err || !user) {
        return res.status(404).json({
          error: "Пользователь не найден"
        });
      }

      db.all(
        `SELECT username,status,createdAt
         FROM users
         WHERE invitedBy = ?
         ORDER BY id DESC`,
        [user.referralCode],
        (err2, rows) => {

          if (err2) {
            return res.status(500).json({
              error: "Ошибка базы данных"
            });
          }

          res.json({
            code: user.referralCode,
            count: rows.length,
            users: rows
          });
        }
      );
    }
  );
});

app.get("/api/stats", requireLogin, (req, res) => {

  db.get(
    `SELECT COUNT(*) AS count FROM users`,
    (e1, users) => {

      db.get(
        `SELECT COUNT(*) AS count FROM messages`,
        (e2, messages) => {

          db.get(
            `SELECT COUNT(*) AS count FROM exchangers`,
            (e3, exchangers) => {

              db.get(
                `SELECT COUNT(*) AS count FROM shops`,
                (e4, shops) => {

                  res.json({
                    users: users ? users.count : 0,
                    messages: messages ? messages.count : 0,
                    exchangers: exchangers ? exchangers.count : 0,
                    shops: shops ? shops.count : 0
                  });

                }
              );
            }
          );
        }
      );
    }
  );
});

/* =========================================================
   AVATAR UPLOAD
========================================================= */

app.post(
  "/api/profile/avatar",
  requireLogin,
  upload.single("avatar"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Файл не выбран"
      });
    }

    if (!allowedImages.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);

      return res.status(400).json({
        error: "Аватар должен быть изображением"
      });
    }

    const avatarUrl =
      "/uploads/" +
      req.file.filename;

    db.run(
      `UPDATE users
       SET avatarUrl = ?
       WHERE username = ?`,
      [avatarUrl, req.session.username],
      (err) => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка сохранения"
          });
        }

        res.json({
          ok: true,
          avatarUrl
        });
      }
    );
  }
);

/* =========================================================
   MEDIA UPLOAD
========================================================= */

app.post(
  "/api/upload",
  requireLogin,
  upload.single("media"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Файл не выбран"
      });
    }

    const isVideo =
      allowedVideos.includes(req.file.mimetype);

    const mediaType =
      isVideo ? "video" : "image";

    res.json({
      ok: true,
      mediaUrl:
        "/uploads/" +
        req.file.filename,
      mediaType
    });
  }
);

/* =========================================================
   SETTINGS
========================================================= */

app.get("/api/chat-link", requireLogin, (req, res) => {

  db.get(
    `SELECT value
     FROM settings
     WHERE key = 'chatLink'`,
    (err, row) => {

      res.json({
        chatLink:
          row && row.value
            ? row.value
            : DEFAULT_CHAT
      });
    }
  );
});

app.post(
  "/api/admin/update-chat-link",
  requireAdmin,
  (req, res) => {

    const link =
      String(req.body.link || "").trim();

    if (!validHttpUrl(link)) {
      return res.status(400).json({
        error: "Неверная ссылка"
      });
    }

    db.run(
      `INSERT INTO settings(key,value)
       VALUES('chatLink',?)
       ON CONFLICT(key)
       DO UPDATE SET value=excluded.value`,
      [link],
      err => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка сохранения"
          });
        }

        res.json({
          ok: true,
          link
        });
      }
    );
  }
);

/* =========================================================
   EXCHANGERS
========================================================= */

app.get("/api/exchangers", requireLogin, (req, res) => {

  db.all(
    `SELECT * FROM exchangers
     ORDER BY id DESC`,
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: "Ошибка базы"
        });
      }

      res.json(rows);
    }
  );
});

app.post(
  "/api/admin/exchanger",
  requireAdmin,
  (req, res) => {

    const id = Number(req.body.id || 0);
    const name = cleanText(req.body.name, 100);
    const description = cleanText(
      req.body.description,
      1000
    );
    const telegramUrl =
      String(req.body.telegramUrl || "").trim();

    const photoUrl =
      validHttpUrl(req.body.photoUrl)
        ? String(req.body.photoUrl || MAIN_IMAGE)
        : MAIN_IMAGE;

    if (!name) {
      return res.status(400).json({
        error: "Введите название"
      });
    }

    if (!validHttpUrl(telegramUrl)) {
      return res.status(400).json({
        error: "Неверная Telegram-ссылка"
      });
    }

    if (id) {

      db.run(
        `UPDATE exchangers
         SET name=?,
             photoUrl=?,
             telegramUrl=?,
             description=?,
             owner=?,
             can_post=?,
             can_ads=?
         WHERE id=?`,
        [
          name,
          photoUrl,
          telegramUrl,
          description,
          req.session.username,
          Number(!!req.body.can_post),
          Number(!!req.body.can_ads),
          id
        ],
        err => {

          if (err) {
            return res.status(500).json({
              error: "Ошибка обновления"
            });
          }

          res.json({ ok: true });
        }
      );

    } else {

      db.run(
        `INSERT INTO exchangers
         (name,photoUrl,telegramUrl,description,owner,can_post,can_ads)
         VALUES(?,?,?,?,?,?,?)`,
        [
          name,
          photoUrl,
          telegramUrl,
          description,
          req.session.username,
          Number(!!req.body.can_post),
          Number(!!req.body.can_ads)
        ],
        err => {

          if (err) {
            return res.status(500).json({
              error: "Ошибка создания"
            });
          }

          res.json({ ok: true });
        }
      );
    }
  }
);

app.delete(
  "/api/admin/exchanger/:id",
  requireAdmin,
  (req, res) => {

    db.run(
      `DELETE FROM exchangers WHERE id=?`,
      [Number(req.params.id)],
      err => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка удаления"
          });
        }

        res.json({ ok: true });
      }
    );
  }
);

/* =========================================================
   SHOPS
========================================================= */

app.get("/api/shops", requireLogin, (req, res) => {

  db.all(
    `SELECT * FROM shops ORDER BY id DESC`,
    (err, rows) => {

      if (err) {
        return res.status(500).json({
          error: "Ошибка базы"
        });
      }

      res.json(rows);
    }
  );
});

app.post(
  "/api/admin/shop",
  requireAdmin,
  (req, res) => {

    const id = Number(req.body.id || 0);
    const name = cleanText(req.body.name, 100);
    const description = cleanText(
      req.body.description,
      1000
    );
    const telegramUrl =
      String(req.body.telegramUrl || "").trim();

    const photoUrl =
      validHttpUrl(req.body.photoUrl)
        ? String(req.body.photoUrl || MAIN_IMAGE)
        : MAIN_IMAGE;

    if (!name) {
      return res.status(400).json({
        error: "Введите название"
      });
    }

    if (!validHttpUrl(telegramUrl)) {
      return res.status(400).json({
        error: "Неверная ссылка"
      });
    }

    if (id) {

      db.run(
        `UPDATE shops
         SET name=?,
             photoUrl=?,
             telegramUrl=?,
             description=?,
             owner=?,
             can_post=?,
             can_ads=?
         WHERE id=?`,
        [
          name,
          photoUrl,
          telegramUrl,
          description,
          req.session.username,
          Number(!!req.body.can_post),
          Number(!!req.body.can_ads),
          id
        ],
        err => {

          if (err) {
            return res.status(500).json({
              error: "Ошибка обновления"
            });
          }

          res.json({ ok: true });
        }
      );

    } else {

      db.run(
        `INSERT INTO shops
         (name,photoUrl,telegramUrl,description,owner,can_post,can_ads)
         VALUES(?,?,?,?,?,?,?)`,
        [
          name,
          photoUrl,
          telegramUrl,
          description,
          req.session.username,
          Number(!!req.body.can_post),
          Number(!!req.body.can_ads)
        ],
        err => {

          if (err) {
            return res.status(500).json({
              error: "Ошибка создания"
            });
          }

          res.json({ ok: true });
        }
      );
    }
  }
);

app.delete(
  "/api/admin/shop/:id",
  requireAdmin,
  (req, res) => {

    db.run(
      `DELETE FROM shops WHERE id=?`,
      [Number(req.params.id)],
      err => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка удаления"
          });
        }

        res.json({ ok: true });
      }
    );
  }
);

/* =========================================================
   COMPLAINTS
========================================================= */

app.post(
  "/api/complaint",
  requireLogin,
  (req, res) => {

    const targetType =
      cleanText(req.body.targetType, 30);

    const targetId =
      Number(req.body.targetId);

    const reason =
      cleanText(req.body.reason, 500);

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({
        error: "Заполните все поля"
      });
    }

    db.run(
      `INSERT INTO complaints
       (username,targetType,targetId,reason)
       VALUES(?,?,?,?)`,
      [
        req.session.username,
        targetType,
        targetId,
        reason
      ],
      err => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка отправки жалобы"
          });
        }

        res.json({
          ok: true
        });
      }
    );
  }
);

/* =========================================================
   ADMIN DATA
========================================================= */

app.get(
  "/api/admin/data",
  requireAdmin,
  (req, res) => {

    db.all(
      `SELECT id,username,status,avatarUrl,
              referralCode,invitedBy,invites,createdAt
       FROM users
       ORDER BY id DESC`,
      (err, users) => {

        if (err) {
          return res.status(500).json({
            error: "Ошибка пользователей"
          });
        }

        db.all(
          `SELECT * FROM complaints
           ORDER BY id DESC`,
          (err2, complaints) => {

            if (err2) {
              return res.status(500).json({
                error: "Ошибка жалоб"
              });
            }

            res.json({
              users,
              complaints
            });
          }
        );
      }
    );
  }
);

/* =========================================================
   ADMIN STATUS
========================================================= */

app.post(
  "/api/admin/set-status",
  requireAdmin,
  (req, res) => {

    const target =
      cleanUsername(req.body.username);

    const status =
      req.body.status === "admin"
        ? "admin"
        : "user";

    if (!target) {
      return res.status(400).json({
        error: "Пользователь не указан"
      });
    }

    if (
      target.toLowerCase() ===
      MAIN_ADMIN.toLowerCase()
    ) {
      return res.status(403).json({
        error: "Главного администратора изменить нельзя"
      });
    }

    db.run(
      `UPDATE users
       SET status=?
       WHERE username=?`,
      [status, target],
      function (err) {

        if (err) {
          return res.status(500).json({
            error: "Ошибка"
          });
        }

        res.json({
          ok: true,
          changed: this.changes
        });
      }
    );
  }
);

/* =========================================================
   ADMIN DELETE USER
========================================================= */

app.delete(
  "/api/admin/delete-user",
  requireAdmin,
  (req, res) => {

    const target =
      cleanUsername(req.body.username);

    if (!target) {
      return res.status(400).json({
        error: "Пользователь не указан"
      });
    }

    if (
      target.toLowerCase() ===
      MAIN_ADMIN.toLowerCase()
    ) {
      return res.status(403).json({
        error: "Главного администратора удалить нельзя"
      });
    }

    db.run(
      `DELETE FROM users WHERE username=?`,
      [target],
      function (err) {

        if (err) {
          return res.status(500).json({
            error: "Ошибка удаления"
          });
        }

        res.json({
          ok: true,
          deleted: this.changes
        });
      }
    );
  }
);

/* =========================================================
   SOCKET.IO SESSION
========================================================= */

io.use((socket, next) => {

  sessionMiddleware(
    socket.request,
    {},
    next
  );
});

/* =========================================================
   SOCKET.IO CHAT
========================================================= */

io.on("connection", socket => {

  const username =
    socket.request.session &&
    socket.request.session.username;

  if (!username) {
    socket.disconnect(true);
    return;
  }

  getUser(username, (err, user) => {

    if (err || !user) {
      socket.disconnect(true);
      return;
    }

    socket.user = user;

    db.all(
      `SELECT *
       FROM messages
       ORDER BY id DESC
       LIMIT 50`,
      (err, rows) => {

        if (err) return;

        rows.reverse();

        socket.emit(
          "chat_history",
          rows
        );
      }
    );
  });

  /* SEND MESSAGE */

  socket.on("chat_message", data => {

    if (!socket.user) return;

    const text =
      cleanText(data && data.text, 3000);

    const mediaUrl =
      String(data && data.mediaUrl || "");

    const mediaType =
      String(data && data.mediaType || "");

    const isAd =
      Number(data && data.isAd ? 1 : 0);

    if (!text && !mediaUrl) {
      return;
    }

    if (
      mediaUrl &&
      !mediaUrl.startsWith("/uploads/")
    ) {
      return;
    }

    const safeAd =
      socket.user.status === "admin"
        ? isAd
        : 0;

    db.run(
      `INSERT INTO messages
       (username,avatarUrl,text,mediaUrl,mediaType,isAd)
       VALUES(?,?,?,?,?,?)`,
      [
        socket.user.username,
        socket.user.avatarUrl,
        text,
        mediaUrl || null,
        mediaType || null,
        safeAd
      ],
      function (err) {

        if (err) {
          console.error(err);
          return;
        }

        db.get(
          `SELECT * FROM messages
           WHERE id=?`,
          [this.lastID],
          (e, msg) => {

            if (!e && msg) {
              io.emit(
                "chat_new_message",
                msg
              );
            }
          }
        );
      }
    );
  });

  /* EDIT */

  socket.on("edit_message", data => {

    const id =
      Number(data && data.id);

    const text =
      cleanText(data && data.text, 3000);

    if (!id || !text) return;

    db.get(
      `SELECT * FROM messages WHERE id=?`,
      [id],
      (err, msg) => {

        if (err || !msg) return;

        const allowed =
          msg.username === socket.user.username ||
          socket.user.status === "admin";

        if (!allowed) return;

        db.run(
          `UPDATE messages
           SET text=?
           WHERE id=?`,
          [text, id],
          () => {

            io.emit(
              "message_edited",
              {
                id,
                text
              }
            );
          }
        );
      }
    );
  });

  /* DELETE */

  socket.on("delete_message", data => {

    const id =
      Number(data && data.id);

    if (!id) return;

    db.get(
      `SELECT * FROM messages WHERE id=?`,
      [id],
      (err, msg) => {

        if (err || !msg) return;

        const allowed =
          msg.username === socket.user.username ||
          socket.user.status === "admin";

        if (!allowed) return;

        db.run(
          `DELETE FROM messages WHERE id=?`,
          [id],
          () => {

            io.emit(
              "message_deleted",
              { id }
            );
          }
        );
      }
    );
  });

  /* PIN */

  socket.on("pin_message", data => {

    if (socket.user.status !== "admin") {
      return;
    }

    const id =
      Number(data && data.id);

    if (!id) return;

    db.run(
      `UPDATE messages
       SET isPinned=1
       WHERE id=?`,
      [id],
      () => {

        io.emit(
          "message_pinned",
          { id }
        );
      }
    );
  });

  /* UNPIN */

  socket.on("unpin_message", data => {

    if (socket.user.status !== "admin") {
      return;
    }

    const id =
      Number(data && data.id);

    if (!id) return;

    db.run(
      `UPDATE messages
       SET isPinned=0
       WHERE id=?`,
      [id],
      () => {

        io.emit(
          "message_unpinned",
          { id }
        );
      }
    );
  });

  /* LIKE */

  socket.on("toggle_like", data => {

    const id =
      Number(data && data.id);

    if (!id) return;

    db.get(
      `SELECT * FROM messages WHERE id=?`,
      [id],
      (err, msg) => {

        if (err || !msg) return;

        let likedBy = [];

        try {
          likedBy =
            JSON.parse(msg.likedBy || "[]");
        } catch {
          likedBy = [];
        }

        const index =
          likedBy.indexOf(
            socket.user.username
          );

        if (index >= 0) {
          likedBy.splice(index, 1);
        } else {
          likedBy.push(
            socket.user.username
          );
        }

        db.run(
          `UPDATE messages
           SET likedBy=?,
               likes=?
           WHERE id=?`,
          [
            JSON.stringify(likedBy),
            likedBy.length,
            id
          ],
          () => {

            io.emit(
              "message_liked",
              {
                id,
                likes: likedBy.length
              }
            );
          }
        );
      }
    );
  });
});

/* =========================================================
   MAIN PAGE
========================================================= */

app.get("/", (req, res) => {

  if (!req.session.username) {

    const a =
      Math.floor(Math.random() * 9) + 1;

    const b =
      Math.floor(Math.random() * 9) + 1;

    req.session.captchaAnswer =
      String(a + b);

    const ref =
      cleanUsername(req.query.ref);

    return res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1.0">

<title>$AKIHABARA_cc.228$</title>

<style>

*{
box-sizing:border-box;
}

html,body{
margin:0;
padding:0;
min-height:100%;
font-family:Arial,sans-serif;
background:#080811;
color:#fff;
}

body{
background-image:
linear-gradient(
rgba(5,5,15,.78),
rgba(5,5,15,.9)
),
url("${BACKGROUND_IMAGE}");
background-size:cover;
background-position:center;
background-attachment:fixed;
}

.login{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
padding:20px;
}

.card{
width:100%;
max-width:430px;
padding:30px;
border-radius:25px;
background:rgba(12,12,25,.88);
border:1px solid rgba(255,0,180,.35);
box-shadow:
0 0 50px rgba(255,0,180,.15);
backdrop-filter:blur(15px);
}

.logo{
width:130px;
height:130px;
object-fit:cover;
border-radius:50%;
display:block;
margin:0 auto 20px;
border:3px solid #ff2acb;
box-shadow:0 0 35px rgba(255,42,203,.5);
}

h1{
text-align:center;
font-size:25px;
margin:10px 0;
color:#ff35d1;
}

p{
color:#bbb;
text-align:center;
}

input{
width:100%;
padding:15px;
margin:8px 0;
border-radius:13px;
border:1px solid #333;
background:#111120;
color:#fff;
font-size:16px;
outline:none;
}

input:focus{
border-color:#ff2acb;
box-shadow:0 0 15px rgba(255,42,203,.2);
}

button{
width:100%;
padding:15px;
border:0;
border-radius:13px;
background:linear-gradient(
90deg,
#ff1493,
#8a2be2
);
color:#fff;
font-weight:bold;
font-size:16px;
cursor:pointer;
margin-top:10px;
}

.captcha{
text-align:center;
font-size:22px;
margin:15px 0;
color:#48f3ff;
font-weight:bold;
}

.small{
font-size:12px;
color:#777;
}

</style>
</head>

<body>

<div class="login">

<div class="card">

<img
class="logo"
src="${MAIN_IMAGE}"
onerror="this.style.display='none'"
>

<h1>$AKIHABARA_cc.228$</h1>

<p>Premium community</p>

<form method="POST" action="/login">

<input
name="username"
placeholder="@username"
maxlength="32"
required
>

<input
type="hidden"
name="ref"
value="${ref}"
>

<div class="captcha">
${a} + ${b} = ?
</div>

<input
name="captcha"
type="number"
placeholder="Ответ"
required
>

<button>
ВОЙТИ
</button>

</form>

<p class="small">
Используй свой username
</p>

</div>
</div>

</body>
</html>
`);
  }

  /* =====================================================
     AUTHENTICATED APP
  ===================================================== */

  getUser(
    req.session.username,
    (err, user) => {

      if (err || !user) {
        req.session.destroy(() => {
          res.redirect("/");
        });

        return;
      }

      const isAdmin =
        user.status === "admin";

      res.send(`
<!DOCTYPE html>
<html lang="ru">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>$AKIHABARA_cc.228$</title>

<link
rel="stylesheet"
href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
>

<style>

*{
box-sizing:border-box;
}

html,body{
margin:0;
padding:0;
font-family:Arial,sans-serif;
background:#070711;
color:white;
min-height:100%;
}

body{

background-image:
linear-gradient(
rgba(5,5,15,.84),
rgba(5,5,15,.94)
),
url("${BACKGROUND_IMAGE}");

background-size:cover;
background-position:center;
background-attachment:fixed;
}

header{

position:sticky;
top:0;
z-index:20;

display:flex;
align-items:center;
justify-content:space-between;

padding:12px 15px;

background:rgba(8,8,18,.94);

border-bottom:
1px solid rgba(255,0,180,.25);

backdrop-filter:blur(15px);
}

.brand{
font-weight:900;
color:#ff35d1;
font-size:18px;
}

.user-mini{
display:flex;
align-items:center;
gap:8px;
font-size:13px;
}

.user-mini img{
width:34px;
height:34px;
border-radius:50%;
object-fit:cover;
}

nav{

display:flex;
gap:6px;
padding:10px;
overflow-x:auto;

background:rgba(8,8,18,.9);

position:sticky;
top:59px;
z-index:19;
}

nav button{

white-space:nowrap;
width:auto;
padding:11px 14px;
margin:0;

background:#151526;
border:1px solid #292940;

border-radius:12px;

font-size:13px;
}

nav button.active{
background:linear-gradient(
90deg,
#ff1493,
#8a2be2
);
}

main{
max-width:1100px;
margin:auto;
padding:15px;
}

.tab{
display:none;
}

.tab.active{
display:block;
}

.card{

background:rgba(12,12,25,.87);

border:
1px solid rgba(255,0,180,.2);

border-radius:18px;

padding:15px;

margin-bottom:15px;

box-shadow:
0 10px 40px rgba(0,0,0,.25);
}

.hero{

text-align:center;
padding:20px;
}

.hero img{

width:120px;
height:120px;

border-radius:50%;

object-fit:cover;

border:3px solid #ff2acb;

box-shadow:
0 0 35px rgba(255,42,203,.45);
}

.title{
color:#ff35d1;
font-size:22px;
font-weight:bold;
margin:12px 0;
}

.grid{

display:grid;

grid-template-columns:
repeat(auto-fit,minmax(230px,1fr));

gap:12px;
}

input,textarea,select{

width:100%;

padding:12px;

background:#0e0e1c;

color:white;

border:1px solid #292940;

border-radius:10px;

outline:none;

margin:5px 0;
}

textarea{
min-height:90px;
resize:vertical;
}

button{

padding:11px 15px;

border:0;

border-radius:10px;

background:linear-gradient(
90deg,
#ff1493,
#8a2be2
);

color:white;

font-weight:bold;

cursor:pointer;

margin:4px;
}

button.secondary{
background:#202034;
}

button.danger{
background:#9c1535;
}

button.cyan{
background:#087f91;
}

.chat{

height:
calc(100vh - 205px);

min-height:450px;

display:flex;
flex-direction:column;
}

.messages{

flex:1;

overflow-y:auto;

padding:5px;
}

.message{

display:flex;

gap:10px;

padding:10px;

margin:8px 0;

border-radius:14px;

background:rgba(255,255,255,.035);
}

.message.pinned{

border:
1px solid #ff2acb;

background:
rgba(255,42,203,.08);
}

.avatar{

width:42px;
height:42px;

border-radius:50%;

object-fit:cover;

flex-shrink:0;
}

.msg-body{
flex:1;
min-width:0;
}

.msg-top{

display:flex;

align-items:center;

gap:8px;

font-size:13px;
}

.msg-name{

font-weight:bold;
color:#ff54d9;
}

.msg-time{

color:#777;
font-size:11px;
}

.msg-text{

white-space:pre-wrap;

word-break:break-word;

margin-top:5px;

line-height:1.4;
}

.msg-media{

max-width:100%;

max-height:400px;

border-radius:12px;

margin-top:8px;
}

.msg-actions{

display:flex;

gap:4px;

flex-wrap:wrap;

margin-top:6px;
}

.msg-actions button{

font-size:11px;

padding:5px 8px;

background:#202034;
}

.composer{

display:flex;

gap:6px;

padding-top:10px;

border-top:1px solid #242438;
}

.composer textarea{

margin:0;

min-height:48px;

max-height:120px;
}

.file-label{

display:flex;

align-items:center;

justify-content:center;

width:48px;

height:48px;

background:#202034;

border-radius:10px;

cursor:pointer;
}

.file-label input{
display:none;
}

.send{

width:55px;
margin:0;
}

.preview{

display:none;

padding:8px;

background:#151526;

border-radius:10px;

margin-bottom:8px;
}

.preview img,
.preview video{

max-width:180px;

max-height:120px;

border-radius:8px;
}

.profile{

display:flex;

gap:15px;

align-items:center;

flex-wrap:wrap;
}

.profile-avatar{

width:100px;
height:100px;

border-radius:50%;

object-fit:cover;

border:3px solid #ff2acb;
}

.stat{

padding:15px;

background:#101021;

border-radius:12px;

text-align:center;
}

.stat b{

display:block;

font-size:25px;

color:#ff35d1;
}

.item{

padding:14px;

border-radius:14px;

background:#101021;

border:1px solid #25253a;

margin-bottom:10px;
}

.item img{

width:70px;
height:70px;

object-fit:cover;

border-radius:12px;

float:left;

margin-right:12px;
}

.item:after{

content:"";

display:block;

clear:both;
}

.admin-box{

border:
1px solid rgba(255,42,203,.3);

background:
rgba(255,42,203,.05);
}

.badge{

display:inline-block;

padding:4px 8px;

border-radius:20px;

font-size:11px;

background:#222238;
}

.badge.admin{
background:#9b187d;
}

.table-wrap{
overflow-x:auto;
}

table{

width:100%;

border-collapse:collapse;

font-size:13px;
}

td,th{

padding:8px;

border-bottom:1px solid #27273a;

text-align:left;
}

@media(max-width:600px){

main{
padding:8px;
}

.chat{
height:
calc(100vh - 190px);
}

.message{
padding:7px;
}

.avatar{
width:36px;
height:36px;
}

}

</style>

</head>

<body>

<header>

<div class="brand">
$AKIHABARA_cc.228$
</div>

<div class="user-mini">

<img
src="${user.avatarUrl || MAIN_IMAGE}"
id="headerAvatar"
>

<span>
@${user.username}
</span>

</div>

</header>

<nav>

<button
class="active"
onclick="openTab('chat',this)"
>
💬 Чат
</button>

<button
onclick="openTab('exchangers',this)"
>
💱 Обменники
</button>

<button
onclick="openTab('shops',this)"
>
🛍 Магазины
</button>

<button
onclick="openTab('profile',this)"
>
👤 Профиль
</button>

${isAdmin ? `
<button
onclick="openTab('admin',this)"
>
👑 Админ
</button>
` : ""}

</nav>

<main>

<!-- CHAT -->

<section
id="tab-chat"
class="tab active"
>

<div class="card chat">

<div
id="messages"
class="messages"
>
</div>

<div
id="preview"
class="preview"
>
</div>

<div class="composer">

<label class="file-label">

<i class="fa-solid fa-paperclip"></i>

<input
type="file"
id="mediaInput"
accept="image/*,video/*"
>

</label>

<textarea
id="messageInput"
placeholder="Написать сообщение..."
></textarea>

<button
class="send"
onclick="sendMessage()"
>
➤
</button>

</div>

</div>

</section>

<!-- EXCHANGERS -->

<section
id="tab-exchangers"
class="tab"
>

<div class="card">

<div class="title">
💱 Обменники
</div>

<div
id="exchangersList"
>
Загрузка...
</div>

</div>

</section>

<!-- SHOPS -->

<section
id="tab-shops"
class="tab"
>

<div class="card">

<div class="title">
🛍 Магазины
</div>

<div
id="shopsList"
>
Загрузка...
</div>

</div>

</section>

<!-- PROFILE -->

<section
id="tab-profile"
class="tab"
>

<div class="card">

<div class="profile">

<img
id="profileAvatar"
class="profile-avatar"
src="${user.avatarUrl || MAIN_IMAGE}"
>

<div>

<div class="title">
@${user.username}
</div>

<span class="badge ${isAdmin ? "admin" : ""}">
${isAdmin ? "ADMIN" : "USER"}
</span>

</div>

</div>

<hr>

<h3>
Изменить аватар
</h3>

<input
type="file"
id="avatarInput"
accept="image/*"
>

<button onclick="uploadAvatar()">
Загрузить аватар
</button>

</div>

<div class="card">

<div class="title">
🔗 Реферальная система
</div>

<input
id="refLink"
readonly
>

<button
onclick="copyRef()"
>
Скопировать ссылку
</button>

<div
id="refInfo"
>
Загрузка...
</div>

</div>

<div class="card">

<button
class="danger"
onclick="logout()"
>
Выйти
</button>

</div>

</section>

${isAdmin ? `

<!-- ADMIN -->

<section
id="tab-admin"
class="tab"
>

<div class="card admin-box">

<div class="title">
👑 Панель администратора
</div>

<div class="grid">

<div class="stat">
<b id="statUsers">0</b>
Пользователей
</div>

<div class="stat">
<b id="statMessages">0</b>
Сообщений
</div>

<div class="stat">
<b id="statExchangers">0</b>
Обменников
</div>

<div class="stat">
<b id="statShops">0</b>
Магазинов
</div>

</div>

</div>

<div class="card">

<div class="title">
🔗 Ссылка Telegram-чата
</div>

<input
id="chatLinkInput"
placeholder="https://t.me/..."
>

<button onclick="saveChatLink()">
Сохранить
</button>

</div>

<div class="card">

<div class="title">
👤 Управление пользователями
</div>

<div class="table-wrap">

<table>

<thead>

<tr>
<th>Username</th>
<th>Статус</th>
<th>Действия</th>
</tr>

</thead>

<tbody id="usersTable">
</tbody>

</table>

</div>

</div>

<div class="card">

<div class="title">
💱 Добавить обменник
</div>

<input
id="exName"
placeholder="Название"
>

<input
id="exPhoto"
placeholder="URL фото"
>

<input
id="exTelegram"
placeholder="Telegram ссылка"
>

<textarea
id="exDescription"
placeholder="Описание"
></textarea>

<button
onclick="addExchanger()"
>
Добавить
</button>

</div>

<div class="card">

<div class="title">
🛍 Добавить магазин
</div>

<input
id="shopName"
placeholder="Название"
>

<input
id="shopPhoto"
placeholder="URL фото"
>

<input
id="shopTelegram"
placeholder="Telegram ссылка"
>

<textarea
id="shopDescription"
placeholder="Описание"
></textarea>

<button
onclick="addShop()"
>
Добавить
</button>

</div>

<div class="card">

<div class="title">
🚨 Жалобы
</div>

<div id="complaints">
Загрузка...
</div>

</div>

</section>

` : ""}

</main>

<script>

const socket =
io();

const CURRENT_USER =
${JSON.stringify(user.username)};

const CURRENT_STATUS =
${JSON.stringify(user.status)};

const MAIN_IMAGE =
${JSON.stringify(MAIN_IMAGE)};

let selectedMedia = null;

/* =====================================================
   TABS
===================================================== */

function openTab(name, button){

document
.querySelectorAll(".tab")
.forEach(x =>
x.classList.remove("active")
);

document
.getElementById(
"tab-" + name
)
.classList.add("active");

document
.querySelectorAll("nav button")
.forEach(x =>
x.classList.remove("active")
);

if(button){
button.classList.add("active");
}

if(name === "exchangers"){
loadExchangers();
}

if(name === "shops"){
loadShops();
}

if(name === "profile"){
loadProfile();
}

if(name === "admin"){
loadAdmin();
}

}

/* =====================================================
   ESCAPE
===================================================== */

function esc(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

/* =====================================================
   CHAT
===================================================== */

const messages =
document.getElementById("messages");

function appendMessage(msg){

const old =
document.getElementById(
"message-" + msg.id
);

if(old) old.remove();

const div =
document.createElement("div");

div.className =
"message" +
(msg.isPinned ? " pinned" : "");

div.id =
"message-" + msg.id;

let media = "";

if(
msg.mediaUrl &&
msg.mediaType === "image"
){

media = `
<img
class="msg-media"
src="${esc(msg.mediaUrl)}"
loading="lazy"
>
`;

}

if(
msg.mediaUrl &&
msg.mediaType === "video"
){

media = `
<video
class="msg-media"
controls
preload="metadata"
src="${esc(msg.mediaUrl)}"
>
</video>
`;

}

const own =
msg.username === CURRENT_USER;

const admin =
CURRENT_STATUS === "admin";

let actions = `

<button
onclick="likeMessage(${msg.id})"
>
❤️ ${Number(msg.likes || 0)}
</button>
`;

if(own || admin){

actions += `

<button
onclick="editMessage(${msg.id})"
>
✏️
</button>

<button
onclick="deleteMessage(${msg.id})"
>
🗑
</button>
`;

}

if(admin){

if(msg.isPinned){

actions += `

<button
onclick="unpinMessage(${msg.id})"
>
📌 Убрать
</button>
`;

}else{

actions += `

<button
onclick="pinMessage(${msg.id})"
>
📌
</button>
`;

}

}

div.innerHTML = `

<img
class="avatar"
src="${esc(msg.avatarUrl || MAIN_IMAGE)}"
onerror="this.src='${MAIN_IMAGE}'"
>

<div class="msg-body">

<div class="msg-top">

<span class="msg-name">
@${esc(msg.username)}
</span>

<span class="msg-time">
${formatDate(msg.timestamp)}
</span>

${msg.isAd ? `
<span class="badge">
РЕКЛАМА
</span>
` : ""}

</div>

<div class="msg-text">
${esc(msg.text || "")}
</div>

${media}

<div class="msg-actions">
${actions}
</div>

</div>
`;

messages.appendChild(div);

messages.scrollTop =
messages.scrollHeight;

}

function formatDate(date){

try{

return new Date(
date.includes("T")
? date
: date.replace(" ","T") + "Z"
).toLocaleString(
"ru-RU",
{
hour:"2-digit",
minute:"2-digit",
day:"2-digit",
month:"2-digit"
}
);

}catch{

return "";

}

}

socket.on(
"chat_history",
rows => {

messages.innerHTML = "";

rows.forEach(
appendMessage
);

}
);

socket.on(
"chat_new_message",
appendMessage
);

socket.on(
"message_edited",
data => {

const el =
document.querySelector(
"#message-" + data.id + " .msg-text"
);

if(el){

el.textContent =
data.text;

}

}
);

socket.on(
"message_deleted",
data => {

const el =
document.getElementById(
"message-" + data.id
);

if(el) el.remove();

}
);

socket.on(
"message_pinned",
data => {

const el =
document.getElementById(
"message-" + data.id
);

if(el){

el.classList.add(
"pinned"
);

}

}
);

socket.on(
"message_unpinned",
data => {

const el =
document.getElementById(
"message-" + data.id
);

if(el){

el.classList.remove(
"pinned"
);

}

}
);

socket.on(
"message_liked",
data => {

const el =
document.querySelector(
"#message-" +
data.id +
" .msg-actions button"
);

if(el){

el.textContent =
"❤️ " + data.likes;

}

}
);

/* =====================================================
   SEND
===================================================== */

async function sendMessage(){

const input =
document.getElementById(
"messageInput"
);

const text =
input.value.trim();

if(!text && !selectedMedia){
return;
}

let mediaUrl = "";
let mediaType = "";

if(selectedMedia){

const form =
new FormData();

form.append(
"media",
selectedMedia
);

try{

const response =
await fetch(
"/api/upload",
{
method:"POST",
body:form
}
);

const result =
await response.json();

if(!response.ok){

alert(
result.error ||
"Ошибка загрузки"
);

return;

}

mediaUrl =
result.mediaUrl;

mediaType =
result.mediaType;

}catch{

alert(
"Не удалось загрузить файл"
);

return;

}

}

socket.emit(
"chat_message",
{
text,
mediaUrl,
mediaType
}
);

input.value = "";

selectedMedia = null;

document.getElementById(
"mediaInput"
).value = "";

document.getElementById(
"preview"
).style.display =
"none";

}

document
.getElementById("messageInput")
.addEventListener(
"keydown",
e => {

if(
e.key === "Enter" &&
!e.shiftKey
){

e.preventDefault();

sendMessage();

}

}
);

/* =====================================================
   MEDIA PREVIEW
===================================================== */

document
.getElementById("mediaInput")
.addEventListener(
"change",
e => {

const file =
e.target.files[0];

if(!file) return;

selectedMedia = file;

const preview =
document.getElementById(
"preview"
);

preview.style.display =
"block";

const url =
URL.createObjectURL(file);

if(file.type.startsWith("video/")){

preview.innerHTML = `
<video
controls
src="${url}"
></video>
`;

}else{

preview.innerHTML = `
<img
src="${url}"
>
`;

}

}
);

/* =====================================================
   CHAT ACTIONS
===================================================== */

function editMessage(id){

const text =
prompt(
"Введите новый текст:"
);

if(text){

socket.emit(
"edit_message",
{
id,
text
}
);

}

}

function deleteMessage(id){

if(
!confirm(
"Удалить сообщение?"
)
) return;

socket.emit(
"delete_message",
{id}
);

}

function pinMessage(id){

socket.emit(
"pin_message",
{id}
);

}

function unpinMessage(id){

socket.emit(
"unpin_message",
{id}
);

}

function likeMessage(id){

socket.emit(
"toggle_like",
{id}
);

}

/* =====================================================
   EXCHANGERS
===================================================== */

async function loadExchangers(){

const box =
document.getElementById(
"exchangersList"
);

const response =
await fetch(
"/api/exchangers"
);

const rows =
await response.json();

if(!rows.length){

box.innerHTML =
"<p>Пока нет обменников.</p>";

return;

}

box.innerHTML =
rows.map(x => `

<div class="item">

<img
src="${esc(x.photoUrl || MAIN_IMAGE)}"
onerror="this.src='${MAIN_IMAGE}'"
>

<b>
${esc(x.name)}
</b>

<p>
${esc(x.description || "")}
</p>

${
x.telegramUrl
?
`
<a
href="${esc(x.telegramUrl)}"
target="_blank"
rel="noopener"
>
<button>
Telegram
</button>
</a>
`
:
""
}

</div>

`).join("");

}

/* =====================================================
   SHOPS
===================================================== */

async function loadShops(){

const box =
document.getElementById(
"shopsList"
);

const response =
await fetch(
"/api/shops"
);

const rows =
await response.json();

if(!rows.length){

box.innerHTML =
"<p>Пока нет магазинов.</p>";

return;

}

box.innerHTML =
rows.map(x => `

<div class="item">

<img
src="${esc(x.photoUrl || MAIN_IMAGE)}"
onerror="this.src='${MAIN_IMAGE}'"
>

<b>
${esc(x.name)}
</b>

<p>
${esc(x.description || "")}
</p>

${
x.telegramUrl
?
`
<a
href="${esc(x.telegramUrl)}"
target="_blank"
rel="noopener"
>
<button>
Telegram
</button>
</a>
`
:
""
}

</div>

`).join("");

}

/* =====================================================
   PROFILE
===================================================== */

async function loadProfile(){

const response =
await fetch(
"/api/referrals"
);

const data =
await response.json();

const link =
location.origin +
"/?ref=" +
encodeURIComponent(
data.code
);

document.getElementById(
"refLink"
).value =
link;

document.getElementById(
"refInfo"
).innerHTML = `

<p>
Приглашено:
<b>${data.count}</b>
</p>

${
data.users.length
?
data.users.map(
x =>
"<div class='item'>@" +
esc(x.username) +
" — " +
esc(x.status) +
"</div>"
).join("")
:
"<p>Пока никого нет.</p>"
}

`;

}

async function uploadAvatar(){

const input =
document.getElementById(
"avatarInput"
);

const file =
input.files[0];

if(!file){

alert(
"Выбери изображение"
);

return;

}

const form =
new FormData();

form.append(
"avatar",
file
);

const response =
await fetch(
"/api/profile/avatar",
{
method:"POST",
body:form
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

document.getElementById(
"profileAvatar"
).src =
data.avatarUrl;

document.getElementById(
"headerAvatar"
).src =
data.avatarUrl;

alert(
"Аватар изменён"
);

}

function copyRef(){

const input =
document.getElementById(
"refLink"
);

navigator.clipboard
.writeText(input.value)
.then(
() => alert(
"Ссылка скопирована"
)
);

}

/* =====================================================
   ADMIN
===================================================== */

async function loadAdmin(){

const stats =
await fetch(
"/api/stats"
)
.then(r => r.json());

document.getElementById(
"statUsers"
).textContent =
stats.users;

document.getElementById(
"statMessages"
).textContent =
stats.messages;

document.getElementById(
"statExchangers"
).textContent =
stats.exchangers;

document.getElementById(
"statShops"
).textContent =
stats.shops;

const data =
await fetch(
"/api/admin/data"
)
.then(r => r.json());

const table =
document.getElementById(
"usersTable"
);

table.innerHTML =
data.users.map(u => `

<tr>

<td>
@${esc(u.username)}
</td>

<td>
<span class="badge">
${esc(u.status)}
</span>
</td>

<td>

${
u.username.toLowerCase() !==
"${MAIN_ADMIN.toLowerCase()}"
?
`

<button
onclick="setUserStatus(
'${encodeURIComponent(u.username)}',
'admin'
)"
>
👑
</button>

<button
onclick="setUserStatus(
'${encodeURIComponent(u.username)}',
'user'
)"
>
👤
</button>

<button
class="danger"
onclick="deleteUser(
'${encodeURIComponent(u.username)}'
)"
>
🗑
</button>

`
:
"<span>Главный</span>"
}

</td>

</tr>

`).join("");

const complaints =
document.getElementById(
"complaints"
);

complaints.innerHTML =
data.complaints.length
?
data.complaints.map(c => `

<div class="item">

<b>
@${esc(c.username)}
</b>

<p>
${esc(c.reason)}
</p>

<span class="badge">
${esc(c.targetType)}
#${esc(c.targetId)}
</span>

</div>

`).join("")
:
"<p>Жалоб нет.</p>";

loadChatLink();

}

/* =====================================================
   ADMIN USER
===================================================== */

async function setUserStatus(
username,
status
){

username =
decodeURIComponent(username);

const response =
await fetch(
"/api/admin/set-status",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
username,
status
})
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

loadAdmin();

}

async function deleteUser(username){

username =
decodeURIComponent(username);

if(
!confirm(
"Удалить @" +
username +
"?"
)
) return;

const response =
await fetch(
"/api/admin/delete-user",
{
method:"DELETE",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
username
})
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

loadAdmin();

}

/* =====================================================
   ADMIN CHAT LINK
===================================================== */

async function loadChatLink(){

const response =
await fetch(
"/api/chat-link"
);

const data =
await response.json();

document.getElementById(
"chatLinkInput"
).value =
data.chatLink || "";

}

async function saveChatLink(){

const link =
document.getElementById(
"chatLinkInput"
).value.trim();

const response =
await fetch(
"/api/admin/update-chat-link",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify({
link
})
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

alert(
"Ссылка сохранена"
);

}

/* =====================================================
   ADMIN ADD EXCHANGER
===================================================== */

async function addExchanger(){

const body = {

name:
document.getElementById(
"exName"
).value,

photoUrl:
document.getElementById(
"exPhoto"
).value,

telegramUrl:
document.getElementById(
"exTelegram"
).value,

description:
document.getElementById(
"exDescription"
).value

};

const response =
await fetch(
"/api/admin/exchanger",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify(body)
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

alert(
"Обменник добавлен"
);

loadExchangers();

}

/* =====================================================
   ADMIN ADD SHOP
===================================================== */

async function addShop(){

const body = {

name:
document.getElementById(
"shopName"
).value,

photoUrl:
document.getElementById(
"shopPhoto"
).value,

telegramUrl:
document.getElementById(
"shopTelegram"
).value,

description:
document.getElementById(
"shopDescription"
).value

};

const response =
await fetch(
"/api/admin/shop",
{
method:"POST",
headers:{
"Content-Type":
"application/json"
},
body:JSON.stringify(body)
}
);

const data =
await response.json();

if(!response.ok){

alert(
data.error ||
"Ошибка"
);

return;

}

alert(
"Магазин добавлен"
);

loadShops();

}

/* =====================================================
   LOGOUT
===================================================== */

async function logout(){

await fetch(
"/logout",
{
method:"POST"
}
);

location.href = "/";

}

</script>

</body>
</html>
`);
    }
  );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {

  console.error(err);

  if (
    err instanceof multer.MulterError
  ) {

    return res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Файл слишком большой. Максимум 50 МБ."
          : err.message
    });
  }

  if (err) {

    return res.status(400).json({
      error: err.message || "Ошибка"
    });
  }

  next();
});

/* =========================================================
   START
========================================================= */

server.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("======================================");
  console.log("$AKIHABARA_cc.228$");
  console.log("SERVER STARTED");
  console.log("PORT:", PORT);
  console.log("======================================");
  console.log("");

});
