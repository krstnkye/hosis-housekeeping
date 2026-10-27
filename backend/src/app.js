const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const housekeepingRoutes = require('./modules/housekeeping');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Each HOSIS subsystem is mounted as its own module (modular monolith).
app.use('/api/auth', authRoutes);
app.use('/api/housekeeping', housekeepingRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
