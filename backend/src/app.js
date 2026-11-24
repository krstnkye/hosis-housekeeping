const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const housekeepingRoutes = require('./modules/housekeeping');
const publicLostFoundRoutes = require('./modules/housekeeping/publicLostFound.routes');
const errorHandler = require('./middleware/errorHandler');
const { corsOrigins } = require('./config/env');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), payment=(), usb=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Only the HOSIS frontend may call the API from a browser (set CORS_ORIGIN).
app.use(cors({ origin: corsOrigins() }));
// 3 MB leaves room for one lost-and-found photo (2 MB) sent as base64.
app.use(express.json({ limit: '3mb' }));
// Mutation endpoints accept named fields only. Reject arrays, strings and
// other JSON roots before they can reach route-level validation.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (req.body === undefined) req.body = {};
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }
  return next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Each HOSIS subsystem is mounted as its own module (modular monolith).
app.use('/api/auth', authRoutes);
// Permanent QR lookup is intentionally public but exposes only a small,
// privacy-safe projection selected by publicLostFound.routes.js.
app.use('/api/public/lost-found', publicLostFoundRoutes);
app.use('/api/housekeeping', housekeepingRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
