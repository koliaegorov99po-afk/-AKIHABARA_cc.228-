Const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const MAIN_ADMIN = "koliaegorov99po-afk";
const DEFAULT_TELEGRAM_CHAT = "https://t.me/+K9gPO5PUyttlN2Zi";

const publicDir = path.join(__dirname, "public");

if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

/* =========================================================
   POSTGRESQL DATABASE (SUPABASE)
========================================================= */

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error("Ошибка подключения к базе данных Supabase:", err.stack);
    }
    console.log("Успешное подключение к постоянной базе данных Supabase!");
    release();
});

// Инициализация таблиц для PostgreSQL
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'user',
                avatarUrl TEXT DEFAULT '',
                referralCode TEXT UNIQUE,
                invitedBy TEXT DEFAULT '',
                invites INTEGER DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                avatarUrl TEXT DEFAULT '',
                text TEXT DEFAULT '',
                mediaUrl TEXT DEFAULT '',
                mediaType TEXT DEFAULT '',
                isAd INTEGER DEFAULT 0,
                isPinned INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_likes (
                id SERIAL PRIMARY KEY,
                messageId INTEGER NOT NULL,
                username TEXT NOT NULL,
                UNIQUE(messageId, username)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS exchangers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                photoUrl TEXT DEFAULT '',
                telegramUrl TEXT DEFAULT '',
                description TEXT DEFAULT '',
                owner TEXT DEFAULT '',
                can_post INTEGER DEFAULT 1,
                can_ads INTEGER DEFAULT 1
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS shops (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                photoUrl TEXT DEFAULT '',
                telegramUrl TEXT DEFAULT '',
                description TEXT DEFAULT '',
                owner TEXT DEFAULT '',
                can_post INTEGER DEFAULT 1,
                can_ads INTEGER DEFAULT 1
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                target_type TEXT NOT NULL,
                target_name TEXT NOT NULL,
                complainant TEXT NOT NULL,
                reason TEXT DEFAULT '',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT DEFAULT ''
            )
        `);

        await pool.query(`
            INSERT INTO settings(key, value)
            VALUES('telegram_chat', $1)
            ON CONFLICT (key) DO NOTHING
        `, [DEFAULT_TELEGRAM_CHAT]);

        await pool.query(`
            INSERT INTO users
            (username, status, avatarUrl, referralCode)
            VALUES ($1, 'main_admin', '', $2)
            ON CONFLICT (username) DO NOTHING
        `, [MAIN_ADMIN, MAIN_ADMIN]);

        console.log("Таблицы базы данных успешно инициализированы.");
    } catch (err) {
        console.error("Ошибка при инициализации таблиц:", err);
    }
}

initDatabase();

/* =========================================================
   HELPERS
========================================================= */

function generateReferralCode(username) {
    return crypto
        .createHash("sha256")
        .update(username + Date.now() + Math.random())
        .digest("hex")
        .slice(0, 10);
}

function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .replace(/^@/, "")
        .slice(0, 32);
}

async function getUser(username, callback) {
    try {
        const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        callback(null, result.rows[0] || null);
    } catch (err) {
        callback(err, null);
    }
}

function isMainAdmin(username) {
    return username === MAIN_ADMIN;
}

function isAdmin(username, callback) {
    if (!username) return callback(false);

    getUser(username, (err, user) => {
        if (err || !user) return callback(false);

        callback(
            user.status === "admin" ||
            user.status === "main_admin"
        );
    });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(bodyParser.urlencoded({
    extended: true,
    limit: "20mb"
}));

app.use(express.json({
    limit: "20mb"
}));

app.use(express.static(publicDir));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "akihabara_secret_key_228",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        sameSite: "lax"
    }
});

app.use(sessionMiddleware);

io.use((socket, next) => {
    sessionMiddleware(
        socket.request,
        {},
        next
    );
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/login", async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const ref = normalizeUsername(req.body.ref);

    if (!username) {
        return res.status(400).json({
            ok: false,
            error: "Введите имя пользователя"
        });
    }

    if (username.length < 3) {
        return res.status(400).json({
            ok: false,
            error: "Имя должно содержать минимум 3 символа"
        });
    }

    try {
        const existingResult = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        if (existingResult.rows.length > 0) {
            const existingUser = existingResult.rows[0];
            req.session.username = existingUser.username;
            return res.json({
                ok: true,
                user: existingUser
            });
        }

        const referralCode = generateReferralCode(username);
        const insertResult = await pool.query(
            `
            INSERT INTO users
            (username, status, referralCode, invitedBy)
            VALUES ($1, 'user', $2, $3)
            RETURNING *
            `,
            [username, referralCode, ref]
        );

        const newUser = insertResult.rows[0];

        if (ref) {
            await pool.query(
                `
                UPDATE users
                SET invites = invites + 1
                WHERE username = $1
                `,
                [ref]
            );
        }

        req.session.username = username;

        io.emit("system_message", {
            text: `${username} присоединился к AKIHABARA`
        });

        io.emit("users_updated");

        res.json({
            ok: true,
            user: newUser
        });
    } catch (err) {
        console.error("Ошибка при входе/регистрации:", err);
        return res.status(500).json({
            ok: false,
            error: "Ошибка базы данных или создания пользователя"
        });
    }
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

app.get("/api/user", (req, res) => {
    if (!req.session.username) {
        return res.json({
            loggedIn: false
        });
    }

    getUser(req.session.username, (err, user) => {
        if (err || !user) {
            return res.json({
                loggedIn: false
            });
        }

        res.json({
            loggedIn: true,
            user
        });
    });
});

app.get("/api/stats", async (req, res) => {
    try {
        const usersResult = await pool.query("SELECT COUNT(*) AS total FROM users");
        const refsResult = await pool.query("SELECT COUNT(*) AS total FROM users WHERE invitedBy != ''");
        res.json({
            users: usersResult.rows[0] ? Number(usersResult.rows[0].total) : 0,
            referrals: refsResult.rows[0] ? Number(refsResult.rows[0].total) : 0
        });
    } catch (err) {
        res.json({ users: 0, referrals: 0 });
    }
});

app.get("/api/users", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, status, avatarUrl,
                   referralCode, invitedBy, invites, createdAt
            FROM users
            ORDER BY id DESC
        `);
        res.json({
            ok: true,
            users: result.rows
        });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

/* =========================================================
   TELEGRAM CHAT
========================================================= */

app.get("/api/telegram-chat", async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'telegram_chat'");
        res.json({
            url: result.rows[0] ? result.rows[0].value : DEFAULT_TELEGRAM_CHAT
        });
    } catch (err) {
        res.json({ url: DEFAULT_TELEGRAM_CHAT });
    }
});

app.post("/api/admin/telegram-chat", async (req, res) => {
    const username = req.session.username;

    if (!isMainAdmin(username)) {
        return res.status(403).json({
            ok: false,
            error: "Только главный администратор"
        });
    }

    const url = String(req.body.url || "").trim();

    if (!url.startsWith("https://t.me/")) {
        return res.status(400).json({
            ok: false,
            error: "Введите правильную Telegram ссылку"
        });
    }

    try {
        await pool.query(
            `
            INSERT INTO settings(key, value)
            VALUES('telegram_chat', $1)
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value
            `,
            [url]
        );

        io.emit("telegram_chat_updated", url);

        res.json({
            ok: true,
            url
        });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

/* =========================================================
   ADMIN MANAGEMENT
========================================================= */

app.get("/api/admins", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, status, avatarUrl, createdAt
            FROM users
            WHERE status IN ('admin','main_admin')
            ORDER BY
                CASE WHEN status = 'main_admin' THEN 0 ELSE 1 END,
                id ASC
        `);
        res.json({
            ok: true,
            admins: result.rows
        });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.post("/api/admins/add", (req, res) => {
    if (!isMainAdmin(req.session.username)) {
        return res.status(403).json({
            ok: false,
            error: "Добавлять администраторов может только главный администратор"
        });
    }

    const username = normalizeUsername(req.body.username);

    if (!username) {
        return res.status(400).json({
            ok: false,
            error: "Введите username"
        });
    }

    getUser(username, async (err, user) => {
        if (err) {
            return res.status(500).json({ ok: false });
        }

        try {
            if (!user) {
                const referralCode = generateReferralCode(username);
                await pool.query(
                    `
                    INSERT INTO users
                    (username, status, referralCode)
                    VALUES ($1, 'admin', $2)
                    `,
                    [username, referralCode]
                );

                io.emit("admins_updated");
                io.emit("users_updated");

                return res.json({
                    ok: true,
                    message: "Администратор добавлен"
                });
            }

            if (user.status === "main_admin") {
                return res.status(400).json({
                    ok: false,
                    error: "Это главный администратор"
                });
            }

            await pool.query(
                `
                UPDATE users
                SET status = 'admin'
                WHERE username = $1
                `,
                [username]
            );

            io.emit("admins_updated");
            io.emit("users_updated");

            res.json({
                ok: true,
                message: "Пользователь назначен администратором"
            });
        } catch (updateErr) {
            res.status(500).json({ ok: false, error: "Ошибка при добавлении администратора" });
        }
    });
});

app.post("/api/admins/remove", async (req, res) => {
    if (!isMainAdmin(req.session.username)) {
        return res.status(403).json({
            ok: false,
            error: "Только главный администратор"
        });
    }

    const username = normalizeUsername(req.body.username);

    if (username === MAIN_ADMIN) {
        return res.status(400).json({
            ok: false,
            error: "Главного администратора удалить нельзя"
        });
    }

    try {
        await pool.query(
            `
            UPDATE users
            SET status = 'user'
            WHERE username = $1
            `,
            [username]
        );

        io.emit("admins_updated");
        io.emit("users_updated");

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.post("/api/admins/edit", async (req, res) => {
    if (!isMainAdmin(req.session.username)) {
        return res.status(403).json({
            ok: false,
            error: "Только главный администратор"
        });
    }

    const oldUsername = normalizeUsername(req.body.oldUsername);
    const newUsername = normalizeUsername(req.body.newUsername);

    if (!oldUsername || !newUsername) {
        return res.status(400).json({
            ok: false,
            error: "Заполните данные"
        });
    }

    if (oldUsername === MAIN_ADMIN) {
        return res.status(400).json({
            ok: false,
            error: "Главного администратора переименовать нельзя"
        });
    }

    try {
        const result = await pool.query(
            `
            UPDATE users
            SET username = $1
            WHERE username = $2
            AND status = 'admin'
            `,
            [newUsername, oldUsername]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                error: "Администратор не найден"
            });
        }

        io.emit("admins_updated");
        io.emit("users_updated");

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: "Не удалось изменить администратора" });
    }
});

/* =========================================================
   USER STATUS & AVATAR BY MAIN ADMIN
========================================================= */

app.post("/api/admin/user-status", (req, res) => {
    const admin = req.session.username;

    isAdmin(admin, async allowed => {
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Нет доступа"
            });
        }

        const username = normalizeUsername(req.body.username);
        const status = String(req.body.status || "user");

        if (!["user", "admin"].includes(status)) {
            return res.status(400).json({ ok: false });
        }

        if (username === MAIN_ADMIN && status !== "main_admin") {
            return res.status(400).json({
                ok: false,
                error: "Нельзя изменить главного администратора"
            });
        }

        try {
            await pool.query(
                `
                UPDATE users
                SET status = $1
                WHERE username = $2
                `,
                [status, username]
            );

            io.emit("users_updated");
            io.emit("admins_updated");

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

app.post("/api/admin/set-user-avatar", async (req, res) => {
    if (!isMainAdmin(req.session.username)) {
        return res.status(403).json({
            ok: false,
            error: "Только главный администратор может менять аватарки пользователям"
        });
    }

    const username = normalizeUsername(req.body.username);
    const avatarUrl = String(req.body.avatarUrl || "").trim().slice(0, 2048);

    try {
        await pool.query(
            `
            UPDATE users
            SET avatarUrl = $1
            WHERE username = $2
            `,
            [avatarUrl, username]
        );
        io.emit("users_updated");
        io.emit("admins_updated");
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.post("/api/admin/delete-user", async (req, res) => {
    const admin = req.session.username;

    if (!isMainAdmin(admin)) {
        return res.status(403).json({
            ok: false,
            error: "Только главный администратор"
        });
    }

    const username = normalizeUsername(req.body.username);

    if (username === MAIN_ADMIN) {
        return res.status(400).json({
            ok: false,
            error: "Нельзя удалить главного администратора"
        });
    }

    try {
        await pool.query("DELETE FROM users WHERE username = $1", [username]);

        io.emit("users_updated");
        io.emit("admins_updated");

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

/* =========================================================
   REFERRALS
========================================================= */

app.get("/api/referrals", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ ok: false });
    }

    try {
        const result = await pool.query(
            `
            SELECT username, status, createdAt
            FROM users
            WHERE invitedBy = $1
            ORDER BY id DESC
            `,
            [req.session.username]
        );

        res.json({
            ok: true,
            referrals: result.rows
        });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

/* =========================================================
   PROFILE
========================================================= */

app.post("/api/profile/avatar", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ ok: false });
    }

    const avatarUrl = String(
        req.body.avatarUrl || ""
    ).trim().slice(0, 2048);

    try {
        await pool.query(
            `
            UPDATE users
            SET avatarUrl = $1
            WHERE username = $2
            `,
            [avatarUrl, req.session.username]
        );

        io.emit("users_updated");

        res.json({
            ok: true,
            avatarUrl
        });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

/* =========================================================
   EXCHANGERS
========================================================= */

app.get("/api/exchangers", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM exchangers
            ORDER BY id DESC
        `);
        res.json({
            ok: true,
            exchangers: result.rows || []
        });
    } catch (err) {
        res.json({ ok: false, exchangers: [] });
    }
});

app.post("/api/exchangers/add", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Нет доступа"
            });
        }

        const {
            name,
            photoUrl,
            telegramUrl,
            description,
            owner,
            can_post,
            can_ads
        } = req.body;

        if (!String(name || "").trim()) {
            return res.status(400).json({
                ok: false,
                error: "Введите название обменника"
            });
        }

        const targetOwner = isMainAdmin(req.session.username) && owner ? normalizeUsername(owner) : req.session.username;

        try {
            await pool.query(
                `
                INSERT INTO exchangers
                (name, photoUrl, telegramUrl, description, owner, can_post, can_ads)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                `,
                [
                    String(name).trim(),
                    String(photoUrl || "").trim().slice(0, 2048),
                    String(telegramUrl || "").trim().slice(0, 500),
                    String(description || "").trim().slice(0, 2000),
                    targetOwner,
                    can_post ? 1 : 0,
                    can_ads ? 1 : 0
                ]
            );

            io.emit("exchangers_updated");

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

app.post("/api/exchangers/edit", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({ ok: false });
        }

        const id = Number(req.body.id);
        const {
            name,
            photoUrl,
            telegramUrl,
            description,
            owner,
            can_post,
            can_ads
        } = req.body;

        try {
            let updateOwnerQuery = "";
            let queryParams = [
                String(name || "").trim(),
                String(photoUrl || "").trim().slice(0, 2048),
                String(telegramUrl || "").trim().slice(0, 500),
                String(description || "").trim().slice(0, 2000),
                can_post ? 1 : 0,
                can_ads ? 1 : 0
            ];

            if (isMainAdmin(req.session.username) && owner) {
                queryParams.push(normalizeUsername(owner));
                updateOwnerQuery = `, owner = $${queryParams.length}`;
            }
            queryParams.push(id);

            await pool.query(
                `
                UPDATE exchangers
                SET name = $1,
                    photoUrl = $2,
                    telegramUrl = $3,
                    description = $4,
                    can_post = $5,
                    can_ads = $6
                    ${updateOwnerQuery}
                WHERE id = $${queryParams.length}
                `,
                queryParams
            );

            io.emit("exchangers_updated");

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

app.post("/api/exchangers/delete", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({ ok: false });
        }

        try {
            await pool.query("DELETE FROM exchangers WHERE id = $1", [Number(req.body.id)]);
            io.emit("exchangers_updated");
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

/* =========================================================
   SHOPS
========================================================= */

app.get("/api/shops", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM shops
            ORDER BY id DESC
        `);
        res.json({
            ok: true,
            shops: result.rows || []
        });
    } catch (err) {
        res.json({ ok: false, shops: [] });
    }
});

app.post("/api/shops/add", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "Нет доступа"
            });
        }

        const {
            name,
            photoUrl,
            telegramUrl,
            description,
            owner,
            can_post,
            can_ads
        } = req.body;

        if (!String(name || "").trim()) {
            return res.status(400).json({
                ok: false,
                error: "Введите название магазина"
            });
        }

        const targetOwner = isMainAdmin(req.session.username) && owner ? normalizeUsername(owner) : req.session.username;

        try {
            await pool.query(
                `
                INSERT INTO shops
                (name, photoUrl, telegramUrl, description, owner, can_post, can_ads)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                `,
                [
                    String(name).trim(),
                    String(photoUrl || "").trim().slice(0, 2048),
                    String(telegramUrl || "").trim().slice(0, 500),
                    String(description || "").trim().slice(0, 2000),
                    targetOwner,
                    can_post ? 1 : 0,
                    can_ads ? 1 : 0
                ]
            );

            io.emit("shops_updated");

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

app.post("/api/shops/edit", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({ ok: false });
        }

        const {
            name,
            photoUrl,
            telegramUrl,
            description,
            owner,
            can_post,
            can_ads
        } = req.body;

        try {
            let updateOwnerQuery = "";
            let queryParams = [
                String(name || "").trim(),
                String(photoUrl || "").trim().slice(0, 2048),
                String(telegramUrl || "").trim().slice(0, 500),
                String(description || "").trim().slice(0, 2000),
                can_post ? 1 : 0,
                can_ads ? 1 : 0
            ];

            if (isMainAdmin(req.session.username) && owner) {
                queryParams.push(normalizeUsername(owner));
                updateOwnerQuery = `, owner = $${queryParams.length}`;
            }
            queryParams.push(Number(req.body.id));

            await pool.query(
                `
                UPDATE shops
                SET name = $1,
                    photoUrl = $2,
                    telegramUrl = $3,
                    description = $4,
                    can_post = $5,
                    can_ads = $6
                    ${updateOwnerQuery}
                WHERE id = $${queryParams.length}
                `,
                queryParams
            );

            io.emit("shops_updated");

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

app.post("/api/shops/delete", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({ ok: false });
        }

        try {
            await pool.query("DELETE FROM shops WHERE id = $1", [Number(req.body.id)]);
            io.emit("shops_updated");
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ ok: false });
        }
    });
});

/* =========================================================
   COMPLAINTS
========================================================= */

app.post("/api/complaints", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ ok: false });
    }

    const targetType = String(req.body.target_type || "");
    const targetName = String(req.body.target_name || "");
    const reason = String(req.body.reason || "");

    try {
        await pool.query(
            `
            INSERT INTO complaints
            (target_type, target_name, complainant, reason)
            VALUES ($1, $2, $3, $4)
            `,
            [targetType, targetName, req.session.username, reason]
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.get("/api/admin/complaints", (req, res) => {
    isAdmin(req.session.username, async allowed => {
        if (!allowed) {
            return res.status(403).json({ ok: false });
        }

        try {
            const result = await pool.query(`
                SELECT *
                FROM complaints
                ORDER BY id DESC
            `);
            res.json({
                ok: true,
                complaints: result.rows || []
            });
        } catch (err) {
            res.json({ ok: false, complaints: [] });
        }
    });
});

/* =========================================================
   MAIN PAGE
========================================================= */

app.get("/", (req, res) => {

    if (!req.session.username) {
        return res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$AKIHABARA_cc.228$</title>
<style>
* { box-sizing: border-box; }
body {
    margin: 0;
    min-height: 100vh;
    font-family: Arial, sans-serif;
    background: linear-gradient(rgba(0,0,0,.65),rgba(0,0,0,.85)), url('/background.jpg') center/cover fixed;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
}
.login {
    width: min(420px,92%);
    padding: 30px;
    border-radius: 25px;
    background: rgba(10,10,10,.88);
    border: 1px solid rgba(255,255,255,.15);
    box-shadow: 0 20px 70px rgba(0,0,0,.7);
    text-align: center;
}
.logo {
    width: 100%;
    max-height: 180px;
    object-fit: contain;
    margin-bottom: 15px;
}
h1 { font-size: 26px; margin: 10px 0 25px; }
input {
    width: 100%;
    padding: 15px;
    border-radius: 14px;
    border: 1px solid #444;
    background: #151515;
    color: white;
    outline: none;
    margin-bottom: 12px;
}
button {
    width: 100%;
    padding: 14px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(135deg,#ff1744,#8e24aa);
    color: white;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
}
.error { color: #ff6b81; margin-top: 12px; }
</style>
</head>
<body>
<div class="login">
<img class="logo" src="/banner.png">
<h1>$AKIHABARA_cc.228$</h1>
<input id="username" placeholder="Введите username" autocomplete="off">
<input id="ref" placeholder="Реферальный код (необязательно)" autocomplete="off">
<button onclick="login()">ВОЙТИ</button>
<div id="error" class="error"></div>
</div>
<script>
async function login() {
    const username = document.getElementById("username").value.trim();
    const ref = document.getElementById("ref").value.trim();
    if (!username) {
        document.getElementById("error").textContent = "Введите username";
        return;
    }
    const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, ref })
    });
    const data = await response.json();
    if (!data.ok) {
        document.getElementById("error").textContent = data.error || "Ошибка входа";
        return;
    }
    location.reload();
}
document.getElementById("username").addEventListener("keydown", e => {
    if (e.key === "Enter") { login(); }
});
</script>
</body>
</html>
        `);
    }

    /* =====================================================
       MAIN APPLICATION
    ===================================================== */

    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>$AKIHABARA_cc.228$</title>
<script src="/socket.io/socket.io.js"></script>
<style>
* { box-sizing: border-box; }
body {
    margin: 0;
    background: linear-gradient(rgba(0,0,0,.75),rgba(0,0,0,.9)), url('/background.jpg') center/cover fixed;
    color: white;
    font-family: Arial,sans-serif;
}
.header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(5,5,5,.94);
    backdrop-filter: blur(15px);
    border-bottom: 1px solid #292929;
}
.header-inner { max-width: 1200px; margin: auto; padding: 12px; }
.brand { text-align: center; font-size: 21px; font-weight: 900; margin-bottom: 10px; }
.stats { display: flex; gap: 8px; flex-wrap: wrap; }
.stat {
    flex: 1;
    min-width: 90px;
    background: #151515;
    padding: 9px;
    border-radius: 12px;
    text-align: center;
    font-size: 13px;
}
.telegram { background: linear-gradient(135deg,#0088cc,#00a8ff); }
.telegram a { color: white; text-decoration: none; font-weight: bold; }
.container { max-width: 1200px; margin: auto; padding: 15px; }
.tabs { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 15px; }
.tab {
    background: #171717;
    color: white;
    border: 1px solid #333;
    padding: 13px 5px;
    border-radius: 13px;
    cursor: pointer;
}
.tab.active { background: linear-gradient(135deg,#ff1744,#8e24aa); }
.page { display: none; }
.page.active { display: block; }
.chat {
    min-height: 500px;
    background: rgba(8,8,8,.88);
    border-radius: 20px;
    padding: 15px;
    border: 1px solid #292929;
}
.messages { min-height: 400px; max-height: 60vh; overflow-y: auto; }
.message { display: flex; gap: 10px; margin-bottom: 13px; }
.avatar {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    object-fit: cover;
    background: #222;
}
.message-body { max-width: calc(100% - 55px); }
.username { color: #ff4770; font-weight: bold; margin-bottom: 3px; }
.text {
    background: #181818;
    border: 1px solid #2d2d2d;
    padding: 10px 12px;
    border-radius: 13px;
    word-wrap: break-word;
}
.message img.media {
    max-width: 280px;
    max-height: 300px;
    border-radius: 12px;
    display: block;
    margin-top: 7px;
}
.message video { max-width: 300px; border-radius: 12px; margin-top: 7px; }
.message-actions { margin-top: 5px; display: flex; gap: 5px; flex-wrap: wrap; }
.small-btn {
    border: 0;
    background: #252525;
    color: #ddd;
    padding: 5px 9px;
    border-radius: 8px;
    cursor: pointer;
}
.composer { margin-top: 15px; }
textarea {
    width: 100%;
    min-height: 70px;
    resize: vertical;
    background: #111;
    color: white;
    border: 1px solid #333;
    border-radius: 14px;
    padding: 12px;
}
.media-row { display: flex; gap: 8px; margin-top: 8px; }
.media-row input {
    flex: 1;
    background: #111;
    color: white;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 10px;
}
.send { margin-top: 8px; }
.emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
    background: #151515;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid #333;
}
.emoji-btn { background: transparent; border: none; font-size: 20px; cursor: pointer; padding: 4px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(250px,1fr)); gap: 15px; }
.card {
    background: rgba(15,15,15,.92);
    border: 1px solid #333;
    border-radius: 18px;
    padding: 15px;
}
.card img { width: 100%; height: 170px; object-fit: cover; border-radius: 13px; margin-bottom: 10px; }
.card h3 { margin: 5px 0 8px; }
.card p { color: #bbb; }
.card a {
    display: inline-block;
    padding: 10px 14px;
    background: #1689d8;
    color: white;
    text-decoration: none;
    border-radius: 10px;
}
.profile { background: rgba(10,10,10,.9); border-radius: 20px; padding: 20px; }
.profile-avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; }
.admin {
    margin-top: 20px;
    background: rgba(15,15,15,.95);
    padding: 20px;
    border: 1px solid #444;
    border-radius: 20px;
}
.admin-section { margin-bottom: 25px; }
.admin input, .admin textarea {
    width: 100%;
    margin-bottom: 8px;
    background: #111;
    color: white;
    border: 1px solid #333;
    padding: 11px;
    border-radius: 10px;
}
.admin button { margin-bottom: 7px; }
.admin-item { background: #191919; padding: 12px; border-radius: 12px; margin-bottom: 8px; }
.danger { background: #b71c1c !important; }
.success { background: #087f23 !important; }
@media(max-width:700px) {
    .tabs { grid-template-columns: repeat(2,1fr); }
    .stats { display: grid; grid-template-columns: repeat(2,1fr); }
    .messages { max-height: 55vh; }
}
</style>
</head>
<body>
<header class="header">
<div class="header-inner">
<div class="brand">$AKIHABARA_cc.228$</div>
<div class="stats">
<div class="stat">👑 <span id="adminName">Главный админ</span></div>
<div class="stat">👥 <span id="totalUsers">0</span></div>
<div class="stat">🔗 <span id="totalRefs">0</span></div>
<div class="stat telegram"><a id="telegramButton" href="#" target="_blank">✈️ TELEGRAM ЧАТ</a></div>
</div>
</div>
</header>
<main class="container">
<div class="tabs">
<button class="tab active" onclick="switchTab('chat',this)">💬 ЧАТ</button>
<button class="tab" onclick="switchTab('exchangers',this)">💱 ОБМЕННИКИ</button>
<button class="tab" onclick="switchTab('shops',this)">🏪 МАГАЗИНЫ</button>
<button class="tab" onclick="switchTab('profile',this)">👤 ПРОФИЛЬ</button>
</div>

<section id="chat" class="page active">
<div class="chat">
<div class="messages" id="messages"></div>
<div class="composer">
<textarea id="messageText" placeholder="Напишите сообщение... Используйте @username для тега"></textarea>
<div class="emoji-picker">
<button class="emoji-btn" onclick="addEmoji('😀')">😀</button>
<button class="emoji-btn" onclick="addEmoji('😂')">😂</button>
<button class="emoji-btn" onclick="addEmoji('🔥')">🔥</button>
<button class="emoji-btn" onclick="addEmoji('👍')">👍</button>
<button class="emoji-btn" onclick="addEmoji('❤️')">❤️</button>
<button class="emoji-btn" onclick="addEmoji('🎉')">🎉</button>
<button class="emoji-btn" onclick="addEmoji('😎')">😎</button>
<button class="emoji-btn" onclick="addEmoji('💎')">💎</button>
<button class="emoji-btn" onclick="addEmoji('🚀')">🚀</button>
<button class="emoji-btn" onclick="addEmoji('💀')">💀</button>
</div>
<div class="media-row">
<input id="mediaUrl" placeholder="Прямая ссылка на фото, видео или GIF">
<select id="mediaType" style="background:#111;color:white;border:1px solid #333;border-radius:10px;padding:8px">
<option value="">Без медиа</option>
<option value="image">Фото / GIF</option>
<option value="video">Видео</option>
</select>
</div>
<button class="send" onclick="sendMessage()">📨 ОТПРАВИТЬ</button>
</div>
</div>
</section>

<section id="exchangers" class="page">
<h2>💱 Обменники</h2>
<div id="exchangersList" class="cards"></div>
</section>

<section id="shops" class="page">
<h2>🏪 Магазины</h2>
<div id="shopsList" class="cards"></div>
</section>

<section id="profile" class="page">
<div class="profile">
<h2>👤 Профиль</h2>
<img id="profileAvatar" class="profile-avatar" src="" alt="avatar">
<h3 id="profileUsername"></h3>
<p>Статус: <strong id="profileStatus"></strong></p>
<p>Рефералы: <strong id="profileInvites">0</strong></p>
<input id="avatarUrl" placeholder="URL вашей аватарки (картинки)" style="width:100%;padding:12px;background:#111;color:white;border:1px solid #333;border-radius:10px">
<button onclick="saveAvatar()">💾 СОХРАНИТЬ АВАТАР</button>
<h3>🔗 Реферальная ссылка</h3>
<input id="refLink" readonly style="width:100%;padding:12px;background:#111;color:white;border:1px solid #333;border-radius:10px">
<button onclick="copyRefLink()">📋 СКОПИРОВАТЬ</button>
<h3>👥 Приглашённые пользователи</h3>
<div id="myReferrals"></div>

<div id="myPersonalShopsContainer" style="margin-top:20px;">
<h3>🏪 Мои Магазины</h3>
<div id="myShopsList" class="cards"></div>
</div>

<div id="myPersonalExchangersContainer" style="margin-top:20px;">
<h3>💱 Мои Обменники</h3>
<div id="myExchangersList" class="cards"></div>
</div>
</div>

<div id="adminPanel" class="admin" style="display:none">
<h2>👑 АДМИН-ПАНЕЛЬ</h2>
<div class="admin-section">
<h3>✈️ Telegram чат</h3>
<input id="telegramAdminUrl" placeholder="https://t.me/...">
<button onclick="updateTelegramChat()">СОХРАНИТЬ TELEGRAM</button>
</div>
<div class="admin-section" id="adminsSection">
<h3>👑 Администраторы</h3>
<input id="newAdmin" placeholder="username нового администратора">
<button onclick="addAdmin()">➕ ДОБАВИТЬ АДМИНИСТРАТОРА</button>
<div id="adminsList"></div>
</div>
<div class="admin-section">
<h3>🏪 Управление магазинами</h3>
<input id="shopName" placeholder="Название">
<input id="shopPhoto" placeholder="URL фото / логотипа">
<input id="shopTelegram" placeholder="Telegram ссылка">
<input id="shopOwner" placeholder="Владелец (username, необязательно)" style="display:none">
<textarea id="shopDescription" placeholder="Описание"></textarea>
<label><input type="checkbox" id="shopPost" checked> Разрешить посты</label><br>
<label><input type="checkbox" id="shopAds" checked> Разрешить рекламу</label><br><br>
<button onclick="addShop()">➕ ДОБАВИТЬ МАГАЗИН</button>
<div id="adminShopsList" style="margin-top:15px;"></div>
</div>
<div class="admin-section">
<h3>💱 Управление обменниками</h3>
<input id="exchangerName" placeholder="Название">
<input id="exchangerPhoto" placeholder="URL фото / логотипа">
<input id="exchangerTelegram" placeholder="Telegram ссылка">
<input id="exchangerOwner" placeholder="Владелец (username, необязательно)" style="display:none">
<textarea id="exchangerDescription" placeholder="Описание"></textarea>
<label><input type="checkbox" id="exchangerPost" checked> Разрешить посты</label><br>
<label><input type="checkbox" id="exchangerAds" checked> Разрешить рекламу</label><br><br>
<button onclick="addExchanger()">➕ ДОБАВИТЬ ОБМЕННИК</button>
<div id="adminExchangersList" style="margin-top:15px;"></div>
</div>
<div class="admin-section">
<h3>👥 Пользователи</h3>
<div id="usersList"></div>
</div>
<div class="admin-section">
<h3>⚠️ Жалобы</h3>
<div id="complaintsList"></div>
</div>
<button class="danger" onclick="logout()">🚪 ВЫЙТИ</button>
</div>
</section>
</main>

<script>
const socket = io();
let currentUser = null;
let allUsers = [];
let allShops = [];
let allExchangers = [];

async function init() {
    await loadUser();
    await loadStats();
    await loadTelegram();
    await loadExchangers();
    await loadShops();

    if (currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
        document.getElementById("adminPanel").style.display = "block";
        if (currentUser.status === "main_admin") {
            const shOwn = document.getElementById("shopOwner");
            const exOwn = document.getElementById("exchangerOwner");
            if(shOwn) shOwn.style.display = "block";
            if(exOwn) exOwn.style.display = "block";
        }
        await loadAdmins();
        await loadUsers();
        await loadComplaints();
    }
}
init();

async function loadUser() {
    const r = await fetch("/api/user");
    const data = await r.json();
    if (!data.loggedIn) {
        location.href = "/";
        return;
    }
    currentUser = data.user;
    document.getElementById("profileUsername").textContent = "@" + currentUser.username;
    document.getElementById("profileStatus").textContent = currentUser.status;
    document.getElementById("profileInvites").textContent = currentUser.invites || 0;
    const avatar = currentUser.avatarUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(currentUser.username);
    document.getElementById("profileAvatar").src = avatar;
    document.getElementById("avatarUrl").value = currentUser.avatarUrl || "";
    const link = location.origin + "/?ref=" + encodeURIComponent(currentUser.referralCode || currentUser.username);
    document.getElementById("refLink").value = link;
    if (currentUser.status !== "main_admin") {
        document.getElementById("adminsSection").style.display = "none";
    }
    loadMyReferrals();
    renderMyPersonalRooms();
}

async function loadStats() {
    const r = await fetch("/api/stats");
    const data = await r.json();
    document.getElementById("totalUsers").textContent = data.users || 0;
    document.getElementById("totalRefs").textContent = data.referrals || 0;
}

async function loadTelegram() {
    const r = await fetch("/api/telegram-chat");
    const data = await r.json();
    const button = document.getElementById("telegramButton");
    button.href = data.url;
    document.getElementById("telegramAdminUrl").value = data.url;
}

async function updateTelegramChat() {
    const url = document.getElementById("telegramAdminUrl").value.trim();
    const r = await fetch("/api/admin/telegram-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({url})
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    alert("Telegram чат сохранён");
}

function switchTab(id, button) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    if (button) { button.classList.add("active"); }
}

function addEmoji(emoji) {
    const textarea = document.getElementById("messageText");
    textarea.value += emoji;
    textarea.focus();
}

function sendMessage() {
    const textarea = document.getElementById("messageText");
    const mediaUrl = document.getElementById("mediaUrl").value.trim();
    const mediaType = document.getElementById("mediaType").value;
    const text = textarea.value.trim();
    if (!text && !mediaUrl) return;

    socket.emit("chat_message", { text, mediaUrl, mediaType });
    textarea.value = "";
    document.getElementById("mediaUrl").value = "";
}

function appendMessage(message) {
    const container = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = "message";

    const avatar = message.avatarUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(message.username);
    let media = "";
    if (message.mediaurl && message.mediatype === "image") {
        media = '<img class="media" src="' + escapeAttr(message.mediaurl) + '">';
    } else if (message.mediaUrl && message.mediaType === "image") {
        media = '<img class="media" src="' + escapeAttr(message.mediaUrl) + '">';
    }
    if (message.mediaurl && message.mediatype === "video") {
        media = '<video controls src="' + escapeAttr(message.mediaurl) + '"></video>';
    } else if (message.mediaUrl && message.mediaType === "video") {
        media = '<video controls src="' + escapeAttr(message.mediaUrl) + '"></video>';
    }

    const text = highlightMentions(escapeHtml(message.text || ""));

    let adminPinBtn = "";
    if (currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
        adminPinBtn = '<button class="small-btn" onclick="pinMessage(' + message.id + ')">📌</button>';
    }

    div.innerHTML = 
        '<img class="avatar" src="' + escapeAttr(avatar) + '">' +
        '<div class="message-body">' +
            '<div class="username">@' + escapeHtml(message.username) + '</div>' +
            '<div class="text">' + text + media + '</div>' +
            '<div class="message-actions">' +
                '<button class="small-btn" onclick="likeMessage(' + message.id + ')">❤️ ' + (message.likes || 0) + '</button>' +
                '<button class="small-btn" onclick="tagUser(\\'' + escapeJs(message.username) + '\\')">@ Тегнуть</button>' +
                adminPinBtn +
            '</div>' +
        '</div>';

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function escapeAttr(value) { return escapeHtml(value); }

function escapeJs(value) {
    return String(value || "")
        .replace(/\\\\/g,"\\\\\\\\")
        .replace(/'/g,"\\\\'")
        .replace(/"/g,'\\\\"');
}

function highlightMentions(text) {
    return text.replace(/@([a-zA-Z0-9_.-]+)/g, '<span style="color:#00a8ff;font-weight:bold">@$1</span>');
}

function tagUser(username) {
    const textarea = document.getElementById("messageText");
    textarea.value += " @" + username + " ";
    textarea.focus();
}

function likeMessage(id) { socket.emit("toggle_like", { messageId: id }); }
function pinMessage(id) { socket.emit("pin_message", { messageId: id }); }

socket.on("history", messages => {
    document.getElementById("messages").innerHTML = "";
    messages.forEach(appendMessage);
});

socket.on("new_message", appendMessage);
socket.on("message_liked", () => { loadChat(); });
socket.on("message_pinned", () => { loadChat(); });

socket.on("system_message", data => {
    const div = document.createElement("div");
    div.style.textAlign = "center";
    div.style.color = "#888";
    div.style.margin = "10px";
    div.textContent = data.text;
    document.getElementById("messages").appendChild(div);
});

async function loadChat() { location.reload(); }

async function loadExchangers() {
    const r = await fetch("/api/exchangers");
    const data = await r.json();
    allExchangers = data.exchangers || [];
    const box = document.getElementById("exchangersList");
    box.innerHTML = "";
    
    let adminBox = document.getElementById("adminExchangersList");
    if (adminBox) adminBox.innerHTML = "";

    allExchangers.forEach(item => {
        let photoHtml = item.photourl ? '<img src="' + escapeAttr(item.photourl) + '">' : (item.photoUrl ? '<img src="' + escapeAttr(item.photoUrl) + '">' : "");
        let tgHtml = item.telegramurl ? '<a href="' + escapeAttr(item.telegramurl) + '" target="_blank">✈️ Telegram</a>' : (item.telegramUrl ? '<a href="' + escapeAttr(item.telegramUrl) + '" target="_blank">✈️ Telegram</a>' : "");

        box.innerHTML += 
            '<div class="card">' +
                photoHtml +
                '<h3>' + escapeHtml(item.name) + '</h3>' +
                '<p>' + escapeHtml(item.description) + '</p>' +
                '<p style="font-size:12px; color:#aaa;">Владелец: @' + escapeHtml(item.owner || 'система') + '<br>Права: Посты: ' + (item.can_post ? '✅' : '❌') + ' | Реклама: ' + (item.can_ads ? '✅' : '❌') + '</p>' +
                tgHtml +
            '</div>';

        if (adminBox && currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
            adminBox.innerHTML += 
                '<div class="admin-item">' +
                    '<strong>' + escapeHtml(item.name) + '</strong> (Владелец: @' + escapeHtml(item.owner || 'система') + ')<br>' +
                    'Посты: ' + (item.can_post ? '✅' : '❌') + ' | Реклама: ' + (item.can_ads ? '✅' : '❌') + '<br><br>' +
                    '<button onclick="editExchanger(' + item.id + ')">✏️ Редактировать / Права</button> ' +
                    '<button class="danger" onclick="deleteExchanger(' + item.id + ')">🗑 Удалить</button>' +
                '</div>';
        }
    });

    renderMyPersonalRooms();
}

async function loadShops() {
    const r = await fetch("/api/shops");
    const data = await r.json();
    allShops = data.shops || [];
    const box = document.getElementById("shopsList");
    box.innerHTML = "";
    
    let adminBox = document.getElementById("adminShopsList");
    if (adminBox) adminBox.innerHTML = "";

    allShops.forEach(item => {
        let photoHtml = item.photourl ? '<img src="' + escapeAttr(item.photourl) + '">' : (item.photoUrl ? '<img src="' + escapeAttr(item.photoUrl) + '">' : "");
        let tgHtml = item.telegramurl ? '<a href="' + escapeAttr(item.telegramurl) + '" target="_blank">✈️ Telegram</a>' : (item.telegramUrl ? '<a href="' + escapeAttr(item.telegramUrl) + '" target="_blank">✈️ Telegram</a>' : "");

        box.innerHTML += 
            '<div class="card">' +
                photoHtml +
                '<h3>' + escapeHtml(item.name) + '</h3>' +
                '<p>' + escapeHtml(item.description) + '</p>' +
                '<p style="font-size:12px; color:#aaa;">Владелец: @' + escapeHtml(item.owner || 'система') + '<br>Права: Посты: ' + (item.can_post ? '✅' : '❌') + ' | Реклама: ' + (item.can_ads ? '✅' : '❌') + '</p>' +
                tgHtml +
            '</div>';

        if (adminBox && currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
            adminBox.innerHTML += 
                '<div class="admin-item">' +
                    '<strong>' + escapeHtml(item.name) + '</strong> (Владелец: @' + escapeHtml(item.owner || 'система') + ')<br>' +
                    'Посты: ' + (item.can_post ? '✅' : '❌') + ' | Реклама: ' + (item.can_ads ? '✅' : '❌') + '<br><br>' +
                    '<button onclick="editShop(' + item.id + ')">✏️ Редактировать / Права</button> ' +
                    '<button class="danger" onclick="deleteShop(' + item.id + ')">🗑 Удалить</button>' +
                '</div>';
        }
    });

    renderMyPersonalRooms();
}

function renderMyPersonalRooms() {
    if (!currentUser) return;
    const myShopsBox = document.getElementById("myShopsList");
    const myExchBox = document.getElementById("myExchangersList");

    if (myShopsBox) {
        myShopsBox.innerHTML = "";
        const userShops = allShops.filter(s => s.owner === currentUser.username);
        if (userShops.length === 0) {
            myShopsBox.innerHTML = '<p style="color:#888;">У вас нет привязанных магазинов</p>';
        } else {
            userShops.forEach(item => {
                let photoHtml = item.photourl ? '<img src="' + escapeAttr(item.photourl) + '">' : (item.photoUrl ? '<img src="' + escapeAttr(item.photoUrl) + '">' : "");
                let tgHtml = item.telegramurl ? '<a href="' + escapeAttr(item.telegramurl) + '" target="_blank">✈️ Telegram</a>' : (item.telegramUrl ? '<a href="' + escapeAttr(item.telegramUrl) + '" target="_blank">✈️ Telegram</a>' : "");
                myShopsBox.innerHTML += 
                    '<div class="card">' +
                        photoHtml +
                        '<h3>' + escapeHtml(item.name) + '</h3>' +
                        '<p>' + escapeHtml(item.description) + '</p>' +
                        tgHtml +
                    '</div>';
            });
        }
    }

    if (myExchBox) {
        myExchBox.innerHTML = "";
        const userExch = allExchangers.filter(e => e.owner === currentUser.username);
        if (userExch.length === 0) {
            myExchBox.innerHTML = '<p style="color:#888;">У вас нет привязанных обменников</p>';
        } else {
            userExch.forEach(item => {
                let photoHtml = item.photourl ? '<img src="' + escapeAttr(item.photourl) + '">' : (item.photoUrl ? '<img src="' + escapeAttr(item.photoUrl) + '">' : "");
                let tgHtml = item.telegramurl ? '<a href="' + escapeAttr(item.telegramurl) + '" target="_blank">✈️ Telegram</a>' : (item.telegramUrl ? '<a href="' + escapeAttr(item.telegramUrl) + '" target="_blank">✈️ Telegram</a>' : "");
                myExchBox.innerHTML += 
                    '<div class="card">' +
                        photoHtml +
                        '<h3>' + escapeHtml(item.name) + '</h3>' +
                        '<p>' + escapeHtml(item.description) + '</p>' +
                        tgHtml +
                    '</div>';
            });
        }
    }
}

async function loadAdmins() {
    const r = await fetch("/api/admins");
    const data = await r.json();
    const box = document.getElementById("adminsList");
    box.innerHTML = "";

    data.admins.forEach(admin => {
        let actions = "";
        let avatarEdit = "";
        if (currentUser && currentUser.status === "main_admin") {
            avatarEdit = '<br><button class="small-btn" onclick="setAdminAvatar(\\'' + escapeJs(admin.username) + '\\')">🖼 Сменить аватарку</button>';
        }
        if (admin.username !== "koliaegorov99po-afk" && admin.status !== "main_admin") {
            actions = 
                '<br><br>' +
                '<button onclick="editAdmin(\\'' + escapeJs(admin.username) + '\\')">✏️ Изменить</button> ' +
                '<button class="danger" onclick="removeAdmin(\\'' + escapeJs(admin.username) + '\\')">🗑 Удалить права</button>';
        }

        box.innerHTML += 
            '<div class="admin-item">' +
                '<strong>@' + escapeHtml(admin.username) + '</strong><br>' +
                'Статус: ' + escapeHtml(admin.status) +
                avatarEdit +
                actions +
            '</div>';
    });
}

async function setAdminAvatar(username) {
    const avatarUrl = prompt("Введите URL аватарки для @" + username + ":");
    if (avatarUrl === null) return;
    const r = await fetch("/api/admin/set-user-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, avatarUrl })
    });
    const data = await r.json();
    if (!data.ok) {
        alert("Ошибка");
        return;
    }
    alert("Аватар успешно изменен!");
}

async function addAdmin() {
    const username = document.getElementById("newAdmin").value.trim();
    if (!username) return;

    const r = await fetch("/api/admins/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    document.getElementById("newAdmin").value = "";
    await loadAdmins();
    await loadUsers();
    alert("Администратор добавлен");
}

async function removeAdmin(username) {
    if (!confirm("Удалить права администратора у @" + username + "?")) return;
    const r = await fetch("/api/admins/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadAdmins();
    loadUsers();
}

async function editAdmin(username) {
    const newUsername = prompt("Новое имя администратора:", username);
    if (!newUsername) return;

    const r = await fetch("/api/admins/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldUsername: username, newUsername })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadAdmins();
    loadUsers();
}

async function addShop() {
    const body = {
        name: document.getElementById("shopName").value,
        photoUrl: document.getElementById("shopPhoto").value,
        telegramUrl: document.getElementById("shopTelegram").value,
        owner: document.getElementById("shopOwner").value,
        description: document.getElementById("shopDescription").value,
        can_post: document.getElementById("shopPost").checked ? 1 : 0,
        can_ads: document.getElementById("shopAds").checked ? 1 : 0
    };
    const r = await fetch("/api/shops/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    alert("Магазин добавлен");
    document.getElementById("shopName").value = "";
    document.getElementById("shopPhoto").value = "";
    document.getElementById("shopTelegram").value = "";
    document.getElementById("shopDescription").value = "";
    if(document.getElementById("shopOwner")) document.getElementById("shopOwner").value = "";
    loadShops();
}

async function editShop(id) {
    const name = prompt("Название магазина:");
    if (!name) return;
    const photoUrl = prompt("URL фото:");
    const telegramUrl = prompt("Telegram:");
    const owner = prompt("Владелец (username):");
    const description = prompt("Описание:");
    const canPostStr = prompt("Разрешить посты? (1 - да, 0 - нет)", "1");
    const canAdsStr = prompt("Разрешить рекламу и закрепы? (1 - да, 0 - нет)", "1");

    const r = await fetch("/api/shops/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id, name, photoUrl, telegramUrl, owner, description,
            can_post: canPostStr === "1" ? 1 : 0,
            can_ads: canAdsStr === "1" ? 1 : 0
        })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadShops();
}

async function deleteShop(id) {
    if (!confirm("Удалить магазин?")) return;
    const r = await fetch("/api/shops/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({id})
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadShops();
}

async function addExchanger() {
    const body = {
        name: document.getElementById("exchangerName").value,
        photoUrl: document.getElementById("exchangerPhoto").value,
        telegramUrl: document.getElementById("exchangerTelegram").value,
        owner: document.getElementById("exchangerOwner").value,
        description: document.getElementById("exchangerDescription").value,
        can_post: document.getElementById("exchangerPost").checked ? 1 : 0,
        can_ads: document.getElementById("exchangerAds").checked ? 1 : 0
    };
    const r = await fetch("/api/exchangers/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    alert("Обменник добавлен");
    document.getElementById("exchangerName").value = "";
    document.getElementById("exchangerPhoto").value = "";
    document.getElementById("exchangerTelegram").value = "";
    document.getElementById("exchangerDescription").value = "";
    if(document.getElementById("exchangerOwner")) document.getElementById("exchangerOwner").value = "";
    loadExchangers();
}

async function editExchanger(id) {
    const name = prompt("Название обменника:");
    if (!name) return;
    const photoUrl = prompt("URL фото:");
    const telegramUrl = prompt("Telegram:");
    const owner = prompt("Владелец (username):");
    const description = prompt("Описание:");
    const canPostStr = prompt("Разрешить посты? (1 - да, 0 - нет)", "1");
    const canAdsStr = prompt("Разрешить рекламу и закрепы? (1 - да, 0 - нет)", "1");

    const r = await fetch("/api/exchangers/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id, name, photoUrl, telegramUrl, owner, description,
            can_post: canPostStr === "1" ? 1 : 0,
            can_ads: canAdsStr === "1" ? 1 : 0
        })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadExchangers();
}

async function deleteExchanger(id) {
    if (!confirm("Удалить обменник?")) return;
    const r = await fetch("/api/exchangers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({id})
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadExchangers();
}

async function loadUsers() {
    const r = await fetch("/api/users");
    const data = await r.json();
    allUsers = data.users || [];
    const box = document.getElementById("usersList");
    box.innerHTML = "";

    allUsers.forEach(user => {
        let actions = "";
        if (user.username !== "koliaegorov99po-afk") {
            let nextStatus = user.status === "admin" ? "user" : "admin";
            let statusBtnText = user.status === "admin" ? "👤 Сделать пользователем" : "👑 Сделать админом";
            actions = 
                '<br><br>' +
                '<button onclick="changeUserStatus(\\'' + escapeJs(user.username) + '\\', \\'' + nextStatus + '\\')">' + statusBtnText + '</button> ' +
                '<button class="danger" onclick="deleteUser(\\'' + escapeJs(user.username) + '\\')">🗑 Удалить</button>';
        }

        box.innerHTML += 
            '<div class="admin-item">' +
                '<strong>@' + escapeHtml(user.username) + '</strong><br>' +
                'Статус: ' + escapeHtml(user.status) + '<br>' +
                'Рефералов: ' + (user.invites || 0) +
                actions +
            '</div>';
    });
}

async function changeUserStatus(username, status) {
    const r = await fetch("/api/admin/user-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, status })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadUsers();
    loadAdmins();
}

async function deleteUser(username) {
    if (!confirm("Удалить пользователя @" + username + "?")) return;
    const r = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    });
    const data = await r.json();
    if (!data.ok) {
        alert(data.error || "Ошибка");
        return;
    }
    loadUsers();
    loadStats();
}

async function loadComplaints() {
    const r = await fetch("/api/admin/complaints");
    if (!r.ok) return;
    const data = await r.json();
    const box = document.getElementById("complaintsList");
    box.innerHTML = "";

    (data.complaints || []).forEach(c => {
        box.innerHTML += 
            '<div class="admin-item">' +
                '<strong>' + escapeHtml(c.target_name) + '</strong><br>' +
                'От: @' + escapeHtml(c.complainant) + '<br>' +
                'Причина: ' + escapeHtml(c.reason) +
            '</div>';
    });
}

async function saveAvatar() {
    const avatarUrl = document.getElementById("avatarUrl").value.trim();
    const r = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl })
    });
    const data = await r.json();
    if (!data.ok) {
        alert("Ошибка");
        return;
    }
    document.getElementById("profileAvatar").src = avatarUrl;
    alert("Аватар сохранён");
}

async function loadMyReferrals() {
    const r = await fetch("/api/referrals");
    if (!r.ok) return;
    const data = await r.json();
    const box = document.getElementById("myReferrals");
    box.innerHTML = "";

    (data.referrals || []).forEach(user => {
        const div = document.createElement("div");
        div.className = "admin-item";
        div.textContent = "@" + user.username + " — " + user.status;
        box.appendChild(div);
    });
}

function copyRefLink() {
    const input = document.getElementById("refLink");
    navigator.clipboard.writeText(input.value).then(() => alert("Ссылка скопирована"));
}

async function logout() {
    await fetch("/logout", { method: "POST" });
    location.href = "/";
}

socket.on("admins_updated", () => {
    if (currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
        loadAdmins();
        loadUsers();
    }
});

socket.on("users_updated", () => {
    loadStats();
    if (currentUser && (currentUser.status === "admin" || currentUser.status === "main_admin")) {
        loadUsers();
        loadAdmins();
    }
});

socket.on("shops_updated", () => { loadShops(); });
socket.on("exchangers_updated", () => { loadExchangers(); });
socket.on("telegram_chat_updated", url => {
    document.getElementById("telegramButton").href = url;
    document.getElementById("telegramAdminUrl").value = url;
});

socket.on("connect", () => { console.log("AKIHABARA Socket.IO connected"); });
</script>
</body>
</html>
    `);
});

/* =========================================================
   SOCKET.IO SERVER
========================================================= */

io.on("connection", socket => {
    const username = socket.request.session && socket.request.session.username;

    if (!username) {
        socket.disconnect(true);
        return;
    }

    getUser(username, async (err, user) => {
        if (err || !user) {
            socket.disconnect(true);
            return;
        }

        try {
            const historyResult = await pool.query(`
                SELECT *
                FROM messages
                ORDER BY id DESC
                LIMIT 100
            `);
            const messages = historyResult.rows.reverse();
            socket.emit("history", messages);
        } catch (error) {
            console.error("Ошибка загрузки истории сообщений:", error);
        }

        socket.on("chat_message", async data => {
            const text = String(data.text || "").trim().slice(0, 5000);
            const mediaUrl = String(data.mediaUrl || "").trim().slice(0, 2000);
            let mediaType = String(data.mediaType || "");

            if (!["","image","video"].includes(mediaType)) {
                mediaType = "";
            }

            if (!text && !mediaUrl) return;

            try {
                const insertRes = await pool.query(
                    `
                    INSERT INTO messages
                    (username, avatarUrl, text, mediaUrl, mediaType, isAd)
                    VALUES ($1, $2, $3, $4, $5, 0)
                    RETURNING id
                    `,
                    [
                        user.username,
                        user.avatarUrl || "",
                        text,
                        mediaUrl,
                        mediaType
                    ]
                );

                const messageId = insertRes.rows[0].id;
                const messageRes = await pool.query("SELECT * FROM messages WHERE id = $1", [messageId]);
                io.emit("new_message", messageRes.rows[0]);
            } catch (err) {
                console.error("Ошибка сохранения сообщения:", err);
            }
        });

        socket.on("toggle_like", async data => {
            const messageId = Number(data.messageId);
            if (!messageId) return;

            try {
                const existingResult = await pool.query(
                    `
                    SELECT id
                    FROM message_likes
                    WHERE messageId = $1
                    AND username = $2
                    `,
                    [messageId, username]
                );

                if (existingResult.rows.length > 0) {
                    await pool.query(
                        `
                        DELETE FROM message_likes
                        WHERE messageId = $1
                        AND username = $2
                        `,
                        [messageId, username]
                    );
                } else {
                    await pool.query(
                        `
                        INSERT INTO message_likes
                        (messageId, username)
                        VALUES ($1, $2)
                        ON CONFLICT (messageId, username) DO NOTHING
                        `,
                        [messageId, username]
                    );
                }
                updateLikes(messageId);
            } catch (err) {
                console.error("Ошибка переключения лайка:", err);
            }
        });

        socket.on("pin_message", async data => {
            if (user.status !== "admin" && user.status !== "main_admin") {
                return;
            }

            const messageId = Number(data.messageId);
            if (!messageId) return;

            try {
                await pool.query("UPDATE messages SET isPinned = 0");
                await pool.query("UPDATE messages SET isPinned = 1 WHERE id = $1", [messageId]);
                io.emit("message_pinned", { messageId });
            } catch (err) {
                console.error("Ошибка закрепа сообщения:", err);
            }
        });

        socket.on("disconnect", () => {
            console.log("User disconnected:", username);
        });
    });
});

/* =========================================================
   UPDATE LIKES
========================================================= */

async function updateLikes(messageId) {
    try {
        const countRes = await pool.query(
            `
            SELECT COUNT(*) AS likes
            FROM message_likes
            WHERE messageId = $1
            `,
            [messageId]
        );

        const likesCount = countRes.rows[0] ? Number(countRes.rows[0].likes) : 0;

        await pool.query(
            `
            UPDATE messages
            SET likes = $1
            WHERE id = $2
            `,
            [likesCount, messageId]
        );

        io.emit("message_liked", {
            messageId,
            likes: likesCount
        });
    } catch (err) {
        console.error("Ошибка обновления лайков:", err);
    }
}

/* =========================================================
   START
========================================================= */

server.listen(PORT, HOST, () => {
    console.log("");
    console.log("====================================");
    console.log("$AKIHABARA_cc.228$");
    console.log("SERVER STARTED (POSTGRESQL SUPABASE)");
    console.log("PORT:", PORT);
    console.log("HOST:", HOST);
    console.log("MAIN ADMIN:", MAIN_ADMIN);
    console.log("====================================");
    console.log("");
});
