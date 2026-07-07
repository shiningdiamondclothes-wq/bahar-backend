const db = require('../db/database');

function rowToOrder(row) {
  return {
    id: row.id,
    buyer: {
      name: row.buyer_name,
      email: row.buyer_email,
      phone: row.buyer_phone,
      address: row.buyer_address,
    },
    items: JSON.parse(row.items || '[]'),
    subtotal: row.subtotal,
    shipping: row.shipping,
    codFee: row.cod_fee,
    total: row.total,
    paymentMethod: row.payment_method,
    status: row.status,
    barionPaymentId: row.barion_payment_id,
    invoiceNumber: row.invoice_number,
    isGift: !!row.is_gift,
    giftMessage: row.gift_message || '',
    date: row.created_at,
  };
}

function listOrders() {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  return rows.map(rowToOrder);
}

function getOrder(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  return row ? rowToOrder(row) : null;
}

function getOrderByBarionPaymentId(paymentId) {
  const row = db.prepare('SELECT * FROM orders WHERE barion_payment_id = ?').get(paymentId);
  return row ? rowToOrder(row) : null;
}

/**
 * Új rendelés mentése. Elfogadja a jelenlegi (kliens oldali) exportformátumot
 * is (buyer{name,email,phone,address}, items, invoiceMock{...}) — így a
 * korábbi mentés-fájlok közvetlenül importálhatók.
 */
function insertOrder(o) {
  db.prepare(
    `INSERT OR IGNORE INTO orders
      (id, buyer_name, buyer_email, buyer_phone, buyer_address, items, subtotal, shipping, cod_fee, total, payment_method, status, barion_payment_id, invoice_number, is_gift, gift_message, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    o.id,
    o.buyer?.name || '',
    o.buyer?.email || '',
    o.buyer?.phone || '',
    o.buyer?.address || '',
    JSON.stringify(o.items || []),
    o.subtotal || 0,
    o.shipping || 0,
    o.codFee || 0,
    o.total || 0,
    o.paymentMethod || '',
    o.status || 'confirmed',
    o.barionPaymentId || null,
    o.invoiceNumber || o.invoiceMock?.invoiceNumber || null,
    o.isGift ? 1 : 0,
    o.giftMessage || null,
    o.date || new Date().toISOString()
  );
  return getOrder(o.id);
}

function setBarionPaymentId(orderId, paymentId) {
  db.prepare('UPDATE orders SET barion_payment_id = ? WHERE id = ?').run(paymentId, orderId);
}

function updateStatus(orderId, status) {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
}

function setInvoiceNumber(orderId, invoiceNumber) {
  db.prepare('UPDATE orders SET invoice_number = ? WHERE id = ?').run(invoiceNumber, orderId);
}

function deleteOrder(id) {
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

module.exports = {
  listOrders,
  getOrder,
  getOrderByBarionPaymentId,
  insertOrder,
  setBarionPaymentId,
  updateStatus,
  setInvoiceNumber,
  deleteOrder,
};
