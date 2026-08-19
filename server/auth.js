const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_ALG = 'HS256';
const DEFAULT_PASSWORD = 'admin123';

function ensureDefaultUser(config) {
  const jwtSecret = config?.jwt?.secret || getDefaultJwtSecret();
  const adminUser = config?.auth?.adminUser || process.env.ADMIN_USER || 'admin';
  const adminPass = config?.auth?.adminPass || process.env.ADMIN_PASS || DEFAULT_PASSWORD;

  const row = db.prepare('SELECT id, username FROM users WHERE username = ?').get(adminUser);
  if (!row) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`  [auth] Created default user: ${adminUser} / ${adminPass}`);
  }
  return { jwtSecret, adminUser };
}

function getDefaultJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const envSecret = process.env.JWT_SECRET;
  return envSecret || 'dev-secret-change-me-please-32bytes!';
}

function signToken(userId, username, secret) {
  return jwt.sign(
    { sub: userId, username, iat: Math.floor(Date.now() / 1000) },
    secret,
    { algorithm: JWT_ALG, expiresIn: '7d' }
  );
}

function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret, { algorithms: [JWT_ALG] });
  } catch {
    return null;
  }
}

function createAuthMiddleware(secret) {
  return function authRequired(req, res, next) {
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const cookieToken = req.cookies?.token;
    const token = headerToken || cookieToken;

    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }

    req.user = user;
    next();
  };
}

function loginUser(username, password, secret) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return { success: false, error: 'Invalid credentials.' };

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return { success: false, error: 'Invalid credentials.' };

  const token = signToken(user.id, user.username, secret);
  return {
    success: true,
    token,
    user: { id: user.id, username: user.username },
    expiresIn: 7 * 24 * 60 * 60,
  };
}

module.exports = {
  ensureDefaultUser,
  getDefaultJwtSecret,
  signToken,
  verifyToken,
  createAuthMiddleware,
  loginUser,
};
