const db = require('../db/database');

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: row.price,
    oldPrice: row.old_price,
    onSale: !!row.on_sale,
    stock: row.stock,
    description: row.description || '',
    image: row.image || null,
    categories: row.categories ? JSON.parse(row.categories) : [],
  };
}

function listProducts() {
  const rows = db.prepare('SELECT * FROM products ORDER BY rowid ASC').all();
  return rows.map(rowToProduct);
}

function getProduct(id) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return row ? rowToProduct(row) : null;
}

/**
 * Létrehoz VAGY frissít egy terméket (ha az id már létezik, frissít).
 */
function upsertProduct(p) {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(p.id);
  if (existing) {
    db.prepare(
      `UPDATE products
       SET name=?, sku=?, price=?, old_price=?, on_sale=?, stock=?, description=?, image=?, categories=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      p.name,
      p.sku,
      p.price,
      p.oldPrice || null,
      p.onSale ? 1 : 0,
      p.stock,
      p.description || '',
      p.image || null,
      JSON.stringify(p.categories || []),
      p.id
    );
  } else {
    db.prepare(
      `INSERT INTO products (id, name, sku, price, old_price, on_sale, stock, description, image, categories)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      p.id,
      p.name,
      p.sku,
      p.price,
      p.oldPrice || null,
      p.onSale ? 1 : 0,
      p.stock,
      p.description || '',
      p.image || null,
      JSON.stringify(p.categories || [])
    );
  }
  return getProduct(p.id);
}

function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

function decrementStock(id, qty) {
  db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(qty, id);
}

module.exports = { listProducts, getProduct, upsertProduct, deleteProduct, decrementStock };
