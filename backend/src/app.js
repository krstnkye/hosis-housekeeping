const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const housekeepingRoutes = require('./modules/housekeeping');
const errorHandler = require('./middleware/errorHandler');
const { corsOrigins } = require('./config/env');

const app = express();

// Only the HOSIS frontend may call the API from a browser (set CORS_ORIGIN).
app.use(cors({ origin: corsOrigins() }));
// 3 MB leaves room for one lost-and-found photo (2 MB) sent as base64.
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Each HOSIS subsystem is mounted as its own module (modular monolith).
app.use('/api/auth', authRoutes);
app.use('/api/housekeeping', housekeepingRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
