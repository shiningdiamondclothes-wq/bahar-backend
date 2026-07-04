# Bahar Backend

Ez a szerver egy **valódi adatbázissal** tárolja a termékeket, a készletet és a
rendeléseket (nem a böngészőben, mint a demó verzió), és összeköti a boltot a
**Barion** fizetési szolgáltatóval (bankkártya + Apple Pay) és a
**számlázz.hu**-val (elektronikus számla).

A böngészőben futó bolt (`bahar-webshop.html`) soha nem látja és nem kezeli
közvetlenül az API-kulcsokat vagy az adatbázist — minden érzékeny művelet
ezen a szerveren, biztonságosan történik.

---

## 1. Előfeltételek

- [Node.js](https://nodejs.org) 18 vagy újabb (a `node --version` paranccsal ellenőrizheted)
- Egy **Barion fiók** — teszteléshez: https://test.barion.com, éleshez: https://www.barion.com
- Egy **számlázz.hu fiók** — https://www.szamlazz.hu

## 2. Telepítés

```bash
cd bahar-backend
npm install
cp .env.example .env
```

Ez telepíti az adatbázis-kezelőt (`better-sqlite3`), a jelszó-titkosítást
(`bcryptjs`) és a bejelentkezési tokeneket (`jsonwebtoken`) is.

## 3. Admin jelszó beállítása

A jelszót **soha ne nyersen** írd a `.env`-be — generálj belőle egy titkosított
(hash-elt) változatot:

```bash
npm run hash-password SajatUjJelszavam
```

Ez kiír egy sort, amit másolj be a `.env` fájlba:

```
ADMIN_PASSWORD_HASH=$2a$10$....................................
```

Adj meg egy `JWT_SECRET`-et is (egy hosszú, véletlenszerű szöveg) — ezzel írja
alá a szerver a bejelentkezési tokeneket:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Ezt is másold a `.env`-be a `JWT_SECRET=` sorba.

## 4. A többi `.env` mező kitöltése

- `BARION_POSKEY`, `BARION_PAYEE_EMAIL` — Barion admin felület → Bolt beállítások
- `SZAMLAZZ_AGENT_KEY` — számlázz.hu → Beállítások → Számla Agent adatok

**Fontos:** amíg tesztelsz, hagyd `BARION_ENV=test`-en, és a **teszt** Barion
fiókod POSKey-jét használd.

## 5. A korábbi mentésed betöltése az adatbázisba

Ha már van egy exportált `.json` mentésed a demó boltból (Admin → Áttekintés
→ "Mentés letöltése"), egyetlen paranccsal betöltheted az új adatbázisba:

```bash
npm run import-backup utvonal/a/bahar-mentes-2026-07-04.json
```

Ez importálja az összes terméket (a feltöltött képekkel együtt) és a
rendeléseket. Ha nincs még mentésed, a lépés kihagyható — a bolt üres
termékkatalógussal indul, amit az admin felületről tölthetsz fel.

## 6. Indítás

```bash
npm start
```

A szerver ekkor elérhető: `http://localhost:4242`

Fejlesztés közben (automatikus újraindítás mentéskor):

```bash
npm run dev
```

Első induláskor létrejön a `db/bahar.sqlite` adatbázis-fájl — ez tartalmaz
mindent (termékek, rendelések, admin jelszó).

## 7. Végpontok

### Nyilvános (bejelentkezés nélkül hívhatók)

| Végpont | Metódus | Mit csinál |
|---|---|---|
| `/api/products` | GET | A bolt teljes termékkatalógusa |
| `/api/checkout` | POST | Rendelés leadása (fizetés indítása vagy azonnali számla) |
| `/api/barion-callback` | POST | A Barion hívja meg automatikusan fizetés-állapot változáskor |
| `/api/order-status/:orderId` | GET | Egy rendelés állapota és számlaszáma |
| `/api/admin/login` | POST | `{ password }` → sikeres belépés esetén `{ token }` |

### Admin (mindegyikhez `Authorization: Bearer <token>` fejléc kell)

| Végpont | Metódus | Mit csinál |
|---|---|---|
| `/api/admin/products` | GET | Termékek listája (admin nézet) |
| `/api/admin/products` | POST | Új termék létrehozása |
| `/api/admin/products/:id` | PUT | Meglévő termék módosítása (név, ár, készlet, kép, kategóriák, stb.) |
| `/api/admin/products/:id` | DELETE | Termék törlése |
| `/api/admin/orders` | GET | Rendelések listája |
| `/api/admin/password` | PUT | `{ newPassword }` → admin jelszó módosítása |

A tokent a `/api/admin/login` adja vissza, 12 óráig érvényes, utána újra be
kell jelentkezni.

## 8. A jelenlegi bolt-HTML összekötése ezzel a szerverrel

A `bahar-webshop.html` fájl jelenleg a böngésző saját tárolójából (`window.storage`)
tölti be és menti a termékeket. Ezt kell lecserélni, hogy ezt a szervert hívja:

**Termékek betöltése** (a `loadData()` függvényben, a `window.storage.get` hívás helyett):
```js
const response = await fetch('http://localhost:4242/api/products');
PRODUCTS = await response.json();
```

**Admin bejelentkezés** (a `tryLogin()` függvényben):
```js
const response = await fetch('http://localhost:4242/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: val })
});
if (response.ok) {
  const { token } = await response.json();
  localStorage.setItem('bahar_admin_token', token); // csak admin-eszközön, nem a vásárlói oldalon
  // ... admin felület megnyitása
} else {
  showToast('Hibás jelszó.');
}
```

**Admin műveletek** (pl. termék mentése) — mindegyikhez add hozzá a tokent:
```js
const token = localStorage.getItem('bahar_admin_token');
await fetch('http://localhost:4242/api/admin/products/' + productId, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify(updatedProduct)
});
```

**Rendelés leadása** — lásd a korábbi verzió README-jét, ez változatlan
(`/api/checkout` hívása, majd `requiresPayment` alapján átirányítás vagy
visszaigazolás).

Élesítéskor minden `http://localhost:4242` URL-t cserélj le a szerver éles
címére.

## 9. Élesítés (deploy)

- [Railway](https://railway.app) — git push-ra automatikusan telepít
- [Render](https://render.com) — hasonlóan egyszerű

**KRITIKUS FONTOSSÁGÚ MEGJEGYZÉS AZ ADATBÁZISRÓL:** ezek a szolgáltatók
alapból **ideiglenes (ephemeral) fájlrendszert** adnak — minden újratelepítés
(deploy) törli a `db/bahar.sqlite` fájlt, vagyis a termékeid, rendeléseid
elveszhetnek! Ennek elkerülésére:

- **Railway:** adj hozzá egy "Volume"-ot a szolgáltatáshoz, és a `DB_PATH`
  környezeti változót állítsd a volume elérési útjára (pl. `/data/bahar.sqlite`).
- **Render:** hasonlóan, "Persistent Disk" hozzáadása szükséges.
- Alternatívaként, ha a projekt növekszik, érdemes lehet később egy hosztolt
  PostgreSQL adatbázisra váltani (pl. Railway/Render/Supabase saját Postgres
  szolgáltatása) — ez a `productsRepo.js` / `ordersRepo.js` fájlok átírásával
  jár, de a `routes.js` többi része változatlan maradhat.

Lépések:
1. Töltsd fel ezt a kódot egy git repóba (a `.env` és a `db/bahar.sqlite`
   fájlokat **NE** — ezt jelzi a `.gitignore` is).
2. A választott szolgáltatónál add meg környezeti változóként ugyanazokat az
   értékeket, amik a `.env`-ben vannak.
3. Állítsd be a perzisztens tárolást (lásd fent).
4. A `BASE_URL`-t és `FRONTEND_URL`-t állítsd az éles domainekre.
5. A Barion admin felületén állítsd be a callback URL-t:
   `https://a-te-szervered-cime.hu/api/barion-callback`

## 10. Biztonsági megjegyzések

- **Soha** ne kerüljön a `.env` fájl, az adatbázis-fájl vagy bármelyik
  API-kulcs a frontend kódba, git repóba, vagy nyilvánosan elérhető helyre.
- A jelszó mindig hash-elve (bcrypt) van tárolva, soha nem nyersen.
- A Barion callback-nél mindig a `GetPaymentState` hívással ellenőrizzük az
  állapotot — sose bízzunk vakon a bejövő adatban (ez a kódban már így van).
- Éles környezetben mindenképp HTTPS-en fusson a szerver (Railway/Render ezt
  alapból biztosítja).
- A szerver oldalon mindig újra ellenőrizzük a készletet és az árakat
  (`/api/checkout`-ban) — sose bízzunk a böngészőből érkező adatban.

## 11. Fontos figyelmeztetés az API-sémákról

A számlázz.hu XML mezőnevei (`src/szamlazzClient.js`) és a Barion JSON mezői
(`src/barionClient.js`) a szolgáltatók publikus dokumentációja alapján
készültek, de ezek időnként változnak. **Élesítés előtt mindenképp teszteld
végig teszt-kulcsokkal**, és vesd össze az aktuális hivatalos
dokumentációval:

- Barion: https://docs.barion.com
- Számlázz.hu Számla Agent: https://tudastar.szamlazz.hu/szamla-agent-technikai-dokumentacio

Ezt a kódot nem tudtam ebben a környezetben ténylegesen futtatva tesztelni
(nincs hálózati hozzáférés az `npm install`-hoz), ezért telepítés után
mindenképp próbáld végig helyben, mielőtt élesre kapcsolod.
