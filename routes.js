const express = require('express');
const router = express.Router();
const { startPayment, getPaymentState } = require('./src/barionClient');
const { issueInvoice } = require('./src/szamlazzClient');
const productsRepo = require('./src/productsRepo');
const ordersRepo = require('./src/ordersRepo');
const analyticsRepo = require('./src/analyticsRepo');
const financeRepo = require('./src/financeRepo');
const stockNotifyRepo = require('./src/stockNotifyRepo');
const { verifyPassword, setPasswordHash, signToken, authMiddleware } = require('./src/auth');
const bcrypt = require('bcryptjs');

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===========================================================================
// NYILVÁNOS VÉGPONTOK (a bolt oldala hívja, bejelentkezés nélkül)
// ===========================================================================

/** A bolt termékrácsa ezt hívja meg induláskor. */
router.get('/api/products', (req, res) => {
  res.json(productsRepo.listProducts());
});

/**
 * A "Rendelés véglegesítése" gombra kattintva ezt hívja a frontend.
 * Bankkártya / Apple Pay esetén Barion fizetést indít, és visszaadja a
 * GatewayUrl-t, ahova a böngészőnek át kell irányítania a vásárlót.
 * Utánvét / átutalás esetén azonnal kiállítja a számlát.
 */
router.post('/api/checkout', async (req, res) => {
  try {
    const { buyer, items, shipping = 0, codFee = 0, giftFee = 0, paymentMethod, isGift, giftMessage } = req.body;
    if (!buyer?.email || !buyer?.name || !buyer?.address || !items?.length) {
      return res.status(400).json({ error: 'Hiányzó vagy hiányos rendelési adatok.' });
    }

    // Készlet-ellenőrzés szerver oldalon (sose bízz a kliens által küldött árban/mennyiségben!)
    for (const item of items) {
      const product = productsRepo.getProduct(item.id);
      if (!product) return res.status(400).json({ error: `Ismeretlen termék: ${item.id}` });
      if (product.stock < item.qty) {
        return res.status(400).json({ error: `"${product.name}" termékből nincs elég készleten.` });
      }
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const total = subtotal + shipping + codFee + giftFee;
    const orderId = 'BHR-' + Date.now();

    ordersRepo.insertOrder({
      id: orderId,
      buyer,
      items,
      subtotal,
      shipping,
      codFee,
      total,
      paymentMethod,
      status: 'pending',
      isGift,
      giftMessage,
      giftFee,
    });

    // Készlet csökkentése
    items.forEach((i) => productsRepo.decrementStock(i.id, i.qty));

    // Utánvét / átutalás: nincs online fizetés, a számla azonnal kiállítható
    if (paymentMethod === 'Utánvét' || paymentMethod === 'Átutalás') {
      const invoice = await issueInvoice({ id: orderId, buyer, items, paymentMethod });
      ordersRepo.updateStatus(orderId, 'confirmed');
      ordersRepo.setInvoiceNumber(orderId, invoice.invoiceNumber);
      return res.json({ orderId, requiresPayment: false, invoiceNumber: invoice.invoiceNumber });
    }

    // Bankkártya / Apple Pay -> Barion Smart Gateway hosztolt fizetési oldala
    const payment = await startPayment({
      orderId,
      total,
      items,
      redirectUrl: `${process.env.FRONTEND_URL}/fizetes-eredmenye?orderId=${orderId}`,
      callbackUrl: `${process.env.BASE_URL}/api/barion-callback`,
      payerEmail: buyer.email,
    });

    ordersRepo.setBarionPaymentId(orderId, payment.PaymentId);
    res.json({ orderId, requiresPayment: true, gatewayUrl: payment.GatewayUrl });
  } catch (err) {
    console.error('Checkout hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * A Barion HÍVJA MEG ezt automatikusan, amikor egy fizetés állapota változik.
 * Biztonsági megjegyzés: SOSE bízz a callback body-ban érkező adatokban —
 * mindig kérdezd le a valódi állapotot a GetPaymentState hívással (ahogy itt).
 */
router.post('/api/barion-callback', async (req, res) => {
  try {
    const { PaymentId } = req.body;
    if (!PaymentId) return res.status(400).end();

    const state = await getPaymentState(PaymentId);
    const order = ordersRepo.getOrderByBarionPaymentId(PaymentId);
    if (!order) return res.status(404).end();

    if (state.Status === 'Succeeded') {
      ordersRepo.updateStatus(order.id, 'paid');
      const invoice = await issueInvoice({
        id: order.id,
        buyer: order.buyer,
        items: order.items,
        paymentMethod: order.paymentMethod,
      });
      ordersRepo.setInvoiceNumber(order.id, invoice.invoiceNumber);
    } else if (['Canceled', 'Expired', 'Failed'].includes(state.Status)) {
      ordersRepo.updateStatus(order.id, 'failed');
    }

    res.status(200).end();
  } catch (err) {
    console.error('Barion callback hiba:', err.message);
    res.status(500).end();
  }
});

/** Rendelés állapotának lekérdezése (pl. a "fizetés eredménye" oldalon). */
router.get('/api/order-status/:orderId', (req, res) => {
  const order = ordersRepo.getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Nincs ilyen rendelés.' });
  res.json({ status: order.status, invoiceNumber: order.invoiceNumber || null });
});

/**
 * Egyszerű, saját statisztika-naplózás: a bolt oldala hívja meg, amikor
 * valaki megnéz egy terméket, kosárba tesz valamit, vagy elkezdi a pénztárt.
 * Szándékosan nem igényel bejelentkezést (a vásárlók névtelenül böngésznek),
 * és sose dob hibát a vásárló felé, még akkor sem, ha a naplózás elakadna.
 */
router.post('/api/track', (req, res) => {
  try {
    const { eventType, productId, sessionId } = req.body || {};
    analyticsRepo.logEvent({ eventType, productId, sessionId });
  } catch (err) {
    console.error('Statisztika naplózási hiba:', err.message);
  }
  res.status(204).end();
});

/**
 * Visszavárólista-feliratkozás: a vásárló e-mail címet ad meg egy elfogyott
 * termékhez, hogy értesítést kapjon, amint újra raktáron lesz. A tényleges
 * e-mail-küldés majd a Resend beállítása után fog élesben menni — addig az
 * admin felületen látszik, ki vár melyik termékre.
 */
router.post('/api/notify-stock', (req, res) => {
  try {
    const { productId, email } = req.body || {};
    if (!productId || !email) {
      return res.status(400).json({ error: 'Termék és e-mail cím megadása kötelező.' });
    }
    const result = stockNotifyRepo.subscribe(productId, email);
    res.json(result);
  } catch (err) {
    console.error('Visszavárólista-hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/stock-notifications', authMiddleware, (req, res) => {
  try {
    const grouped = stockNotifyRepo.listPendingGroupedByProduct();
    const result = Object.entries(grouped).map(([productId, subs]) => {
      const p = productsRepo.getProduct(productId);
      return { productId, productName: p ? p.name : productId, stock: p ? p.stock : null, subscribers: subs };
    });
    res.json(result);
  } catch (err) {
    console.error('Visszavárólista lekérési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Add meg a jelszót.' });

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Hibás jelszó.' });
  }
  res.json({ token: signToken() });
});

router.put('/api/admin/password', authMiddleware, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Az új jelszó legyen legalább 4 karakter.' });
  }
  setPasswordHash(bcrypt.hashSync(newPassword, 10));
  res.json({ success: true });
});

// ===========================================================================
// ADMIN VÉGPONTOK (mindegyik "Authorization: Bearer <token>" fejlécet igényel)
// ===========================================================================

router.get('/api/admin/products', authMiddleware, (req, res) => {
  res.json(productsRepo.listProducts());
});

router.post('/api/admin/products', authMiddleware, (req, res) => {
  const p = req.body;
  if (!p.name || !p.price) return res.status(400).json({ error: 'Hiányzó név vagy ár.' });
  const saved = productsRepo.upsertProduct({ ...p, id: p.id || uid('p') });
  res.json(saved);
});

router.put('/api/admin/products/:id', authMiddleware, (req, res) => {
  const existing = productsRepo.getProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nincs ilyen termék.' });
  const saved = productsRepo.upsertProduct({ ...existing, ...req.body, id: req.params.id });
  res.json(saved);
});

router.delete('/api/admin/products/:id', authMiddleware, (req, res) => {
  productsRepo.deleteProduct(req.params.id);
  res.json({ success: true });
});

router.get('/api/admin/orders', authMiddleware, (req, res) => {
  res.json(ordersRepo.listOrders());
});

/**
 * Statisztika összesítés az admin "Statisztika" fülhöz: termékenkénti
 * megtekintés/kosárba-tétel számok + néhány összesített szám.
 */
router.get('/api/admin/analytics', authMiddleware, (req, res) => {
  res.json({
    overview: analyticsRepo.overview(),
    products: analyticsRepo.productStats(),
    daily: analyticsRepo.dailyTotals(14),
  });
});

router.delete('/api/admin/orders/:id', authMiddleware, (req, res) => {
  ordersRepo.deleteOrder(req.params.id);
  res.json({ success: true });
});

// ===========================================================================
// PÉNZÜGY (admin-only): bevétel, kiadás, pénztárnapló
// ===========================================================================

router.get('/api/admin/finance/income', authMiddleware, (req, res) => {
  try {
    res.json({ items: financeRepo.listIncome(), summary: financeRepo.incomeSummary() });
  } catch (err) {
    console.error('Bevétel lekérési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/finance/income', authMiddleware, (req, res) => {
  try {
    const { date, source, amount, note } = req.body;
    if (!date || !source || !amount) {
      return res.status(400).json({ error: 'A dátum, a forrás és az összeg megadása kötelező.' });
    }
    res.json(financeRepo.insertIncome({ date, source, amount, note }));
  } catch (err) {
    console.error('Bevétel rögzítési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/finance/income/:id', authMiddleware, (req, res) => {
  try {
    financeRepo.deleteIncome(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Bevétel törlési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/finance/expense', authMiddleware, (req, res) => {
  try {
    res.json({ items: financeRepo.listExpense(), total: financeRepo.expenseTotal() });
  } catch (err) {
    console.error('Kiadás lekérési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/finance/expense', authMiddleware, (req, res) => {
  try {
    const { date, vendor, item, paymentMethod, buyerType, amountGross, note } = req.body;
    if (!date || !amountGross) {
      return res.status(400).json({ error: 'A dátum és a bruttó összeg megadása kötelező.' });
    }
    res.json(financeRepo.insertExpense({ date, vendor, item, paymentMethod, buyerType, amountGross, note }));
  } catch (err) {
    console.error('Kiadás rögzítési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/finance/expense/:id', authMiddleware, (req, res) => {
  try {
    financeRepo.deleteExpense(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Kiadás törlési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/admin/finance/expense/:id', authMiddleware, (req, res) => {
  try {
    const { date, vendor, item, paymentMethod, buyerType, amountGross, note } = req.body;
    if (!date || !amountGross) {
      return res.status(400).json({ error: 'A dátum és a bruttó összeg megadása kötelező.' });
    }
    res.json(financeRepo.updateExpense(req.params.id, { date, vendor, item, paymentMethod, buyerType, amountGross, note }));
  } catch (err) {
    console.error('Kiadás módosítási hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/finance/cash-journal', authMiddleware, (req, res) => {
  try {
    res.json(financeRepo.cashJournal());
  } catch (err) {
    console.error('Pénztárnapló lekérési hiba:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Egy korábbi mentés-fájl (products + orders tömbök) egyszerre való
 * betöltésére — az admin felület "Mentés visszatöltése" gombjának
 * a szerver oldali párja.
 */
router.post('/api/admin/import', authMiddleware, (req, res) => {
  const { products = [], orders = [] } = req.body;
  let productCount = 0;
  let orderCount = 0;

  products.forEach((p) => {
    productsRepo.upsertProduct({ ...p, id: p.id || uid('p') });
    productCount++;
  });

  orders.forEach((o) => {
    try {
      ordersRepo.insertOrder(o);
      orderCount++;
    } catch (e) {
      // már létező rendelés, kihagyjuk
    }
  });

  res.json({ productCount, orderCount });
});

module.exports = router;
