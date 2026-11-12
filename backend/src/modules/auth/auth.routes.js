const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authenticate, passwordVersion } = require('../../middleware/auth');
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
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 72) {
    throw new HttpError(401, 'Incorrect email or password.');
  }
  await checkLoginAllowed(req);

  const { rows } = await db.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.username, u.password_hash, u.role, u.position,
            u.employment_status, (m.user_id IS NOT NULL) AS must_change_password
       FROM users u LEFT JOIN hk_password_must_change m ON m.user_id = u.user_id
      WHERE u.username = $1 OR LOWER(u.email) = LOWER($1)`,
    [username]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await recordLoginFailure(req);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  await clearLoginFailures(req);
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
    pwv: passwordVersion(user.password_hash),
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const { pwv, ...publicUser } = payload;
  res.json({ token, user: { ...publicUser, mustChangePassword: user.must_change_password } });
});

// POST /api/auth/forgot-password  { username }
// "Forgot password?" on the login page. There is no hotel email server, so the
// request goes to the Housekeeping supervisor, who sets a temporary password.
// The answer is the same whether or not the account exists.
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== 'string' || username.length > 100) {
    throw new HttpError(400, 'Enter your email or username.');
  }
  await checkLoginAllowed(req);
  const { rows } = await db.query(
    `SELECT user_id FROM users
      WHERE (username = $1 OR LOWER(email) = LOWER($1)) AND role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'`,
    [username]
  );
  if (rows[0]) {
    await db.query(
      `INSERT INTO hk_password_resets (user_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM hk_password_resets WHERE user_id = $1 AND status = 'REQUESTED')`,
      [rows[0].user_id]
    );
  } else {
    // Unknown names count like a wrong password, so this cannot be used to
    // test many names quickly.
    await recordLoginFailure(req);
  }
  res.json({
    ok: true,
    message: 'If the account exists, your supervisor has been asked to reset your password. They will give you a temporary password.',
  });
});

router.get('/me', authenticate, (req, res) => {
  const { pwv, iat, exp, ...user } = req.user;
  res.json({ user });
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
  await checkLoginAllowed(attempt);
  const { rows } = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.userId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    await recordLoginFailure(attempt);
    throw new HttpError(400, 'Your current password is incorrect.');
  }
  await clearLoginFailures(attempt);
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    throw new HttpError(400, 'The new password must be different from the current one.');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, req.user.userId]);
    await client.query('DELETE FROM hk_password_must_change WHERE user_id = $1', [req.user.userId]);
  });
  // Older tokens stop working with the old password, so hand back a new one.
  const { iat, exp, pwv, mustChangePassword, ...claims } = req.user;
  const token = jwt.sign({ ...claims, pwv: passwordVersion(hash) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  res.json({ ok: true, token, user: { ...claims, mustChangePassword: false } });
});

module.exports = router;
