require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
  })
);
// A limit megnövelve, mert a termékképek base64 kódolva, a JSON body részeként érkeznek.
app.use(express.json({ limit: '10mb' }));

app.use(routes);

app.get('/', (req, res) => {
  res.send(
    'Bahar backend fut. Végpontok: /api/products, /api/checkout, /api/barion-callback, ' +
    '/api/order-status/:orderId, /api/admin/login, /api/admin/products, /api/admin/orders'
  );
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Bahar backend fut: http://localhost:${PORT}`);
});
