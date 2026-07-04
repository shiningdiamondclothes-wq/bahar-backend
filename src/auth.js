const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

function getPasswordHash() {
  const row = db.prepare("SELECT value FROM admin_settings WHERE key='admin_password_hash'").get();
  if (row) return row.value;

  const initialHash = process.env.ADMIN_PASSWORD_HASH;
  if (initialHash) {
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(initialHash);
    return initialHash;
  }

  const plainPassword = process.env.ADMIN_PASSWORD;
  if (plainPassword) {
    const hash = bcrypt.hashSync(plainPassword, 10);
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(hash);
    return hash;
  }

  return null;
}

function verifyPassword(password) {
  const hash = getPasswordHash();
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

function setPasswordHash(newHash) {
  const existing = db.prepare("SELECT key FROM admin_settings WHERE key='admin_password_hash'").get();
  if (existing) {
    db.prepare("UPDATE admin_settings SET value=? WHERE key='admin_password_hash'").run(newHash);
  } else {
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(newHash);
  }
}

function signToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Hiányzó bejelentkezés.' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Érvénytelen vagy lejárt munkamenet, kérlek jelentkezz be újra.' });
  }
}

module.exports = { verifyPassword, setPasswordHash, signToken, authMiddleware, getPasswordHash };
