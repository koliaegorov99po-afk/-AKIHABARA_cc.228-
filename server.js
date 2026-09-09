Const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dbPath = path.join(__dirname, 'akihabara.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error:', err.message);
});

const MAIN_IMAGE = '/banner.png';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'akihabara_secret_key_228',
    resave: false,
    saveUninitialized: true,
});

app.use(sessionMiddleware);

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, () => {
        next();
    });
});

function isAdmin(req, res, next) {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.get("SELECT status, username FROM users WHERE username = ?", [req.session.username], (err, user) => {
        if (err || !user || user.status !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Admins only' });
        }
        req.user = user;
        next();
    });
}

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, status TEXT, avatarUrl TEXT, referralCode TEXT, invitedBy TEXT, invites INTEGER DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, avatarUrl TEXT, text TEXT, mediaUrl TEXT, mediaType TEXT, isAd INTEGER DEFAULT 0, isPinned INTEGER DEFAULT 0, likes TEXT DEFAULT '[]', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS exchangers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, photoUrl TEXT, telegramUrl TEXT, description TEXT, owner TEXT, can_post INTEGER DEFAULT 0, can_ads INTEGER DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, photoUrl TEXT, telegramUrl TEXT, description TEXT, owner TEXT, can_post INTEGER DEFAULT 0, can_ads INTEGER DEFAULT 0)");
    db.run("CREATE TABLE IF NOT EXISTS complaints (id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT, target_name TEXT, complainant TEXT, reason TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT UNIQUE, value TEXT)");
    db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES ('koliaegorov99po-afk', 'admin', ?)", [MAIN_IMAGE]);
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('tg_chat_link', 'https://t.me/+K9gPO5PUyttlN2Zi')");
});

app.post('/login', (req, res) => {
    const username = req.body.username ? req.body.username.trim().replace('@', '') : '';
    const ref = req.body.ref ? req.body.ref.trim().replace('@', '') : null;
    const captchaInput = parseInt(req.body.captcha, 10);
    const captchaExpected = parseInt(req.body.captcha_expected, 10);

    if (!username || isNaN(captchaInput) || captchaInput !== captchaExpected) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$AKIHABARA_cc.228$ - Ошибка</title>
            <style>
            body { margin: 0; padding: 20px; background: #000 url('${MAIN_IMAGE}') no-repeat center center fixed; background-size: cover; min-height: 100vh; width: 100vw; display: flex; justify-content: center; align-items: center; font-family: sans-serif; }
            body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 0; }
            .login-box { position: relative; z-index: 1; background: rgba(20,20,20,0.95); padding: 30px; border-radius: 12px; border: 2px solid #ff3333; box-shadow: 0 0 25px #ff3333; text-align: center; width: 90%; max-width: 320px; color: #fff; }
            a { color: #00eaff; text-decoration: none; display: inline-block; margin-top: 15px; font-weight: bold; }
            </style>
            </head>
            <body>
            <div class="login-box">
            <h3 style="color:#ff3333; margin-bottom:15px;">Ошибка капчи</h3>
            <p style="font-size: 0.9em; margin-bottom: 15px;">Неверно решен пример с капчей. Попробуйте еще раз.</p>
            <a href="/?ref=${ref || ''}">Назад к входу</a>
            </div>
            </body>
            </html>
        `);
    }

    const role = (username.toLowerCase() === 'koliaegorov99po-afk') ? 'admin' : 'user';

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, existingUser) => {
        if (err) {
            console.error("DB Error on login check:", err.message);
            return res.redirect('/');
        }
        if (!existingUser) {
            if (ref && ref !== username) {
                db.get("SELECT username FROM users WHERE username = ?", [ref], (errRef, refUser) => {
                    let actualInvitedBy = null;
                    if (!errRef && refUser) {
                        actualInvitedBy = refUser.username;
                        db.run("UPDATE users SET invites = invites + 1 WHERE username = ?", [refUser.username], (errUpd) => {
                            if (errUpd) console.error("Error updating invite count:", errUpd.message);
                        });
                    }
                    saveUser(username, role, actualInvitedBy, req, res);
                });
            } else {
                saveUser(username, role, null, req, res);
            }
        } else {
            req.session.username = username;
            res.redirect('/');
        }
    });
});

function saveUser(username, role, invitedBy, req, res) {
    db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl, invitedBy) VALUES (?, ?, ?, ?)",
        [username, role, MAIN_IMAGE, invitedBy], (err) => {
            if (err) console.error("Error saving user:", err.message);
            req.session.username = username;
            io.emit('system_message', { text: `🎉 Участник @${username} присоединился к платформе!` });
            res.redirect('/');
        });
}

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.get("SELECT * FROM users WHERE username = ?", [req.session.username], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

app.get('/api/stats', (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) console.error("Stats count error:", err.message);
        db.get("SELECT value FROM settings WHERE key = 'tg_chat_link'", (err2, settingRow) => {
            if (err2) console.error("Stats setting error:", err2.message);
            res.json({ totalUsers: row ? row.count : 0, tgChatLink: settingRow ? settingRow.value : 'https://t.me/+K9gPO5PUyttlN2Zi' });
        });
    });
});

app.post('/api/admin/update-chat-link', isAdmin, (req, res) => {
    if (req.user.username.toLowerCase() !== 'koliaegorov99po-afk') {
        return res.status(403).json({ error: 'Only main admin can update chat link' });
    }
    const { tgChatLink } = req.body;
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('tg_chat_link', ?)", [tgChatLink], (err) => {
        if (err) {
            console.error("Error updating chat link:", err.message);
            return res.status(500).json({ error: err.message });
        }
        io.emit('chat_link_updated', { tgChatLink });
        res.json({ success: true });
    });
});

app.get('/api/exchangers', (req, res) => {
    db.all("SELECT * FROM exchangers", (err, exchangers) => {
        if (err) {
            console.error("Error fetching exchangers:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(exchangers);
    });
});

app.get('/api/shops', (req, res) => {
    db.all("SELECT * FROM shops", (err, shops) => {
        if (err) {
            console.error("Error fetching shops:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(shops);
    });
});

app.get('/api/admin/data', isAdmin, (req, res) => {
    db.all("SELECT username, status, invitedBy, invites FROM users", (err, users) => {
        if (err) console.error("Admin data users error:", err.message);
        db.all("SELECT * FROM complaints ORDER BY timestamp DESC", (errComp, complaints) => {
            if (errComp) console.error("Admin data complaints error:", errComp.message);
            db.all("SELECT * FROM exchangers", (errEx, exchangers) => {
                if (errEx) console.error("Admin data exchangers error:", errEx.message);
                db.all("SELECT * FROM shops", (errSh, shops) => {
                    if (errSh) console.error("Admin data shops error:", errSh.message);
                    db.get("SELECT value FROM settings WHERE key = 'tg_chat_link'", (errSet, settingRow) => {
                        if (errSet) console.error("Admin data settings error:", errSet.message);
                        res.json({ 
                            users: users || [], 
                            complaints: complaints || [], 
                            exchangers: exchangers || [], 
                            shops: shops || [], 
                            currentAdmin: req.user.username, 
                            tgChatLink: settingRow ? settingRow.value : '' 
                        });
                    });
                });
            });
        });
    });
});

app.post('/api/admin/set-status', isAdmin, (req, res) => {
    const { targetUser, newStatus } = req.body;
    if (req.user.username.toLowerCase() !== 'koliaegorov99po-afk' && targetUser.toLowerCase() === 'koliaegorov99po-afk') {
        return res.status(403).json({ error: 'Cannot modify main admin status' });
    }
    db.run("UPDATE users SET status = ? WHERE username = ?", [newStatus, targetUser], (err) => {
        if (err) {
            console.error("Error setting status:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.post('/api/admin/delete-user', isAdmin, (req, res) => {
    const { targetUser } = req.body;
    if (targetUser.toLowerCase() === 'koliaegorov99po-afk') return res.status(400).json({ error: 'Cannot delete main admin' });

    db.run("DELETE FROM users WHERE username = ?", [targetUser], (err) => {
        if (err) {
            console.error("Error deleting user:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.post('/api/complaint', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    const { target_type, target_name, reason } = req.body;
    db.run("INSERT INTO complaints (target_type, target_name, complainant, reason) VALUES (?, ?, ?, ?)",
        [target_type, target_name, req.session.username, reason], (err) => {
            if (err) {
                console.error("Error adding complaint:", err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
        });
});

app.post('/api/admin/add-exchanger', isAdmin, (req, res) => {
    const { name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
    const cleanOwner = owner ? owner.replace('@', '').trim() : '';
    
    db.run("INSERT INTO exchangers (name, photoUrl, telegramUrl, description, owner, can_post, can_ads) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [name, photoUrl || MAIN_IMAGE, telegramUrl, description, cleanOwner, can_post ? 1 : 0, can_ads ? 1 : 0], (err) => {
            if (err) {
                console.error("Error adding exchanger:", err.message);
                return res.status(500).json({ error: err.message });
            }
            
            if (cleanOwner) {
                db.get("SELECT * FROM users WHERE username = ?", [cleanOwner], (errU, uRow) => {
                    if (!uRow) {
                        db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES (?, 'user', ?)", [cleanOwner, MAIN_IMAGE]);
                    }
                });
            }
            io.emit('exchangers_updated');
            res.json({ success: true });
        });
});

app.post('/api/admin/edit-exchanger', isAdmin, (req, res) => {
    const { id, name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
    const cleanOwner = owner ? owner.replace('@', '').trim() : '';

    db.run("UPDATE exchangers SET name = ?, photoUrl = ?, telegramUrl = ?, description = ?, owner = ?, can_post = ?, can_ads = ? WHERE id = ?",
        [name, photoUrl || MAIN_IMAGE, telegramUrl, description, cleanOwner, can_post ? 1 : 0, can_ads ? 1 : 0, id], (err) => {
            if (err) {
                console.error("Error editing exchanger:", err.message);
                return res.status(500).json({ error: err.message });
            }
            
            if (cleanOwner) {
                db.get("SELECT * FROM users WHERE username = ?", [cleanOwner], (errU, uRow) => {
                    if (!uRow) {
                        db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES (?, 'user', ?)", [cleanOwner, MAIN_IMAGE]);
                    }
                });
            }
            io.emit('exchangers_updated');
            res.json({ success: true });
        });
});

app.post('/api/admin/delete-exchanger', isAdmin, (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM exchangers WHERE id = ?", [id], (err) => {
        if (err) {
            console.error("Error deleting exchanger:", err.message);
            return res.status(500).json({ error: err.message });
        }
        io.emit('exchangers_updated');
        res.json({ success: true });
    });
});

app.post('/api/admin/add-shop', isAdmin, (req, res) => {
    const { name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
    const cleanOwner = owner ? owner.replace('@', '').trim() : '';

    db.run("INSERT INTO shops (name, photoUrl, telegramUrl, description, owner, can_post, can_ads) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [name, photoUrl || MAIN_IMAGE, telegramUrl, description, cleanOwner, can_post ? 1 : 0, can_ads ? 1 : 0], (err) => {
            if (err) {
                console.error("Error adding shop:", err.message);
                return res.status(500).json({ error: err.message });
            }

            if (cleanOwner) {
                db.get("SELECT * FROM users WHERE username = ?", [cleanOwner], (errU, uRow) => {
                    if (!uRow) {
                        db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES (?, 'user', ?)", [cleanOwner, MAIN_IMAGE]);
                    }
                });
            }
            io.emit('shops_updated');
            res.json({ success: true });
        });
});

app.post('/api/admin/edit-shop', isAdmin, (req, res) => {
    const { id, name, photoUrl, telegramUrl, description, owner, can_post, can_ads } = req.body;
    const cleanOwner = owner ? owner.replace('@', '').trim() : '';

    db.run("UPDATE shops SET name = ?, photoUrl = ?, telegramUrl = ?, description = ?, owner = ?, can_post = ?, can_ads = ? WHERE id = ?",
        [name, photoUrl || MAIN_IMAGE, telegramUrl, description, cleanOwner, can_post ? 1 : 0, can_ads ? 1 : 0, id], (err) => {
            if (err) {
                console.error("Error editing shop:", err.message);
                return res.status(500).json({ error: err.message });
            }

            if (cleanOwner) {
                db.get("SELECT * FROM users WHERE username = ?", [cleanOwner], (errU, uRow) => {
                    if (!uRow) {
                        db.run("INSERT OR IGNORE INTO users (username, status, avatarUrl) VALUES (?, 'user', ?)", [cleanOwner, MAIN_IMAGE]);
                    }
                });
            }
            io.emit('shops_updated');
            res.json({ success: true });
        });
});

app.post('/api/admin/delete-shop', isAdmin, (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM shops WHERE id = ?", [id], (err) => {
        if (err) {
            console.error("Error deleting shop:", err.message);
            return res.status(500).json({ error: err.message });
        }
        io.emit('shops_updated');
        res.json({ success: true });
    });
});

app.get('/api/referrals', (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' });
    db.all("SELECT username, status, timestamp FROM users WHERE invitedBy = ?", [req.session.username], (err, rows) => {
        if (err) {
            console.error("Error fetching referrals:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/users-list', (req, res) => {
    db.all("SELECT username FROM users", (err, rows) => {
        if (err) {
            console.error("Error fetching users list:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/', (req, res) => {
    const refParam = req.query.ref ? req.query.ref : '';
    if (!req.session.username) {
        const num1 = Math.floor(Math.random() * 9) + 1;
        const num2 = Math.floor(Math.random() * 9) + 1;
        const captchaSum = num1 + num2;

        return res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$AKIHABARA_cc.228$ - Авторизация</title>
            <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 20px; background: #000 url('${MAIN_IMAGE}') no-repeat center center fixed; background-size: cover; min-height: 100vh; width: 100vw; display: flex; justify-content: center; align-items: center; font-family: sans-serif; }
            body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 0; }
            .login-box { position: relative; z-index: 1; background: rgba(20,20,20,0.95); padding: 30px; border-radius: 12px; border: 2px solid #ff0055; box-shadow: 0 0 25px #ff0055; text-align: center; width: 90%; max-width: 320px; }
            h2 { color: #00eaff; margin-bottom: 20px; text-shadow: 0 0 10px #00eaff; font-size: 1.4em; }
            input { width: 100%; padding: 12px; margin-bottom: 15px; background: #000; border: 1px solid #ff0055; color: #00eaff; border-radius: 6px; font-size: 1em; outline: none; }
            .captcha-label { color: #fff; font-size: 0.9em; margin-bottom: 8px; display: block; text-align: left; }
            button { width: 100%; padding: 12px; background: #ff0055; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1em; }
            </style>
            </head>
            <body>
            <div class="login-box">
            <h2>$AKIHABARA$</h2>
            <form method="POST" action="/login">
            <input type="hidden" name="ref" value="${refParam}">
            <input type="hidden" name="captcha_expected" value="${captchaSum}">
            <input type="text" name="username" placeholder="Ваш Telegram ник" required autocomplete="off">
            <label class="captcha-label">Сколько будет: <b>${num1} + ${num2}</b> = ?</label>
            <input type="number" name="captcha" placeholder="Введите ответ" required autocomplete="off">
            <button type="submit">Войти</button>
            </form>
            </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$AKIHABARA_cc.228$ - Premium Telegram Platform</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                body {
                    background: #000 url('${MAIN_IMAGE}') no-repeat center center fixed;
                    background-size: cover; min-height: 100vh; width: 100vw; color: #fff;
                    display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow-y: auto; padding: 15px 0;
                }
                body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.78); z-index: 0; }

                .central-wrapper {
                    position: relative; z-index: 2; width: 96%; max-width: 900px;
                    background: rgba(14, 16, 20, 0.96); border: 2px solid #ff0055; border-radius: 14px;
                    box-shadow: 0 0 35px rgba(255,0,85,0.4); display: flex; flex-direction: column;
                    height: 90vh; min-height: 600px; max-height: 950px; padding: 12px; backdrop-filter: blur(14px);
                }

                .top-counter-bar {
                    display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.6);
                    padding: 8px 14px; border-radius: 8px; border: 1px solid #333; margin-bottom: 10px; font-size: 0.9em; color: #00eaff; flex-wrap: wrap; gap: 5px;
                }

                .tg-chat-btn-link {
                    background: #0088cc; color: #fff; text-decoration: none; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 0.85em; display: inline-flex; align-items: center; gap: 5px; transition: 0.3s;
                }
                .tg-chat-btn-link:hover { background: #00aaff; box-shadow: 0 0 8px #0088cc; }

                .menu-tabs {
                    display: flex; gap: 8px; margin-bottom: 12px; background: rgba(0,0,0,0.6);
                    padding: 8px; border-radius: 8px; border: 1px solid #333; justify-content: center; flex-wrap: wrap;
                }
                .tab-btn {
                    background: #222; border: 1px solid #444; color: #fff; padding: 8px 16px;
                    border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: 0.3s;
                }
                .tab-btn.active {
                    background: #ff0055; border-color: #ff0055; box-shadow: 0 0 10px #ff0055; color: #fff;
                }
                .tab-btn:hover { border-color: #00eaff; color: #00eaff; }

                .section-content { display: none; flex: 1; flex-direction: column; overflow-y: auto; }
                .section-content.active { display: flex; }

                .list-box-title {
                    text-align: center; color: #00eaff; font-size: 1.15em; margin-bottom: 12px;
                    text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 6px;
                }

                #pinned-banner { background: rgba(0,234,255,0.15); border: 1px solid #00eaff; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-size: 0.85em; display: none; justify-content: space-between; align-items: center; }

                #messages-box { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: rgba(10,12,16,0.5); border-radius: 8px; border: 1px solid #222; }
                .msg-card { display: flex; gap: 10px; max-width: 82%; background: #18222d; padding: 8px 12px; border-radius: 12px; border: 1px solid #2b394b; position: relative; color: #e4e6eb; box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
                .msg-card.own { align-self: flex-end; background: #2b5278; border-color: #3e6d9b; flex-direction: row-reverse; }
                .msg-card.system { align-self: center; background: rgba(0,234,255,0.1); border-color: #00eaff; color: #00eaff; font-size: 0.85em; text-align: center; width: 100%; max-width: 100%; justify-content: center; }
                .msg-card.ad-post { border: 2px dashed #ff0055; background: rgba(35,15,28,0.95); max-width: 90%; width: 100%; }
                
                .msg-card img.avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid #00eaff; flex-shrink: 0; }
                .msg-content { flex: 1; min-width: 0; }
                .msg-info { display: flex; justify-content: space-between; font-size: 0.75em; color: #6ab2f2; margin-bottom: 3px; font-weight: 600; }
                .msg-card.own .msg-info { color: #8ec5fc; }
                .msg-text { font-size: 0.95em; word-break: break-word; line-height: 1.45; }
                .msg-time { font-size: 0.65em; color: #87909a; margin-left: 6px; font-weight: normal; }
                .media-preview { margin-top: 6px; max-width: 100%; max-height: 260px; border-radius: 8px; object-fit: cover; display: block; border: 1px solid #333; }
                
                .msg-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 6px; flex-wrap: wrap; }
                .msg-actions { display: flex; gap: 6px; font-size: 0.75em; }
                .msg-action-btn { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #00eaff; padding: 2px 6px; border-radius: 4px; cursor: pointer; }
                .msg-action-btn:hover { background: rgba(0,234,255,0.2); }

                .like-btn { background: rgba(0,0,0,0.3); border: 1px solid #444; color: #ff0055; padding: 2px 8px; border-radius: 12px; cursor: pointer; font-size: 0.8em; display: inline-flex; align-items: center; gap: 4px; transition: 0.2s; }
                .like-btn.liked { background: rgba(255,0,85,0.2); border-color: #ff0055; color: #fff; }

                .chat-input-box { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid #333; position: relative; }
                .chat-input-row { display: flex; gap: 8px; align-items: center; width: 100%; }
                .chat-input { flex: 1; background: #17212b; border: 1px solid #2b394b; padding: 12px; border-radius: 10px; color: #fff; outline: none; font-size: 0.95em; min-width: 0; }
                .chat-input:focus { border-color: #6ab2f2; }
                .action-icon-btn { background: #17212b; border: 1px solid #2b394b; color: #6ab2f2; padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 1.1em; transition: 0.2s; }
                .action-icon-btn:hover { background: #232e3c; color: #00eaff; }

                #mention-dropdown { display: none; position: absolute; bottom: 70px; left: 10px; background: #17212b; border: 1px solid #2b394b; border-radius: 8px; max-height: 150px; overflow-y: auto; width: 220px; z-index: 15; box-shadow: 0 4px 12px rgba(0,0,0,0.6); }
                .mention-item { padding: 8px 12px; font-size: 0.85em; color: #e4e6eb; cursor: pointer; border-bottom: 1px solid #222; }
                .mention-item:hover { background: #2b5278; color: #fff; }

                #emoji-picker { display: none; position: absolute; bottom: 70px; left: 0; width: 320px; background: #17212b; border: 2px solid #ff0055; border-radius: 12px; padding: 10px; z-index: 20; box-shadow: 0 0 20px rgba(0,0,0,0.9); }
                #emoji-picker.open { display: block; }
                .picker-tabs { display: flex; gap: 5px; margin-bottom: 8px; border-bottom: 1px solid #2b394b; padding-bottom: 5px; }
                .picker-tab { background: #232e3c; border: none; color: #aaa; padding: 4px 8px; font-size: 0.8em; border-radius: 4px; cursor: pointer; }
                .picker-tab.active { background: #ff0055; color: #fff; }
                .picker-pane { display: none; max-height: 150px; overflow-y: auto; grid-template-columns: repeat(6, 1fr); gap: 5px; }
                .picker-pane.active { display: grid; }
                .emoji-opt { font-size: 1.4em; cursor: pointer; text-align: center; padding: 4px; border-radius: 4px; }
                .emoji-opt:hover { background: rgba(255,0,85,0.3); }

                .exchangers-grid, .shops-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
                .ex-card, .shop-card { background: rgba(20,20,20,0.85); border: 1px solid #333; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; }
                .ex-info, .shop-info { display: flex; align-items: center; gap: 12px; }
                .ex-info img, .shop-info img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 1px solid #ff0055; }
                .btn-group { display: flex; gap: 6px; align-items: center; }
                .ex-tg-btn { background: #0088cc; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 0.8em; font-weight: bold; text-decoration: none; }
                .ad-post-btn { background: #ff0055; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer; font-weight: bold; }
                .complaint-btn { background: #ff3333; color: #fff; border: none; padding: 6px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer; }
                
                .admin-panel { background: rgba(30,0,20,0.9); border: 1px dashed #ff0055; padding: 15px; border-radius: 8px; margin-top: 15px; display: none; text-align: left; }
                .admin-panel input, .admin-panel textarea, .admin-panel select { width: 100%; padding: 8px; margin-bottom: 10px; background: #000; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 0.85em; }
                .admin-panel label { font-size: 0.8em; color: #00eaff; display: block; margin-bottom: 5px; }
                .admin-btn { background: #00eaff; color: #000; border: none; padding: 8px 15px; font-weight: bold; border-radius: 4px; cursor: pointer; width: 100%; margin-top: 5px; }
                .admin-btn-danger { background: #ff3333; color: #fff; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="central-wrapper">
                <div class="top-counter-bar">
                    <span>👑 Главный админ: <b style="color:#ff0055;">@koliaegorov99po-afk</b></span>
                    <span>👥 Участников: <b id="total-users-count">...</b></span>
                    <span>🔗 Рефералов: <b id="top-ref-counter" style="color:#00eaff;">0</b></span>
                    <div>
                        <a id="top-tg-chat-btn" href="https://t.me/+K9gPO5PUyttlN2Zi" target="_blank" class="tg-chat-btn-link">
                            <i class="fa-brands fa-telegram"></i> Чат Telegram
                        </a>
                    </div>
                </div>

                <div class="menu-tabs">
                    <button class="tab-btn active" onclick="switchTab('chat', this)">Общий Чат (Рефералы, Обменники, Магазины)</button>
                    <button class="tab-btn" onclick="switchTab('exchangers', this)">Обменники</button>
                    <button class="tab-btn" onclick="switchTab('shops', this)">Магазины</button>
                    <button class="tab-btn" onclick="switchTab('profile', this)">Профиль</button>
                </div>

                <div id="chat" class="section-content active">
                    <div class="list-box-title">Общий чат платформы (Посты, Фото, Видео)</div>
                    <div id="pinned-banner">
                        <div>📌 <b>Закреп:</b> <span id="pinned-text-content">...</span></div>
                        <button class="admin-action-btn" id="unpin-btn-top" onclick="unpinCurrentMessage()" style="background:#ff0055;color:#fff;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;display:none;font-size:0.75em;">Открепить</button>
                    </div>
                    <div id="messages-box"></div>
                    <div class="chat-input-box">
                        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                            <input type="text" id="media-url-input" class="chat-input" placeholder="Ссылка на фото или видео (необязательно)" style="font-size:0.85em; padding:8px;" autocomplete="off">
                            <select id="media-type-select" style="background:#17212b; border:1px solid #2b394b; color:#fff; padding:8px; border-radius:8px; font-size:0.85em; outline:none;">
                                <option value="image">Фото</option>
                                <option value="video">Видео</option>
                            </select>
                        </div>
                        <div class="chat-input-row">
                            <button class="action-icon-btn" onclick="toggleEmojiPicker()"><i class="fa-regular fa-face-smile"></i></button>
                            <div style="position:relative; flex:1; display:flex;">
                                <input type="text" id="msg-input" class="chat-input" placeholder="Написать пост или сообщение, тегнуть @..." autocomplete="off" oninput="handleInputTyping(event)">
                                <div id="mention-dropdown"></div>
                            </div>
                            <button class="action-icon-btn" onclick="sendMessage()"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
                        
                        <div id="emoji-picker">
                            <div class="picker-tabs">
                                <button class="picker-tab active" onclick="switchPickerTab('standart', this)">Эмодзи</button>
                                <button class="picker-tab" onclick="switchPickerTab('premium', this)">Премиум</button>
                                <button class="picker-tab" onclick="switchPickerTab('gifs', this)">GIF</button>
                            </div>
                            <div id="pane-standart" class="picker-pane active">
                                <span class="emoji-opt" onclick="addEmoji('😀')">😀</span><span class="emoji-opt" onclick="addEmoji('😂')">😂</span><span class="emoji-opt" onclick="addEmoji('🔥')">🔥</span><span class="emoji-opt" onclick="addEmoji('🚀')">🚀</span><span class="emoji-opt" onclick="addEmoji('👍')">👍</span><span class="emoji-opt" onclick="addEmoji('🎉')">🎉</span>
                            </div>
                            <div id="pane-premium" class="picker-pane">
                                <span class="emoji-opt" onclick="addEmoji('💎👑')">💎👑</span><span class="emoji-opt" onclick="addEmoji('⚡🔥')">⚡🔥</span><span class="emoji-opt" onclick="addEmoji('🦄✨')">🦄✨</span><span class="emoji-opt" onclick="addEmoji('🌟🚀')">🌟🚀</span><span class="emoji-opt" onclick="addEmoji('💎🔥')">💎🔥</span><span class="emoji-opt" onclick="addEmoji('⚡👑')">⚡👑</span>
                            </div>
                            <div id="pane-gifs" class="picker-pane" style="grid-template-columns: repeat(2, 1fr); font-size: 0.8em; text-align: center;">
                                <div style="background:#222; padding:6px; border-radius:4px; cursor:pointer;" onclick="sendGif('https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif')">🔥 Animation</div>
                                <div style="background:#222; padding:6px; border-radius:4px; cursor:pointer;" onclick="sendGif('https://media.giphy.com/media/l0HlRnAWXxn0MhOBK/giphy.gif')">🚀 Crypto</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="exchangers" class="section-content">
                    <div class="list-box-title">Комната обменников</div>
                    <div class="exchangers-grid" id="exchangers-list"></div>
                </div>

                <div id="shops" class="section-content">
                    <div class="list-box-title">Комната магазинов</div>
                    <div class="shops-grid" id="shops-list"></div>
                </div>

                <div id="profile" class="section-content">
                    <div class="list-box-title">Ваш Профиль</div>
                    <div style="text-align: center; padding: 15px;">
                        <img src="${MAIN_IMAGE}" style="width: 75px; height: 75px; border-radius: 50%; border: 2px solid #00eaff; object-fit: cover; margin-bottom: 10px;">
                        <h3 id="user-name" style="color: #00eaff;">Загрузка...</h3>
                        <p id="user-role" style="color: #ff0055; font-size: 0.8em; margin-top: 5px;">СТАТУС</p>
                        
                        <div style="margin-top: 15px; background: #000; padding: 10px; border-radius: 6px; border: 1px solid #00eaff;">
                            <p style="font-size: 0.75em; color: #00eaff; margin-bottom: 5px;">Ваша реферальная ссылка:</p>
                            <span id="ref-link" style="font-size: 0.7em; color: #aaa; word-break: break-all;">Загрузка...</span>
                            <button class="admin-btn" style="margin-top: 8px; font-size: 0.8em; padding: 6px;" onclick="copyRefLink()">Скопировать ссылку</button>
                        </div>

                        <div style="margin-top: 15px; background: #000; padding: 10px; border-radius: 6px; border: 1px solid #333; text-align: left;">
                            <h5 style="color: #00eaff; font-size: 0.85em; margin-bottom: 8px;"><i class="fa-solid fa-users"></i> Приглашенные вами рефералы (<span id="ref-counter-badge">0</span>):</h5>
                            <div id="my-referrals-list" style="font-size: 0.75em; color: #ccc; max-height: 100px; overflow-y: auto;">Загрузка...</div>
                        </div>
                        
                        <div id="admin-section" class="admin-panel">
                            <h4 style="color: #ff0055; margin-bottom: 10px; text-align:center;">Панель Администратора</h4>
                            
                            <div id="main-admin-chat-link-box" style="background: #000; padding: 10px; border-radius: 6px; margin-bottom: 15px; display:none;">
                                <h5 style="color: #00eaff; margin-bottom: 5px; font-size:0.85em;">Ссылка на Telegram-чат в меню:</h5>
                                <input type="text" id="admin-tg-chat-input" placeholder="https://t.me/...">
                                <button class="admin-btn" onclick="updateChatLink()">Изменить ссылку на чат</button>
                            </div>

                            <div style="background: #000; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                <h5 style="color: #00eaff; margin-bottom: 5px; font-size:0.85em;">Управление администраторами и пользователями:</h5>
                                <select id="target-user-select"></select>
                                <select id="new-status-select" style="margin-top:5px;">
                                    <option value="admin">Сделать администратором</option>
                                    <option value="user">Убрать админку (обычный юзер)</option>
                                </select>
                                <button class="admin-btn" onclick="changeUserStatus()">Изменить статус</button>
                                <button class="admin-btn admin-btn-danger" onclick="deleteUserAccount()">Удалить пользователя</button>
                            </div>

                            <div style="background: #000; padding: 10px; border-radius: 6px; margin-bottom: 15px; max-height: 140px; overflow-y: auto;">
                                <h5 style="color: #ff3333; margin-bottom: 5px; font-size:0.85em;">Жалобы на шопы / обменники:</h5>
                                <div id="admin-complaints-list" style="font-size: 0.75em; color: #ccc;">Нет жалоб</div>
                            </div>

                            <p style="color: #00eaff; font-size: 0.85em; margin-bottom: 5px;">Добавить / Редактировать обменник</p>
                            <input type="hidden" id="edit-ex-id" value="">
                            <input type="text" id="ex-name" placeholder="Название обменника">
                            <input type="text" id="ex-url" placeholder="Ссылка на Telegram">
                            <input type="text" id="ex-owner" placeholder="Ник владельца (@username)">
                            <textarea id="ex-desc" placeholder="Описание / Курс"></textarea>
                            <div style="text-align:left; margin-bottom:8px;">
                                <label><input type="checkbox" id="ex-post"> Разрешить посты</label>
                                <label><input type="checkbox" id="ex-ads"> Разрешить рекламу</label>
                            </div>
                            <button class="admin-btn" id="ex-submit-btn" onclick="saveExchanger()">Добавить обменник</button>
                            <button class="admin-btn" id="ex-cancel-btn" style="background:#555;color:#fff;display:none;margin-top:5px;" onclick="resetExchangerForm()">Отмена редактирования</button>

                            <hr style="border-color: #444; margin: 15px 0 10px 0;">
                            <p style="color: #00eaff; font-size: 0.85em; margin-bottom: 5px;">Добавить / Редактировать магазин</p>
                            <input type="hidden" id="edit-shop-id" value="">
                            <input type="text" id="shop-name" placeholder="Название магазина">
                            <input type="text" id="shop-url" placeholder="Ссылка на Telegram">
                            <input type="text" id="shop-owner" placeholder="Ник владельца (@username)">
                            <textarea id="shop-desc" placeholder="Описание магазина"></textarea>
                            <div style="text-align:left; margin-bottom:8px;">
                                <label><input type="checkbox" id="shop-post"> Разрешить посты</label>
                                <label><input type="checkbox" id="shop-ads"> Разрешить рекламу</label>
                            </div>
                            <button class="admin-btn" id="shop-submit-btn" onclick="saveShop()">Добавить магазин</button>
                            <button class="admin-btn" id="shop-cancel-btn" style="background:#555;color:#fff;display:none;margin-top:5px;" onclick="resetShopForm()">Отмена редактирования</button>
                        </div>

                        <a href="/logout" style="display: block; margin-top: 15px; padding: 10px; background: #ff0055; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.9em; text-align: center;">Выйти из аккаунта</a>
                    </div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const MAIN_IMAGE = '${MAIN_IMAGE}';
                let currentUser = null;
                let exchangersData = [];
                let shopsData = [];
                let allUsersList = [];

                async function loadStats() {
                    const res = await fetch('/api/stats');
                    const data = await res.json();
                    document.getElementById('total-users-count').innerText = data.totalUsers;
                    if(data.tgChatLink) {
                        document.getElementById('top-tg-chat-btn').href = data.tgChatLink;
                    }
                }
                loadStats();

                async function loadUsersListForMentions() {
                    const res = await fetch('/api/users-list');
                    if(res.ok) {
                        allUsersList = await res.json();
                    }
                }
                loadUsersListForMentions();

                async function loadUserData() {
                    const res = await fetch('/api/user');
                    if (res.ok) {
                        currentUser = await res.json();
                        document.getElementById('user-name').innerText = '@' + currentUser.username;
                        document.getElementById('user-role').innerText = currentUser.status.toUpperCase();
                        document.getElementById('ref-link').innerText = window.location.origin + '?ref=' + currentUser.username;
                        
                        if (currentUser.status === 'admin') {
                            document.getElementById('admin-section').style.display = 'block';
                            loadAdminData();
                        }
                        loadMyReferrals();
                    }
                }
                loadUserData();

                async function loadMyReferrals() {
                    const res = await fetch('/api/referrals');
                    if(res.ok) {
                        const refs = await res.json();
                        const container = document.getElementById('my-referrals-list');
                        container.innerHTML = '';
                        
                        document.getElementById('top-ref-counter').innerText = refs.length;
                        document.getElementById('ref-counter-badge').innerText = refs.length;

                        if(refs.length === 0) {
                            container.innerHTML = 'У вас пока нет приглашенных рефералов';
                        } else {
                            refs.forEach(r => {
                                container.innerHTML += `<div>👤 @${r.username} (<span style="color:#00eaff;">${r.status}</span>)</div>`;
                            });
                        }
                    }
                }

                function copyRefLink() {
                    const linkText = document.getElementById('ref-link').innerText;
                    navigator.clipboard.writeText(linkText);
                    alert('Реферальная ссылка скопирована в буфер обмена!');
                }

                async function loadAdminData() {
                    const res = await fetch('/api/admin/data');
                    if(res.ok) {
                        const data = await res.json();
                        exchangersData = data.exchangers;
                        shopsData = data.shops;
                        
                        if(data.currentAdmin.toLowerCase() === 'koliaegorov99po-afk') {
                            document.getElementById('main-admin-chat-link-box').style.display = 'block';
                            document.getElementById('admin-tg-chat-input').value = data.tgChatLink || '';
                        }

                        const select = document.getElementById('target-user-select');
                        select.innerHTML = '';
                        data.users.forEach(u => {
                            if(data.currentAdmin.toLowerCase() !== 'koliaegorov99po-afk' && u.username.toLowerCase() === 'koliaegorov99po-afk') return;
                            select.innerHTML += `<option value="${u.username}">@${u.username} (${u.status})</option>`;
                        });

                        const compContainer = document.getElementById('admin-complaints-list');
                        compContainer.innerHTML = '';
                        if(data.complaints.length === 0) {
                            compContainer.innerHTML = 'Нет жалоб';
                        } else {
                            data.complaints.forEach(c => {
                                compContainer.innerHTML += `<div style="border-bottom:1px solid #333; margin-bottom:5px; padding-bottom:3px;"><b>[${c.target_type}] ${c.target_name}</b> от @${c.complainant}: <span style="color:#ff0055;">${c.reason}</span></div>`;
                            });
                        }
                    }
                }

                async function updateChatLink() {
                    const tgChatLink = document.getElementById('admin-tg-chat-input').value.trim();
                    if(!tgChatLink) return alert('Введите корректную ссылку');
                    const res = await fetch('/api/admin/update-chat-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tgChatLink })
                    });
                    if(res.ok) {
                        alert('Ссылка на Telegram-чат успешно обновлена!');
                        document.getElementById('top-tg-chat-btn').href = tgChatLink;
                    } else {
                        alert('Ошибка обновления ссылки');
                    }
                }

                async function changeUserStatus() {
                    const targetUser = document.getElementById('target-user-select').value;
                    const newStatus = document.getElementById('new-status-select').value;
                    const res = await fetch('/api/admin/set-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetUser, newStatus })
                    });
                    if(res.ok) {
                        alert('Статус пользователя успешно обновлен!');
                        loadAdminData();
                    } else {
                        const errData = await res.json();
                        alert(errData.error || 'Ошибка изменения статуса');
                    }
                }

                async function deleteUserAccount() {
                    const targetUser = document.getElementById('target-user-select').value;
                    if(!confirm(`Вы действительно хотите удалить пользователя @${targetUser}?`)) return;
                    const res = await fetch('/api/admin/delete-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targetUser })
                    });
                    if(res.ok) {
                        alert('Пользователь успешно удален!');
                        loadAdminData();
                    } else {
                        const errData = await res.json();
                        alert(errData.error || 'Ошибка удаления');
                    }
                }

                function switchTab(tabId, el) {
                    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.getElementById(tabId).classList.add('active');
                    el.classList.add('active');
                    if(tabId === 'exchangers') loadExchangers();
                    if(tabId === 'shops') loadShops();
                }

                function toggleEmojiPicker() {
                    document.getElementById('emoji-picker').classList.toggle('open');
                }

                function switchPickerTab(paneName, btn) {
                    document.querySelectorAll('.picker-pane').forEach(p => p.classList.remove('active'));
                    document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('pane-' + paneName).classList.add('active');
                    btn.classList.add('active');
                }

                function addEmoji(emoji) {
                    const input = document.getElementById('msg-input');
                    input.value += emoji;
                    document.getElementById('emoji-picker').classList.remove('open');
                    input.focus();
                }

                function handleInputTyping(e) {
                    const input = e.target;
                    const val = input.value;
                    const dropdown = document.getElementById('mention-dropdown');
                    
                    const lastAtIndex = val.lastIndexOf('@');
                    if (lastAtIndex !== -1 && (lastAtIndex === 0 || val[lastAtIndex - 1] === ' ')) {
                        const query = val.slice(lastAtIndex + 1).toLowerCase();
                        const matches = allUsersList.filter(u => u.username.toLowerCase().includes(query));
                        
                        if (matches.length > 0) {
                            dropdown.innerHTML = '';
                            matches.forEach(m => {
                                dropdown.innerHTML += `<div class="mention-item" onclick="selectMention('${m.username}')">@${m.username}</div>`;
                            });
                            dropdown.style.display = 'block';
                            return;
                        }
                    }
                    dropdown.style.display = 'none';
                }

                function selectMention(username) {
                    const input = document.getElementById('msg-input');
                    const val = input.value;
                    const lastAtIndex = val.lastIndexOf('@');
                    input.value = val.slice(0, lastAtIndex) + '@' + username + ' ';
                    document.getElementById('mention-dropdown').style.display = 'none';
                    input.focus();
                }

                function sendMessage() {
                    const input = document.getElementById('msg-input');
                    const text = input.value.trim();
                    const mediaUrl = document.getElementById('media-url-input').value.trim();
                    const mediaType = document.getElementById('media-type-select').value;

                    if (!text && !mediaUrl) return;
                    socket.emit('chat_message', { text, mediaUrl: mediaUrl || null, mediaType: mediaUrl ? mediaType : null, isAd: false });
                    input.value = '';
                    document.getElementById('media-url-input').value = '';
                    document.getElementById('mention-dropdown').style.display = 'none';
                }

                function sendGif(url) {
                    socket.emit('chat_message', { text: 'GIF анимация', mediaUrl: url, mediaType: 'image', isAd: false });
                    document.getElementById('emoji-picker').classList.remove('open');
                }

                async function sendAdPost(type, name) {
                    const text = prompt(`Введите рекламный текст от ${type} "${name}":`);
                    if(!text) return;
                    const mediaUrl = prompt('Укажите ссылку на картинку или видео для рекламного поста:', '');
                    const mediaType = mediaUrl && mediaUrl.includes('.mp4') ? 'video' : 'image';
                    
                    socket.emit('chat_message', { text: `📢 РЕКЛАМА [${type}]: ${name}\n\n${text}`, mediaUrl: mediaUrl || null, mediaType: mediaUrl ? mediaType : null, isAd: true });
                    alert('Рекламный пост успешно опубликован в общем чате!');
                }

                document.getElementById('msg-input').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') sendMessage();
                });

                function appendMessage(msg) {
                    const box = document.getElementById('messages-box');
                    const isSystem = msg.isSystem;
                    const isOwn = currentUser && msg.username === currentUser.username;
                    const div = document.createElement('div');
                    div.id = 'msg-' + msg.id;
                    
                    if (isSystem) {
                        div.className = 'msg-card system';
                        div.innerHTML = `<div class="msg-text">${msg.text}</div>`;
                    } else {
                        div.className = 'msg-card' + (isOwn ? ' own' : '') + (msg.isAd ? ' ad-post' : '');
                        let mediaHtml = '';
                        if (msg.mediaUrl) {
                            if (msg.mediaType === 'video') {
                                mediaHtml = `<video src="${msg.mediaUrl}" controls class="media-preview"></video>`;
                            } else {
                                mediaHtml = `<img src="${msg.mediaUrl}" alt="media" class="media-preview">`;
                            }
                        }

                        let likesArr = [];
                        try {
                            likesArr = typeof msg.likes === 'string' ? JSON.parse(msg.likes) : (msg.likes || []);
                        } catch(e) { likesArr = []; }

                        const hasLiked = currentUser && likesArr.includes(currentUser.username);
                        const likesCount = likesArr.length;

                        const tempDiv = document.createElement('div');
                        tempDiv.textContent = msg.text;
                        let safeText = tempDiv.innerHTML;
                        let formattedText = safeText.replace(/(@[a-zA-Z0-9_-]+)/g, '<b style="color:#00eaff;">$1</b>');

                        let actionsHtml = '';
                        if (currentUser && (currentUser.status === 'admin' || isOwn)) {
                            actionsHtml += `<button class="msg-action-btn" onclick="editMessage(${msg.id})">Изменить</button>`;
                        }
                        if (currentUser && currentUser.status === 'admin') {
                            const pinLabel = msg.isPinned ? 'Открепить' : 'Закрепить';
                            actionsHtml += `<button class="msg-action-btn" onclick="togglePinMessage(${msg.id})">${pinLabel}</button>`;
                        }

                        div.innerHTML = `
                            <img src="${msg.avatarUrl || MAIN_IMAGE}" alt="av" class="avatar">
                            <div class="msg-content">
                                <div class="msg-info">
                                    <span>@${msg.username} ${msg.isAd ? '<b style="color:#ff0055;">[РЕКЛАМА]</b>' : ''}</span>
                                    <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div class="msg-text" id="msg-text-${msg.id}" style="white-space: pre-wrap;">${formattedText}</div>
                                ${mediaHtml}
                                <div class="msg-footer-bar">
                                    <div class="msg-actions">${actionsHtml}</div>
                                    <button class="like-btn ${hasLiked ? 'liked' : ''}" onclick="toggleLike(${msg.id})">
                                        <i class="fa-solid fa-heart"></i> <span id="like-count-${msg.id}">${likesCount}</span>
                                    </button>
                                </div>
                            </div>
                        `;

                        if (msg.isPinned) {
                            document.getElementById('pinned-banner').style.display = 'flex';
                            document.getElementById('pinned-text-content').innerText = msg.text;
                            if(currentUser && currentUser.status === 'admin') {
                                document.getElementById('unpin-btn-top').style.display = 'inline-block';
                            }
                        }
                    }
                    box.appendChild(div);
                    box.scrollTop = box.scrollHeight;
                }

                function editMessage(id) {
                    const textEl = document.getElementById('msg-text-' + id);
                    const newText = prompt('Измените текст сообщения:', textEl.innerText);
                    if(newText === null) return;
                    socket.emit('edit_message', { id, text: newText });
                }

                function togglePinMessage(id) {
                    socket.emit('pin_message', { id });
                }

                function unpinCurrentMessage() {
                    socket.emit('unpin_message');
                }

                function toggleLike(id) {
                    socket.emit('toggle_like', { id });
                }

                async function sendComplaint(type, name) {
                    const reason = prompt(`Укажите причину жалобы на ${type} "${name}":`);
                    if(!reason) return;
                    const res = await fetch('/api/complaint', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_type: type, target_name: name, reason })
                    });
                    if(res.ok) alert('Жалоба успешно отправлена администратору!');
                }

                async function loadExchangers() {
                    const res = await fetch('/api/exchangers');
                    const list = await res.json();
                    exchangersData = list;
                    const container = document.getElementById('exchangers-list');
                    container.innerHTML = '';
                    if(list.length === 0) {
                        container.innerHTML = '<p style="color:#888; text-align:center;">Обменники пока не добавлены</p>';
                        return;
                    }
                    list.forEach(ex => {
                        let badges = '';
                        if(ex.can_post) badges += '<span style="background:#00eaff;color:#000;font-size:0.6em;padding:2px 5px;border-radius:3px;margin-right:4px;">Посты: ВКЛ</span>';
                        if(ex.can_ads) badges += '<span style="background:#ff0055;color:#fff;font-size:0.6em;padding:2px 5px;border-radius:3px;">Реклама: ВКЛ</span>';

                        let adBtn = '';
                        if(currentUser && (currentUser.status === 'admin' || (ex.can_ads && currentUser.username === ex.owner))) {
                            adBtn = `<button class="ad-post-btn" onclick="sendAdPost('Обменник', '${ex.name}')">Реклама</button>`;
                        }

                        let adminTools = '';
                        if(currentUser && currentUser.status === 'admin') {
                            adminTools = `
                                <button class="msg-action-btn" onclick="startEditExchanger(${ex.id})">Редактировать</button>
                                <button class="msg-action-btn" style="background:#ff3333;color:#fff;border:none;" onclick="deleteExchanger(${ex.id})">Удалить</button>
                            `;
                        }

                        container.innerHTML += `
                            <div class="ex-card">
                                <div class="ex-info">
                                    <img src="${ex.photoUrl || MAIN_IMAGE}" alt="ex">
                                    <div>
                                        <h4 style="color: #00eaff; font-size: 0.95em;">${ex.name} <span style="font-size:0.7em;color:#aaa;">(@${ex.owner || 'админ'})</span></h4>
                                        <p style="font-size: 0.75em; color: #aaa; margin: 2px 0;">${ex.description}</p>
                                        <div>${badges}</div>
                                        <div style="margin-top:4px;">${adminTools}</div>
                                    </div>
                                </div>
                                <div class="btn-group">
                                    ${adBtn}
                                    <button class="complaint-btn" onclick="sendComplaint('Обменник', '${ex.name}')">Жалоба</button>
                                    <a href="${ex.telegramUrl}" target="_blank" class="ex-tg-btn">Перейти</a>
                                </div>
                            </div>
                        `;
                    });
                }

                function startEditExchanger(id) {
                    const ex = exchangersData.find(e => e.id === id);
                    if(!ex) return;
                    document.getElementById('edit-ex-id').value = ex.id;
                    document.getElementById('ex-name').value = ex.name;
                    document.getElementById('ex-url').value = ex.telegramUrl;
                    document.getElementById('ex-owner').value = ex.owner || '';
                    document.getElementById('ex-desc').value = ex.description;
                    document.getElementById('ex-post').checked = ex.can_post === 1;
                    document.getElementById('ex-ads').checked = ex.can_ads === 1;
                    
                    document.getElementById('ex-submit-btn').innerText = 'Сохранить изменения';
                    document.getElementById('ex-cancel-btn').style.display = 'block';
                    document.getElementById('admin-section').scrollIntoView({ behavior: 'smooth' });
                }

                function resetExchangerForm() {
                    document.getElementById('edit-ex-id').value = '';
                    document.getElementById('ex-name').value = '';
                    document.getElementById('ex-url').value = '';
                    document.getElementById('ex-owner').value = '';
                    document.getElementById('ex-desc').value = '';
                    document.getElementById('ex-post').checked = false;
                    document.getElementById('ex-ads').checked = false;
                    document.getElementById('ex-submit-btn').innerText = 'Добавить обменник';
                    document.getElementById('ex-cancel-btn').style.display = 'none';
                }

                async function saveExchanger() {
                    const id = document.getElementById('edit-ex-id').value;
                    const data = {
                        id,
                        name: document.getElementById('ex-name').value,
                        telegramUrl: document.getElementById('ex-url').value,
                        owner: document.getElementById('ex-owner').value.replace('@',''),
                        description: document.getElementById('ex-desc').value,
                        can_post: document.getElementById('ex-post').checked,
                        can_ads: document.getElementById('ex-ads').checked
                    };
                    const url = id ? '/api/admin/edit-exchanger' : '/api/admin/add-exchanger';
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if(res.ok) {
                        alert(id ? 'Обменник успешно обновлен!' : 'Обменник успешно добавлен!');
                        resetExchangerForm();
                        loadExchangers();
                        loadAdminData();
                        loadUsersListForMentions();
                    } else {
                        alert('Ошибка сохранения');
                    }
                }

                async function deleteExchanger(id) {
                    if(!confirm('Удалить этот обменник?')) return;
                    const res = await fetch('/api/admin/delete-exchanger', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    if(res.ok) {
                        loadExchangers();
                        loadAdminData();
                    }
                }

                async function loadShops() {
                    const res = await fetch('/api/shops');
                    const list = await res.json();
                    shopsData = list;
                    const container = document.getElementById('shops-list');
                    container.innerHTML = '';
                    if(list.length === 0) {
                        container.innerHTML = '<p style="color:#888; text-align:center;">Магазины пока не добавлены</p>';
                        return;
                    }
                    list.forEach(sh => {
                        let badges = '';
                        if(sh.can_post) badges += '<span style="background:#00eaff;color:#000;font-size:0.6em;padding:2px 5px;border-radius:3px;margin-right:4px;">Посты: ВКЛ</span>';
                        if(sh.can_ads) badges += '<span style="background:#ff0055;color:#fff;font-size:0.6em;padding:2px 5px;border-radius:3px;">Реклама: ВКЛ</span>';

                        let adBtn = '';
                        if(currentUser && (currentUser.status === 'admin' || (sh.can_ads && currentUser.username === sh.owner))) {
                            adBtn = `<button class="ad-post-btn" onclick="sendAdPost('Магазин', '${sh.name}')">Реклама</button>`;
                        }

                        let adminTools = '';
                        if(currentUser && currentUser.status === 'admin') {
                            adminTools = `
                                <button class="msg-action-btn" onclick="startEditShop(${sh.id})">Редактировать</button>
                                <button class="msg-action-btn" style="background:#ff3333;color:#fff;border:none;" onclick="deleteShop(${sh.id})">Удалить</button>
                            `;
                        }

                        container.innerHTML += `
                            <div class="shop-card">
                                <div class="shop-info">
                                    <img src="${sh.photoUrl || MAIN_IMAGE}" alt="shop">
                                    <div>
                                        <h4 style="color: #00eaff; font-size: 0.95em;">${sh.name} <span style="font-size:0.7em;color:#aaa;">(@${sh.owner || 'админ'})</span></h4>
                                        <p style="font-size: 0.75em; color: #aaa; margin: 2px 0;">${sh.description}</p>
                                        <div>${badges}</div>
                                        <div style="margin-top:4px;">${adminTools}</div>
                                    </div>
                                </div>
                                <div class="btn-group">
                                    ${adBtn}
                                    <button class="complaint-btn" onclick="sendComplaint('Магазин', '${sh.name}')">Жалоба</button>
                                    <a href="${sh.telegramUrl}" target="_blank" class="ex-tg-btn">Перейти</a>
                                </div>
                            </div>
                        `;
                    });
                }

                function startEditShop(id) {
                    const sh = shopsData.find(s => s.id === id);
                    if(!sh) return;
                    document.getElementById('edit-shop-id').value = sh.id;
                    document.getElementById('shop-name').value = sh.name;
                    document.getElementById('shop-url').value = sh.telegramUrl;
                    document.getElementById('shop-owner').value = sh.owner || '';
                    document.getElementById('shop-desc').value = sh.description;
                    document.getElementById('shop-post').checked = sh.can_post === 1;
                    document.getElementById('shop-ads').checked = sh.can_ads === 1;
                    
                    document.getElementById('shop-submit-btn').innerText = 'Сохранить изменения';
                    document.getElementById('shop-cancel-btn').style.display = 'block';
                    document.getElementById('admin-section').scrollIntoView({ behavior: 'smooth' });
                }

                function resetShopForm() {
                    document.getElementById('edit-shop-id').value = '';
                    document.getElementById('shop-name').value = '';
                    document.getElementById('shop-url').value = '';
                    document.getElementById('shop-owner').value = '';
                    document.getElementById('shop-desc').value = '';
                    document.getElementById('shop-post').checked = false;
                    document.getElementById('shop-ads').checked = false;
                    document.getElementById('shop-submit-btn').innerText = 'Добавить магазин';
                    document.getElementById('shop-cancel-btn').style.display = 'none';
                }

                async function saveShop() {
                    const id = document.getElementById('edit-shop-id').value;
                    const data = {
                        id,
                        name: document.getElementById('shop-name').value,
                        telegramUrl: document.getElementById('shop-url').value,
                        owner: document.getElementById('shop-owner').value.replace('@',''),
                        description: document.getElementById('shop-desc').value,
                        can_post: document.getElementById('shop-post').checked,
                        can_ads: document.getElementById('shop-ads').checked
                    };
                    const url = id ? '/api/admin/edit-shop' : '/api/admin/add-shop';
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if(res.ok) {
                        alert(id ? 'Магазин успешно обновлен!' : 'Магазин успешно добавлен!');
                        resetShopForm();
                        loadShops();
                        loadAdminData();
                        loadUsersListForMentions();
                    } else {
                        alert('Ошибка сохранения');
                    }
                }

                async function deleteShop(id) {
                    if(!confirm('Удалить этот магазин?')) return;
                    const res = await fetch('/api/admin/delete-shop', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    if(res.ok) {
                        loadShops();
                        loadAdminData();
                    }
                }

                socket.on('chat_history', (messages) => {
                    const box = document.getElementById('messages-box');
                    box.innerHTML = '';
                    document.getElementById('pinned-banner').style.display = 'none';
                    document.getElementById('unpin-btn-top').style.display = 'none';
                    messages.forEach(msg => appendMessage(msg));
                });

                socket.on('new_message', (msg) => {
                    appendMessage(msg);
                });

                socket.on('message_updated', (msg) => {
                    const textEl = document.getElementById('msg-text-' + msg.id);
                    if(textEl) textEl.textContent = msg.text;
                });

                socket.on('message_pinned', (msg) => {
                    document.getElementById('pinned-banner').style.display = 'flex';
                    document.getElementById('pinned-text-content').innerText = msg.text;
                    if(currentUser && currentUser.status === 'admin') {
                        document.getElementById('unpin-btn-top').style.display = 'inline-block';
                    }
                });

                socket.on('message_unpinned', () => {
                    document.getElementById('pinned-banner').style.display = 'none';
                    document.getElementById('unpin-btn-top').style.display = 'none';
                });

                socket.on('likes_updated', (data) => {
                    const countEl = document.getElementById('like-count-' + data.id);
                    if(countEl) countEl.innerText = data.likes.length;
                    
                    const msgDiv = document.getElementById('msg-' + data.id);
                    if(msgDiv && currentUser) {
                        const likeBtn = msgDiv.querySelector('.like-btn');
                        if(likeBtn) {
                            if(data.likes.includes(currentUser.username)) {
                                likeBtn.classList.add('liked');
                            } else {
                                likeBtn.classList.remove('liked');
                            }
                        }
                    }
                });

                socket.on('chat_link_updated', (data) => {
                    document.getElementById('top-tg-chat-btn').href = data.tgChatLink;
                });

                socket.on('system_message', (msg) => {
                    appendMessage({ isSystem: true, text: msg.text, timestamp: new Date() });
                    loadStats();
                });

                socket.on('exchangers_updated', () => {
                    if(document.getElementById('exchangers').classList.contains('active')) {
                        loadExchangers();
                    }
                });

                socket.on('shops_updated', () => {
                    if(document.getElementById('shops').classList.contains('active')) {
                        loadShops();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

io.on('connection', (socket) => {
    const sessionUser = socket.request.session && socket.request.session.username ? socket.request.session.username : null;
    if (!sessionUser) {
        socket.disconnect();
        return;
    }

    db.all("SELECT * FROM messages ORDER BY timestamp ASC LIMIT 50", (err, rows) => {
        if (err) {
            console.error("Error loading chat history:", err.message);
        } else {
            socket.emit('chat_history', rows);
        }
    });

    socket.on('chat_message', (data) => {
        const isAd = data.isAd ? 1 : 0;
        
        db.get("SELECT avatarUrl FROM users WHERE username = ?", [sessionUser], (errUser, row) => {
            if (errUser) {
                console.error("Error finding user avatar for message:", errUser.message);
                return;
            }
            const avatar = row && row.avatarUrl ? row.avatarUrl : MAIN_IMAGE;

            db.run("INSERT INTO messages (username, avatarUrl, text, mediaUrl, mediaType, isAd, likes) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                [sessionUser, avatar, data.text, data.mediaUrl || null, data.mediaType || null, isAd, '[]'], function(errInsert) {
                if (errInsert) {
                    console.error("DB Error inserting message:", errInsert.message);
                    return;
                }
                
                const newMsgId = this.lastID;
                
                // Ограничение истории чата (храним последние 500 сообщений)
                db.run("DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY timestamp DESC LIMIT 500)", (errClean) => {
                    if (errClean) console.error("Error cleaning old messages:", errClean.message);
                });

                io.emit('new_message', { 
                    id: newMsgId, 
                    username: sessionUser, 
                    avatarUrl: avatar, 
                    text: data.text, 
                    mediaUrl: data.mediaUrl, 
                    mediaType: data.mediaType, 
                    isAd: isAd, 
                    isPinned: 0, 
                    likes: [],
                    timestamp: new Date() 
                });
            });
        });
    });

    socket.on('edit_message', (data) => {
        db.get("SELECT username FROM messages WHERE id = ?", [data.id], (err, msg) => {
            if (err || !msg) {
                if (err) console.error("Error finding message to edit:", err.message);
                return;
            }
            db.get("SELECT status FROM users WHERE username = ?", [sessionUser], (err2, user) => {
                if (err2 || !user) {
                    if (err2) console.error("Error finding user status for edit:", err2.message);
                    return;
                }
                if (user.status === 'admin' || msg.username === sessionUser) {
                    db.run("UPDATE messages SET text = ? WHERE id = ?", [data.text, data.id], (err3) => {
                        if (err3) {
                            console.error("Error updating message text:", err3.message);
                            return;
                        }
                        io.emit('message_updated', { id: data.id, text: data.text });
                    });
                }
            });
        });
    });

    socket.on('pin_message', (data) => {
        db.get("SELECT status FROM users WHERE username = ?", [sessionUser], (err, user) => {
            if (err || !user || user.status !== 'admin') {
                if (err) console.error("Error finding user status for pin:", err.message);
                return;
            }
            db.run("UPDATE messages SET isPinned = 0", [], (errClear) => {
                if (errClear) console.error("Error clearing pins:", errClear.message);
                db.run("UPDATE messages SET isPinned = 1 WHERE id = ?", [data.id], (err2) => {
                    if (err2) {
                        console.error("Error pinning message:", err2.message);
                        return;
                    }
                    db.get("SELECT * FROM messages WHERE id = ?", [data.id], (err3, row) => {
                        if (row) io.emit('message_pinned', row);
                    });
                });
            });
        });
    });

    socket.on('unpin_message', () => {
        db.get("SELECT status FROM users WHERE username = ?", [sessionUser], (err, user) => {
            if (err || !user || user.status !== 'admin') {
                if (err) console.error("Error finding user status for unpin:", err.message);
                return;
            }
            db.run("UPDATE messages SET isPinned = 0", [], (err2) => {
                if (err2) {
                    console.error("Error unpinning messages:", err2.message);
                    return;
                }
                io.emit('message_unpinned');
            });
        });
    });

    socket.on('toggle_like', (data) => {
        db.get("SELECT likes FROM messages WHERE id = ?", [data.id], (err, row) => {
            if (err || !row) {
                if (err) console.error("Error fetching message likes:", err.message);
                return;
            }
            let likes = [];
            try {
                likes = JSON.parse(row.likes || '[]');
            } catch(e) { likes = []; }

            const userIndex = likes.indexOf(sessionUser);
            if (userIndex > -1) {
                likes.splice(userIndex, 1);
            } else {
                likes.push(sessionUser);
            }

            const likesJson = JSON.stringify(likes);
            db.run("UPDATE messages SET likes = ? WHERE id = ?", [likesJson, data.id], (err2) => {
                if (err2) {
                    console.error("Error updating likes in DB:", err2.message);
                    return;
                }
                io.emit('likes_updated', { id: data.id, likes: likes });
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
