// Használat:
//   node scripts/import-backup.js utvonal/a/bahar-mentes-XXXX.json
//
// Betölti a korábbi (böngészőből exportált) mentésedet az adatbázisba —
// így nem a nulláról kell felépítened a termékkatalógust és a rendeléseket.

const fs = require('fs');
const path = require('path');
const { upsertProduct } = require('../src/productsRepo');
const { insertOrder } = require('../src/ordersRepo');

const filePath = process.argv[2];
if (!filePath) {
  console.log('Használat: node scripts/import-backup.js utvonal/a/bahar-mentes-XXXX.json');
  process.exit(1);
}

const fullPath = path.resolve(filePath);
if (!fs.existsSync(fullPath)) {
  console.error(`Nem található a fájl: ${fullPath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

let productCount = 0;
(data.products || []).forEach((p) => {
  upsertProduct(p);
  productCount++;
});
console.log(`✔ ${productCount} termék importálva.`);

let orderCount = 0;
(data.orders || []).forEach((o) => {
  try {
    insertOrder(o);
    orderCount++;
  } catch (e) {
    console.warn(`⚠ Rendelés kihagyva (${o.id}): ${e.message}`);
  }
});
console.log(`✔ ${orderCount} rendelés importálva.`);
console.log('\nKész! Indítsd el a szervert: npm start');
