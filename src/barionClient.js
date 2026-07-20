// Barion Smart Gateway kliens
// DokumentĂĄciĂł: https://docs.barion.com
//
// FONTOS: a Barion a kĂĄrtyaadatokat (ĂŠs az Apple Pay / Google Pay tranzakciĂłt)
// a SAJĂT, hosztolt fizetĂŠsi oldalĂĄn (GatewayUrl) kĂŠri be â a mi szerverĂźnk
// SOHA nem lĂĄt valĂłdi kĂĄrtyaszĂĄmot. Ez a helyes, biztonsĂĄgos megkĂśzelĂ­tĂŠs.

const axios = require('axios');

function baseUrl() {
  return process.env.BARION_ENV === 'live'
    ? 'https://api.barion.com/v2'
    : 'https://api.test.barion.com/v2';
}

/**
 * Kinyeri a Barion vĂĄlaszĂĄbĂłl a tĂŠnyleges hibaĂźzenetet, hogy a naplĂłban
 * (Railway logs) ĂŠs a hibaĂźzenetben is lĂĄtszĂłdjon, PONTOSAN miĂŠrt utasĂ­totta
 * el a Barion a kĂŠrĂŠst (pl. ĂŠrvĂŠnytelen POSKey, nem engedĂŠlyezett funkciĂł,
 * inaktĂ­v fiĂłk stb.) â nem csak azt, hogy "400-as hibakĂłd".
 */
function extractBarionErrorMessage(err) {
  const data = err.response?.data;
  if (data?.Errors && data.Errors.length) {
    return data.Errors.map((e) => `${e.ErrorCode || ''}: ${e.Description || e.Title || ''}`).join('; ');
  }
  if (data) {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }
  return err.message;
}

/**
 * ElindĂ­t egy Barion fizetĂŠst, ĂŠs visszaadja a fizetĂŠsi oldal URL-jĂŠt (GatewayUrl),
 * ahova a vĂĄsĂĄrlĂłt ĂĄt kell irĂĄnyĂ­tani.
 */
async function startPayment({ orderId, total, items, redirectUrl, callbackUrl, payerEmail }) {
  const payload = {
    POSKey: process.env.BARION_POSKEY,
    PaymentType: 'Immediate',
    GuestCheckOut: true,
    // 'All' -> a Barion fiĂłk beĂĄllĂ­tĂĄsaitĂłl fĂźggĹen kĂĄrtya, Apple Pay, Google Pay is felkĂ­nĂĄlhatĂł
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
        Comment: `Bahar rendelĂŠs ${orderId}`,
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

  let data;
  try {
    const response = await axios.post(`${baseUrl()}/Payment/Start`, payload);
    data = response.data;
  } catch (err) {
    // Ide fut be, ha a Barion HTTP 400/401/stb.-et ad vissza â ilyenkor a
    // vĂĄlasz tĂśrzsĂŠben (err.response.data) van a valĂłdi indoklĂĄs.
    const detail = extractBarionErrorMessage(err);
    console.error('Barion Payment/Start hĂ­vĂĄs elutasĂ­tva:', detail);
    throw new Error(`Barion elutasĂ­totta a fizetĂŠs indĂ­tĂĄsĂĄt: ${detail}`);
  }

  if (data.Errors && data.Errors.length) {
    const detail = data.Errors.map((e) => `${e.ErrorCode || ''}: ${e.Description || e.Title || ''}`).join('; ');
    console.error('Barion Payment/Start hiba (2xx vĂĄlaszban):', detail);
    throw new Error('Barion hiba: ' + detail);
  }

  return data; // { PaymentId, GatewayUrl, Status, ... }
}

/**
 * LekĂŠrdezi egy fizetĂŠs aktuĂĄlis ĂĄllapotĂĄt a Barion-tĂłl.
 * SOHA ne a kliens (bĂśngĂŠszĹ) ĂĄltal kĂźldĂśtt ĂĄllapotban bĂ­zz â
 * mindig ezzel a hĂ­vĂĄssal ellenĹrizd le szerver oldalon!
 */
async function getPaymentState(paymentId) {
  const { data } = await axios.get(`${baseUrl()}/Payment/GetPaymentState`, {
    params: { POSKey: process.env.BARION_POSKEY, PaymentId: paymentId },
  });
  return data; // { Status: 'Succeeded' | 'Canceled' | 'Expired' | 'Failed' | ..., ... }
}

module.exports = { startPayment, getPaymentState };
