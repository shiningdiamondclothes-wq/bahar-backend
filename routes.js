const express = require('express');
const router = express.Router();
const { startPayment, getPaymentState } = require('./src/barionClient');
const { issueInvoice } = require('./src/szamlazzClient');
const productsRepo = require('./src/productsRepo');
const ordersRepo = require('./src/ordersRepo');
const analyticsRepo = require('./src/analyticsRepo');
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
    const { buyer, items, shipping = 0, codFee = 0, paymentMethod } = req.body;
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

    // Készlet csökkentése
