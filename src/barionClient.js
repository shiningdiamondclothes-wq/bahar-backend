// Barion Smart Gateway kliens
// Dokumentáció: https://docs.barion.com
//
// FONTOS: a Barion a kártyaadatokat (és az Apple Pay / Google Pay tranzakciót)
// a SAJÁT, hosztolt fizetési oldalán (GatewayUrl) kéri be — a mi szerverünk
// SOHA nem lát valódi kártyaszámot. Ez a helyes, biztonságos megközelítés.

const axios = require('axios');

function baseUrl() {
  return process.env.BARION_ENV === 'live'
    ? 'https://api.barion.com/v2'
    : 'https://api.test.barion.com/v2';
}

/**
 * Elindít egy Barion fizetést, és visszaadja a fizetési oldal URL-jét (GatewayUrl),
 * ahova a vásárlót át kell irányítani.
 */
async function startPayment({ orderId, total, items, redirectUrl, callbackUrl, payerEmail }) {
  const payload = {
    POSKey: process.env.BARION_POSKEY,
    PaymentType: 'Immediate',
    GuestCheckOut: true,
    // 'All' -> a Barion fiók beállításaitól függően kártya, Apple Pay, Google Pay is felkínálható
    FundingSources: ['All'],
    PaymentRequestId: orderId,
    PayerHint: payerEmail,
    RedirectUrl: redirectUrl,
    CallbackUrl: callbackUrl,
    Locale: 'hu-HU',
    Currency: 'HUF',
    Transactions: [
      {
        POSTransactionId: orderId,
        Payee: process.env.BARION_PAYEE_EMAIL,
        Total: total,
        Comment: `Bahar rendelés ${orderId}`,
        Items: items.map((i) => ({
          Name: i.name,
          Description: i.sku || i.name,
          Quantity: i.qty,
          Unit: 'db',
          UnitPrice: i.price,
          ItemTotal: i.price * i.qty,
        })),
      },
    ],
  };

  const { data } = await axios.post(`${baseUrl()}/Payment/Start`, payload);

  if (data.Errors && data.Errors.length) {
    throw new Error(
      'Barion hiba: ' + data.Errors.map((e) => e.Description || e.Title).join('; ')
    );
  }

  return data; // { PaymentId, GatewayUrl, Status, ... }
}

/**
 * Lekérdezi egy fizetés aktuális állapotát a Barion-tól.
 * SOHA ne a kliens (böngésző) által küldött állapotban bízz —
 * mindig ezzel a hívással ellenőrizd le szerver oldalon!
 */
async function getPaymentState(paymentId) {
  const { data } = await axios.get(`${baseUrl()}/Payment/GetPaymentState`, {
    params: { POSKey: process.env.BARION_POSKEY, PaymentId: paymentId },
  });
  return data; // { Status: 'Succeeded' | 'Canceled' | 'Expired' | 'Failed' | ..., ... }
}

module.exports = { startPayment, getPaymentState };
