const express = require('express');
const router = express.Router();
const { startPayment, getPaymentState } = require('./src/barionClient');
const { issueInvoice } = require('./src/szamlazzClient');
const productsRepo = require('./src/productsRepo');
const ordersRepo = require('./src/ordersRepo');
const { verifyPassword, setPasswordHash, signToken, authMiddleware } = require('./src/auth');
const bcrypt = require('bcryptjs');

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

router.get('/api/products', (req, res) => {
  res.json(productsRepo.listProducts());
});

router.post('/api/checkout', async (req, res) => {
  try {
    const { buyer, items, shipping = 0, codFee = 0, paymentMethod } = req.body;
    if (!buyer?.email || !buyer?.name || !buyer?.address || !items?.length) {
      return res.status(400).json({ error: 'Hiányzó vagy hiányos rendelési adatok.' });
    }

    for (const item of items) {
      const product = productsRepo.getProduct(item.id);
      if (!product) return res.status(400).json({ error: `Ismeretlen termék: ${item.id}` });
      if (product.stock < item.qty) {
        return res.status(400).json({ error: `"${product.name}" termékből nincs elég készleten.` });
      }
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const total = subtotal + shipping + codFee;
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
    });

    items.forEach((i) => productsRepo.decrementStock(i.id, i.qty));

    if (paymentMethod === 'Utánvét' || paymentMethod === 'Átutalás') {
      const invoice = await issueInvoice({ id: orderId, buyer, items, paymentMethod });
      ordersRepo.updateStatus(orderId, 'confirmed');
      ordersRepo.setInvoiceNumber(orderId, invoice.invoiceNumber);
      return res.json({ orderId, requiresPayment: false, invoiceNumber: invoice.invoiceNumber });
    }

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

router.get('/api/order-status/:orderId', (req, res) => {
  const order = ordersRepo.getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Nincs ilyen rendelés.' });
  res.json({ status: order.status, invoiceNumber: order.invoiceNumber || null });
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

router.delete('/api/admin/orders/:id', authMiddleware, (req, res) => {
  ordersRepo.deleteOrder(req.params.id);
  res.json({ success: true });
});

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
