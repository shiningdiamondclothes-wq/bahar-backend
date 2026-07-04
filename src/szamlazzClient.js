// Számlázz.hu "Számla Agent" XML API kliens
// Dokumentáció / XSD-k: https://tudastar.szamlazz.hu/szamla-agent-technikai-dokumentacio
//
// FONTOS: az itt látható XML mezőnevek a számlázz.hu publikus dokumentációja
// alapján készültek, de API-k időnként változnak — élesítés előtt mindenképp
// vesd össze a hivatalos, aktuális XSD-vel, és teszteld a számlázz.hu teszt
// Agent kulcsával (Beállítások > Számla Agent > "teszt üzemmód").

const axios = require('axios');
const FormData = require('form-data');

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildInvoiceXml(order) {
  const today = new Date().toISOString().slice(0, 10);

  const items = order.items
    .map((i) => {
      const bruttoOsszesen = i.price * i.qty;
      const netto = bruttoOsszesen / 1.27; // 27% ÁFA-val visszaszámolva
      const afa = bruttoOsszesen - netto;
      return `
      <tetel>
        <megnevezes>${esc(i.name)}</megnevezes>
        <mennyiseg>${i.qty}</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>${(netto / i.qty).toFixed(2)}</nettoEgysegar>
        <afakulcs>27</afakulcs>
        <netto>${netto.toFixed(2)}</netto>
        <afa>${afa.toFixed(2)}</afa>
        <brutto>${bruttoOsszesen.toFixed(2)}</brutto>
      </tetel>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla http://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${esc(process.env.SZAMLAZZ_AGENT_KEY)}</szamlaagentkulcs>
    <eszamla>true</eszamla>
    <szamlaLetoltes>true</szamlaLetoltes>
    <valaszVerzio>2</valaszVerzio>
  </beallitasok>
  <fejlec>
    <keltDatum>${today}</keltDatum>
    <teljesitesDatum>${today}</teljesitesDatum>
    <fizetesiHataridoDatum>${today}</fizetesiHataridoDatum>
    <fizmod>${esc(order.paymentMethod || 'Bankkártya')}</fizmod>
    <penznem>HUF</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
    <megjegyzes>Bahar rendelés — ${esc(order.id)}</megjegyzes>
    <fajtaKod>SZ</fajtaKod>
  </fejlec>
  <vevo>
    <nev>${esc(order.buyer.name)}</nev>
    <cim>${esc(order.buyer.address)}</cim>
    <email>${esc(order.buyer.email)}</email>
  </vevo>
  <tetelek>${items}
  </tetelek>
</xmlszamla>`;
}

/**
 * Kiállít egy elektronikus számlát a számlázz.hu-n keresztül, és visszaadja
 * a számlaszámot + a PDF bájtjait.
 */
async function issueInvoice(order) {
  const xml = buildInvoiceXml(order);

  const form = new FormData();
  form.append('action-xmlagentxmlfile', Buffer.from(xml, 'utf-8'), {
    filename: 'szamla.xml',
    contentType: 'text/xml',
  });

  const response = await axios.post('https://www.szamlazz.hu/szamla/', form, {
    headers: form.getHeaders(),
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });

  const headers = response.headers;
  const errorCode = headers['szlahu_error_code'];
  if (errorCode) {
    const errorMsg = headers['szlahu_error'] || 'Ismeretlen hiba a számlázz.hu válaszában.';
    throw new Error(`Számlázz.hu hiba (${errorCode}): ${decodeURIComponent(errorMsg)}`);
  }

  return {
    invoiceNumber: headers['szlahu_szamlaszam'],
    netTotal: headers['szlahu_nettovegosszeg'],
    grossTotal: headers['szlahu_bruttovegosszeg'],
    pdfBuffer: Buffer.from(response.data),
  };
}

module.exports = { issueInvoice, buildInvoiceXml };
