const crypto = require('crypto');
const db = require('../config/database');

const COOKIE_NAME = 'nexus_session';
const SESSION_HOURS = Math.max(1, Number(process.env.AUTH_SESSION_HOURS || 8));
const SESSION_TTL_MS = SESSION_HOURS * 60 * 60 * 1000;

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(req) {
    const raw = req.headers.cookie || '';
    const cookies = {};

    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) continue;
        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    }

    return cookies;
}

function getTokenFromRequest(req) {
    return parseCookies(req)[COOKIE_NAME] || null;
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_TTL_MS
    };
}

function clearCookieOptions() {
    const { maxAge, ...options } = cookieOptions();
    return options;
}

async function cleanupExpiredSessions() {
    await dbRun('DELETE FROM auth_sessions WHERE expires_at <= ?', [Date.now()]);
}

async function createSession(usuarioId) {
    await cleanupExpiredSessions();

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;

    await dbRun(
        `INSERT INTO auth_sessions (token_hash, usuario_id, expires_at)
         VALUES (?, ?, ?)`,
        [tokenHash, usuarioId, expiresAt]
    );

    return { token, expiresAt };
}

async function deleteSession(token) {
    if (!token) return;
    await dbRun('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
}

async function getAuthenticatedUser(token) {
    if (!token) return null;

    const row = await dbGet(
        `SELECT
            u.id,
            u.nome,
            u.email,
            u.masp,
            u.unidade,
            u.unidade_id,
            u.role,
            u.ativo,
            s.expires_at
         FROM auth_sessions s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.ativo = 1`,
        [hashToken(token), Date.now()]
    );

    if (!row) return null;

    return {
        id: row.id,
        nome: row.nome,
        email: row.email,
        masp: row.masp,
        unidade: row.unidade,
        unidade_id: row.unidade_id || null,
        role: row.role || 'usuario',
        ativo: Boolean(row.ativo),
        expiresAt: row.expires_at
    };
}

module.exports = {
    COOKIE_NAME,
    SESSION_TTL_MS,
    getTokenFromRequest,
    cookieOptions,
    clearCookieOptions,
    createSession,
    deleteSession,
    getAuthenticatedUser,
    cleanupExpiredSessions
};
