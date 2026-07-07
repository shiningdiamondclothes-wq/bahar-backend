const db = require('../db/database');

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===========================================================================
// BEVÉTEL (income)
// ===========================================================================

function listIncome() {
  return db.prepare(`SELECT * FROM finance_income ORDER BY date DESC, created_at DESC`).all();
}

function insertIncome({ date, source, amount, note }) {
  const id = uid('inc');
  db.prepare(
    `INSERT INTO finance_income (id, date, source, amount, note) VALUES (?, ?, ?, ?, ?)`
  ).run(id, date, source, amount, note || null);
  return db.prepare(`SELECT * FROM finance_income WHERE id = ?`).get(id);
}

function deleteIncome(id) {
  db.prepare(`DELETE FROM finance_income WHERE id = ?`).run(id);
}

// ===========================================================================
// KIADÁS (expense)
// ===========================================================================

function listExpense() {
  return db.prepare(`SELECT * FROM finance_expense ORDER BY date DESC, created_at DESC`).all();
}

function insertExpense({ date, vendor, item, paymentMethod, buyerType, amountGross, note }) {
  const id = uid('exp');
  db.prepare(
    `INSERT INTO finance_expense (id, date, vendor, item, payment_method, buyer_type, amount_gross, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, date, vendor || null, item || null, paymentMethod || null, buyerType || null, amountGross, note || null);
  return db.prepare(`SELECT * FROM finance_expense WHERE id = ?`).get(id);
}

function deleteExpense(id) {
  db.prepare(`DELETE FROM finance_expense WHERE id = ?`).run(id);
}

// ===========================================================================
// ÖSSZESÍTÉS forrás szerint (készpénz / barion / átutalás)
// ===========================================================================

function incomeSummary() {
  const rows = db.prepare(
    `SELECT source, SUM(amount) AS total FROM finance_income GROUP BY source`
  ).all();
  const summary = { keszpenz: 0, barion: 0, atutalas: 0 };
  rows.forEach(r => { summary[r.source] = r.total; });
  summary.total = summary.keszpenz + summary.barion + summary.atutalas;
  return summary;
}

function expenseTotal() {
  // A magánszemélyként vásárolt tételek NEM számítanak bele a hivatalos
  // kiadás-összesítőbe (nincs hozzájuk cégre szóló számla), csak a cégként
  // vásároltak — a magánszemélyes tételek a listában továbbra is látszanak.
  const row = db.prepare(
    `SELECT SUM(amount_gross) AS total FROM finance_expense WHERE buyer_type != 'maganszemely' OR buyer_type IS NULL`
  ).get();
  return row.total || 0;
}

// ===========================================================================
// PÉNZTÁRNAPLÓ — csak a KÉSZPÉNZES tételek, időrendben, göngyölített egyenleggel
// ===========================================================================

function cashJournal() {
  const cashIncome = db.prepare(
    `SELECT id, date, amount, note, created_at FROM finance_income WHERE source = 'keszpenz'`
  ).all().map(r => ({ ...r, type: 'bevetel', label: r.note || 'Készpénzes bevétel' }));

  const cashExpense = db.prepare(
    `SELECT id, date, amount_gross AS amount, item, vendor, note, created_at FROM finance_expense
     WHERE payment_method = 'keszpenz' AND (buyer_type != 'maganszemely' OR buyer_type IS NULL)`
  ).all().map(r => ({ ...r, type: 'kiadas', label: r.item ? `${r.item}${r.vendor ? ' (' + r.vendor + ')' : ''}` : (r.note || 'Készpénzes kiadás') }));

  const all = [...cashIncome, ...cashExpense].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  let balance = 0;
  const withBalance = all.map(row => {
    balance += row.type === 'bevetel' ? row.amount : -row.amount;
    return { ...row, balance };
  });

  return { entries: withBalance, closingBalance: balance };
}

module.exports = {
  listIncome, insertIncome, deleteIncome,
  listExpense, insertExpense, deleteExpense,
  incomeSummary, expenseTotal, cashJournal,
};
