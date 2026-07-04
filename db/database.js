// Adatbázis-kapcsolat és séma létrehozása.
//
// SQLite-ot használunk: egyetlen fájlban tárol mindent, nem kell külön
// adatbázis-szervert üzemeltetni — ideális egy induló webshophoz.
//
// FONTOS TELEPÍTÉSI MEGJEGYZÉS: sok felhő-tárhely (pl. Railway, Render)
// alapból "ideiglenes" (ephemeral) fájlrendszert ad — ez azt jelenti, hogy
// minden újratelepítéskor (deploy) a bahar.sqlite fájl tartalma ELVESZIK,
// hacsak nem állítasz be hozzá "persistent volume" / "disk"-et a szolgáltató
// admin felületén. A README-ben ez részletesen le van írva.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bahar.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    price INTEGER NOT NULL,
    old_price INTEGER,
    on_sale INTEGER DEFAULT 0,
    stock INTEGER DEFAULT 0,
    description TEXT,
    image TEXT,
    categories TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    buyer_address TEXT,
    items TEXT,
    subtotal INTEGER,
    shipping INTEGER,
    cod_fee INTEGER,
    total INTEGER,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    barion_payment_id TEXT,
    invoice_number TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

module.exports = db;
