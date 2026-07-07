const db = require('../db/database');

const ALLOWED_EVENTS = ['view', 'add_to_cart', 'checkout_start', 'purchase'];

/**
 * Egy esemény rögzítése (pl. valaki megnézett egy terméket, vagy kosárba tett valamit).
 * Nem dobunk hibát rossz event_type esetén — csak egyszerűen nem rögzítjük, hogy
 * egy hibás kérés miatt sose omoljon össze a szerver.
 */
function logEvent({ eventType, productId, sessionId }) {
  if (!ALLOWED_EVENTS.includes(eventType)) return;
  db.prepare(
    `INSERT INTO analytics_events (event_type, product_id, session_id) VALUES (?, ?, ?)`
  ).run(eventType, productId || null, sessionId || null);
}

/**
 * Termékenkénti összesítés: hány megtekintés / kosárba-tétel történt.
 * A products táblával összefűzve, hogy a névvel/SKU-val együtt kapjuk vissza.
 */
function productStats() {
  const rows = db.prepare(`
    SELECT
      p.id, p.name, p.sku,
      COALESCE(v.cnt, 0)  AS views,
      COALESCE(a.cnt, 0)  AS add_to_cart
    FROM products p
    LEFT JOIN (
      SELECT product_id, COUNT(*) AS cnt FROM analytics_events
      WHERE event_type = 'view' GROUP BY product_id
    ) v ON v.product_id = p.id
    LEFT JOIN (
      SELECT product_id, COUNT(*) AS cnt FROM analytics_events
      WHERE event_type = 'add_to_cart' GROUP BY product_id
    ) a ON a.product_id = p.id
    ORDER BY views DESC
  `).all();
  return rows.map(r => ({
    id: r.id, name: r.name, sku: r.sku,
    views: r.views, addToCart: r.add_to_cart,
  }));
}

/**
 * Napi bontású összesítés az utolsó N napra — egyszerű vonaldiagramhoz elég.
 */
function dailyTotals(days = 14) {
  const rows = db.prepare(`
    SELECT date(created_at) AS day, event_type, COUNT(*) AS cnt
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, event_type
    ORDER BY day ASC
  `).all(`-${days} days`);
  return rows;
}

/**
 * Összesített, egyszerű "vezérlőpult" számok.
 */
function overview() {
  const totalViews = db.prepare(`SELECT COUNT(*) AS c FROM analytics_events WHERE event_type='view'`).get().c;
  const totalAddToCart = db.prepare(`SELECT COUNT(*) AS c FROM analytics_events WHERE event_type='add_to_cart'`).get().c;
  const totalCheckoutStart = db.prepare(`SELECT COUNT(*) AS c FROM analytics_events WHERE event_type='checkout_start'`).get().c;
  return { totalViews, totalAddToCart, totalCheckoutStart };
}

/**
 * Egy termék statisztikai eseményeinek (megtekintés, kosárba-tétel) törlése —
 * pl. ha nullázni szeretnéd egy termék adatait az admin felületen.
 */
function deleteEventsForProduct(productId) {
  db.prepare(`DELETE FROM analytics_events WHERE product_id = ?`).run(productId);
}

module.exports = { logEvent, productStats, dailyTotals, overview, deleteEventsForProduct };
