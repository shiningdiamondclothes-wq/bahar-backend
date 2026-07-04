const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

/**
 * Az admin jelszó (hash-elt formában) az adatbázisban van, hogy az admin
 * felületről is módosítható legyen. Első induláskor a .env-ben megadott
 * ADMIN_PASSWORD_HASH-t vesszük át kiindulásnak.
 */
function getPasswordHash() {
  const row = db.prepare("SELECT value FROM admin_settings WHERE key='admin_password_hash'").get();
  if (row) return row.value;

  const initialHash = process.env.ADMIN_PASSWORD_HASH;
  if (initialHash) {
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").run(initialHash);
    return initialHash;
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

/**
 * Express middleware — a védett admin végpontok elé kell tenni.
 * A frontendnek "Authorization: Bearer <token>" fejlécet kell küldenie,
 * amit a /api/admin/login végpont ad vissza sikeres belépéskor.
 */
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
