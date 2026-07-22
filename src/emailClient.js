// Resend e-mail kliens
// Dokumentáció: https://resend.com/docs
//
// A Resend egy egyszerű, ingyenes (havi 3000 e-mailig) tranzakciós
// e-mail-küldő szolgáltatás. A "from" címnek egy olyan domain alá kell
// tartoznia, amit a Resend felületén hitelesítettünk (bahar.hu) — enélkül
// a küldés elutasításra kerülne.

const axios = require('axios');

const FROM_ADDRESS = process.env.RESEND_FROM || 'Bahar <hello@bahar.hu>';

/**
 * Egyetlen e-mail elküldése a Resend API-n keresztül.
 * Sose dobjon tovább hibát olyan módon, ami megakasztaná a hívó folyamatot
 * (pl. egy admin-mentést) — a hívó fél dönti el, hogyan kezeli a hibát.
 */
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY hiányzik — e-mail küldés kihagyva:', subject, '->', to);
    return { skipped: true };
  }
  const response = await axios.post(
    'https://api.resend.com/emails',
    { from: FROM_ADDRESS, to, subject, html },
    { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
  );
  return response.data;
}

/**
 * Egységes, márkázott e-mail-sablon — minden Resend-es levél ebbe a keretbe
 * kerül, hogy egységes megjelenésük legyen.
 */
function wrapEmailLayout(bodyHtml) {
  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif; background:#F5F0E6; padding:32px 16px;">
    <div style="max-width:480px; margin:0 auto; background:#0E0F0C; border-radius:4px; overflow:hidden;">
      <div style="padding:28px 32px 0 32px;">
        <div style="display:inline-block; background:#B23A28; color:#F5F0E6; width:28px; height:28px; line-height:28px; text-align:center; font-size:14px; border-radius:3px; margin-bottom:14px;">巴</div>
        <div style="color:#F5F0E6; font-size:20px; letter-spacing:0.04em; font-weight:600; margin-bottom:4px;">BAHAR <span style="color:#8CA398; font-weight:400;">· 바하르</span></div>
      </div>
      <div style="padding:8px 32px 32px 32px; color:#F5F0E6;">
        ${bodyHtml}
      </div>
      <div style="background:#0a0b09; padding:16px 32px; font-size:11px; color:#8CA398;">
        Bahar — Koreai bőrápolás és kozmetikumok · bahar.hu
      </div>
    </div>
  </div>`;
}

/**
 * Visszavárólista-értesítés: egy elfogyott termék újra raktáron van.
 * Egyesével küldjük a feliratkozóknak (nem egy közös "to" listával), hogy
 * senki más e-mail címét ne lássák a többiek.
 */
async function sendBackInStockEmail(toEmail, product) {
  const productUrl = `${process.env.FRONTEND_URL}/?termek=${encodeURIComponent(product.id)}`;
  // A backend saját, nyilvánosan elérhető képvégpontja (BASE_URL) — nem a
  // frontend (FRONTEND_URL) —, mert a beágyazott base64-et a szerver
  // csomagolja ki és szolgálja ki valódi képként.
  const productImageUrl = product.image
    ? `${process.env.BASE_URL}/api/products/${encodeURIComponent(product.id)}/image`
    : null;
  const imageHtml = productImageUrl
    ? `
    <div style="margin:0 0 20px 0; border-radius:2px; overflow:hidden; background:#161710;">
      <img src="${productImageUrl}" alt="${product.name}" width="416" style="display:block; width:100%; max-width:416px; height:auto;" />
    </div>`
    : '';
  const html = wrapEmailLayout(`
    <h1 style="font-size:18px; font-weight:400; margin:0 0 14px 0; font-family:Georgia,serif;">Újra raktáron! 🎉</h1>
    ${imageHtml}
    <p style="font-size:14px; line-height:1.7; color:#E4DFD3; margin:0 0 20px 0;">
      Jó hírünk van — a(z) <strong style="color:#F5F0E6;">${product.name}</strong> újra elérhető a raktárunkban.
      Mivel korábban jelezted, hogy szeretnél értesítést kapni róla, elsőként Te tudsz belőle rendelni,
      mielőtt megint elfogyna.
    </p>
    <a href="${productUrl}" style="display:inline-block; background:#8CA398; color:#0E0F0C; text-decoration:none; padding:12px 24px; font-size:13px; letter-spacing:0.04em; text-transform:uppercase; border-radius:2px;">
      Megnézem a terméket
    </a>
    <p style="font-size:12px; line-height:1.6; color:#8CA398; margin:24px 0 0 0;">
      Ezt az e-mailt azért kaptad, mert korábban feliratkoztál a(z) "${product.name}" visszavárólistájára a bahar.hu oldalon.
    </p>
  `);
  return sendEmail({ to: toEmail, subject: `Újra raktáron: ${product.name} — Bahar`, html });
}

/**
 * Rendelés-visszaigazoló e-mail felépítése és elküldése.
 * Meghívható közvetlenül a rendelés leadásakor (Utánvét/Átutalás esetén,
 * ahol nincs online fizetés), vagy a Barion sikeres fizetési visszahívása
 * után — mindkét helyről ugyanazt az egységes sablont használja.
 */
function fmtHuf(n) {
  return new Intl.NumberFormat('hu-HU').format(n) + ' Ft';
}

function buildOrderItemsHtml(items) {
  return (items || [])
    .map(
      (i) => `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid #2a2b26; font-size:13px; color:#F5F0E6;">${i.name}</td>
      <td style="padding:10px 0; border-bottom:1px solid #2a2b26; font-size:13px; color:#8CA398; text-align:center;">${i.qty} db</td>
      <td style="padding:10px 0; border-bottom:1px solid #2a2b26; font-size:13px; color:#F5F0E6; text-align:right;">${fmtHuf(i.price * i.qty)}</td>
    </tr>`
    )
    .join('');
}

async function sendOrderConfirmationEmail(order) {
  const itemsHtml = buildOrderItemsHtml(order.items);
  const html = wrapEmailLayout(`
    <h1 style="font-size:18px; font-weight:400; margin:0 0 6px 0; font-family:Georgia,serif;">Köszönjük a rendelésed! 🌿</h1>
    <p style="font-size:13px; color:#8CA398; margin:0 0 20px 0;">Rendelésszám: <strong style="color:#F5F0E6;">${order.id}</strong></p>

    <p style="font-size:14px; line-height:1.7; color:#E4DFD3; margin:0 0 20px 0;">
      Kedves ${order.buyer?.name || 'Vásárlónk'}! Rendelésed megérkezett hozzánk, és már dolgozunk rajta.
      Alább találod az összesítőt.
    </p>

    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
      <thead>
        <tr>
          <th style="text-align:left; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:#8CA398; padding-bottom:8px; border-bottom:1px solid #2a2b26;">Termék</th>
          <th style="text-align:center; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:#8CA398; padding-bottom:8px; border-bottom:1px solid #2a2b26;">Db</th>
          <th style="text-align:right; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:#8CA398; padding-bottom:8px; border-bottom:1px solid #2a2b26;">Összeg</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
      <tr>
        <td style="padding:4px 0; font-size:13px; color:#8CA398;">Részösszeg</td>
        <td style="padding:4px 0; font-size:13px; color:#F5F0E6; text-align:right;">${fmtHuf(order.subtotal || 0)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0; font-size:13px; color:#8CA398;">Szállítás</td>
        <td style="padding:4px 0; font-size:13px; color:#F5F0E6; text-align:right;">${fmtHuf(order.shipping || 0)}</td>
      </tr>
      ${order.codFee ? `<tr><td style="padding:4px 0; font-size:13px; color:#8CA398;">Utánvét díja</td><td style="padding:4px 0; font-size:13px; color:#F5F0E6; text-align:right;">${fmtHuf(order.codFee)}</td></tr>` : ''}
      ${order.giftFee ? `<tr><td style="padding:4px 0; font-size:13px; color:#8CA398;">Ajándék-csomagolás</td><td style="padding:4px 0; font-size:13px; color:#F5F0E6; text-align:right;">${fmtHuf(order.giftFee)}</td></tr>` : ''}
      <tr>
        <td style="padding:10px 0 0 0; font-size:15px; color:#F5F0E6; border-top:1px solid #2a2b26; font-weight:600;">Végösszeg</td>
        <td style="padding:10px 0 0 0; font-size:15px; color:#F5F0E6; text-align:right; border-top:1px solid #2a2b26; font-weight:600;">${fmtHuf(order.total || 0)}</td>
      </tr>
    </table>

    <div style="background:#161710; padding:16px 18px; border-radius:2px; margin-bottom:20px;">
      <p style="font-size:12px; color:#8CA398; margin:0 0 4px 0; text-transform:uppercase; letter-spacing:0.04em;">Szállítási cím</p>
      <p style="font-size:13px; color:#F5F0E6; margin:0 0 12px 0;">${order.buyer?.address || ''}</p>
      <p style="font-size:12px; color:#8CA398; margin:0 0 4px 0; text-transform:uppercase; letter-spacing:0.04em;">Fizetési mód</p>
      <p style="font-size:13px; color:#F5F0E6; margin:0;">${order.paymentMethod || ''}</p>
    </div>

    ${order.isGift && order.giftMessage ? `
    <div style="background:#161710; padding:16px 18px; border-radius:2px; margin-bottom:20px;">
      <p style="font-size:12px; color:#8CA398; margin:0 0 4px 0; text-transform:uppercase; letter-spacing:0.04em;">🎁 Ajándék üzenet</p>
      <p style="font-size:13px; color:#F5F0E6; margin:0; font-style:italic;">„${order.giftMessage}”</p>
    </div>` : ''}

    <p style="font-size:12px; line-height:1.6; color:#8CA398; margin:0;">
      Kérdésed van a rendeléseddel kapcsolatban? Írj nekünk a
      <a href="mailto:hello@bahar.hu" style="color:#8CA398;">hello@bahar.hu</a> címre, mi is a rendelésszámodra hivatkozva tudunk segíteni.
    </p>
  `);
  return sendEmail({ to: order.buyer.email, subject: `Rendelés visszaigazolása — ${order.id}`, html });
}

module.exports = { sendEmail, sendBackInStockEmail, sendOrderConfirmationEmail, wrapEmailLayout };
