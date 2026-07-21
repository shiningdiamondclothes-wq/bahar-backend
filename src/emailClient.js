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
  const html = wrapEmailLayout(`
    <h1 style="font-size:18px; font-weight:400; margin:0 0 14px 0; font-family:Georgia,serif;">Újra raktáron! 🎉</h1>
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
 
module.exports = { sendEmail, sendBackInStockEmail, wrapEmailLayout };
 
