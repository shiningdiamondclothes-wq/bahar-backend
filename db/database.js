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

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    product_id TEXT,
    session_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_type_product ON analytics_events(event_type, product_id);
  CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at);

  CREATE TABLE IF NOT EXISTS finance_income (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS finance_expense (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    vendor TEXT,
    item TEXT,
    payment_method TEXT,
    buyer_type TEXT,
    amount_gross INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    email TEXT NOT NULL,
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Biztonságos "migráció": a régebben létrehozott orders táblához utólag
// hozzáadjuk az ajándék-mezőket, ha még nincsenek benne. Az ALTER TABLE
// hibát dobna, ha az oszlop már létezik — ezt egyszerűen figyelmen kívül
// hagyjuk (ez a normális eset minden induláskor, az első után).
function addColumnIfMissing(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (e) {
    // az oszlop már létezik — ez rendben van
  }
}
addColumnIfMissing('orders', 'is_gift INTEGER DEFAULT 0');
addColumnIfMissing('orders', 'gift_message TEXT');
addColumnIfMissing('orders', 'gift_fee INTEGER DEFAULT 0');
addColumnIfMissing('products', 'image2 TEXT');
addColumnIfMissing('products', 'image3 TEXT');

module.exports = db;
