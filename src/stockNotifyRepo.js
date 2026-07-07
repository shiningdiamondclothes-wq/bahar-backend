const db = require('../db/database');

/** Feliratkozás egy elfogyott termék visszavárólistájára. */
function subscribe(productId, email) {
  // Ha ugyanaz az e-mail már feliratkozott erre a termékre és még nem
  // kapott értesítést, nem duplikáljuk a sort.
  const existing = db.prepare(
    `SELECT id FROM stock_notifications WHERE product_id = ? AND email = ? AND notified = 0`
  ).get(productId, email);
  if (existing) return { alreadySubscribed: true };

  db.prepare(
    `INSERT INTO stock_notifications (product_id, email) VALUES (?, ?)`
  ).run(productId, email);
  return { alreadySubscribed: false };
}

/** Admin-nézet: minden termékre, hány fő és mely e-mail címek várnak még értesítésre. */
function listPendingGroupedByProduct() {
  const rows = db.prepare(
    `SELECT product_id, email, created_at FROM stock_notifications WHERE notified = 0 ORDER BY product_id, created_at`
  ).all();
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.product_id]) grouped[r.product_id] = [];
    grouped[r.product_id].push({ email: r.email, date: r.created_at });
  });
  return grouped;
}

/** Az összes még nem értesített feliratkozó egy adott termékre. */
function listPendingForProduct(productId) {
  return db.prepare(
    `SELECT id, email FROM stock_notifications WHERE product_id = ? AND notified = 0`
  ).all(productId);
}

/** Feliratkozók megjelölése "értesítve" státusszal (miután kiment az e-mail). */
function markNotified(ids) {
  if (!ids || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE stock_notifications SET notified = 1 WHERE id IN (${placeholders})`).run(...ids);
}

module.exports = { subscribe, listPendingGroupedByProduct, listPendingForProduct, markNotified };
