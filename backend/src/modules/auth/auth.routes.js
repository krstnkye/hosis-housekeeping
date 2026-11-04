const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authenticate } = require('../../middleware/auth');
const { checkLoginAllowed, recordLoginFailure, clearLoginFailures } = require('../../middleware/loginLimiter');

const router = express.Router();

// POST /api/auth/login  { username, password, department? }
// username may also be the staff member's email address.
// When a department is given (e.g. HOUSEKEEPING), the account must belong
// to it, so other departments' staff are denied at the Housekeeping login.
router.post('/login', async (req, res) => {
  const { username, password, department } = req.body || {};
  if (!username || !password) {
    throw new HttpError(400, 'Email and password are required.');
  }
  checkLoginAllowed(req);

  const { rows } = await db.query(
    `SELECT user_id, first_name, last_name, username, password_hash, role, position, employment_status
       FROM users WHERE username = $1 OR LOWER(email) = LOWER($1)`,
    [username]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordLoginFailure(req);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  clearLoginFailures(req);
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

// GET /api/auth/account: the signed-in user's own account details.
router.get('/account', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT user_id, username, email, first_name, last_name, role, position, employment_status, created_at
       FROM users WHERE user_id = $1`,
    [req.user.userId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Account not found.');
  }
  res.json({ account: rows[0] });
});

const MIN_PASSWORD = 8;

// POST /api/auth/password  { currentPassword, newPassword }
// Staff change their own password. The current password must be given, and
// wrong attempts count toward the same lockout as the login page.
router.post('/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    throw new HttpError(400, 'Current and new password are required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD || newPassword.length > 72) {
    throw new HttpError(400, `The new password must be ${MIN_PASSWORD} to 72 characters long.`);
  }
  // Same lockout key as the login page: this address plus this account.
  const attempt = { ip: req.ip, body: { username: req.user.username } };
  checkLoginAllowed(attempt);
  const { rows } = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.userId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    recordLoginFailure(attempt);
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  clearLoginFailures(attempt);
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    throw new HttpError(400, 'The new password must be different from the current one.');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, req.user.userId]);
  res.json({ ok: true });
});

module.exports = router;
