const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { username, password, department? }
// When a department is given (e.g. HOUSEKEEPING), the account must belong
// to it, so other departments' staff are denied at the Housekeeping login.
router.post('/login', async (req, res) => {
  const { username, password, department } = req.body || {};
  if (!username || !password) {
    throw new HttpError(400, 'Username and password are required.');
  }

  const { rows } = await db.query(
    `SELECT user_id, first_name, last_name, username, password_hash, role, position, employment_status
       FROM users WHERE username = $1`,
    [username]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Incorrect username or password.');
  }
  if (user.employment_status !== 'ACTIVE') {
    throw new HttpError(403, 'Access denied - this account is not active.');
  }
  if (department && user.role !== department && user.role !== 'ADMIN') {
    throw new HttpError(403, 'Access denied - unauthorized account for this department.');
  }

  const payload = {
    userId: user.user_id,
    username: user.username,
    name: `${user.first_name} ${user.last_name}`,
    role: user.role,
    position: user.position,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  res.json({ token, user: payload });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
