// Használat:
//   node scripts/hash-password.js SajatUjJelszavam
//
// A kimenetet másold be a .env fájlba az ADMIN_PASSWORD_HASH sorba.
// Ezt a jelszót a SAJÁT jelszavad helyettesíti — soha ne a nyers jelszót
// írd a .env-be, mindig a hash-elt (titkosított) változatot.

const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.log('Használat: node scripts/hash-password.js SajatUjJelszavam');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nMásold ezt a sort a .env fájlodba:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
