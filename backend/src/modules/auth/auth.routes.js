const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authenticate, passwordVersion } = require('../../middleware/auth');
const { checkLoginAllowed, recordLoginFailure, clearLoginFailures } = require('../../middleware/loginLimiter');

const router = express.Router();
const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

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
    `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.role, u.position,
            u.employment_status, u.created_at,
            EXISTS (SELECT 1 FROM hk_staff_profile_photos p WHERE p.user_id = u.user_id) AS has_profile_photo
       FROM users u WHERE u.user_id = $1`,
    [req.user.userId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Account not found.');
  }
  res.json({ account: rows[0] });
});

// PATCH /api/auth/account  { firstName, lastName, email }
// Staff may maintain their own contact profile. Login identity and employment
// fields (username, department, position and status) remain administrator-owned.
router.patch('/account', authenticate, async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (![firstName, lastName, email].every((value) => typeof value === 'string' && value.trim())) {
    throw new HttpError(400, 'First name, last name and email are required.');
  }

  const profile = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
  };
  if (profile.firstName.length > 50 || profile.lastName.length > 50) {
    throw new HttpError(400, 'First and last names must be 50 characters or fewer.');
  }
  if (profile.email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  let account;
  try {
    const { rows } = await db.query(
      `UPDATE users
          SET first_name = $1, last_name = $2, email = $3
        WHERE user_id = $4
        RETURNING user_id, username, email, first_name, last_name, role, position,
                  employment_status, created_at`,
      [profile.firstName, profile.lastName, profile.email, req.user.userId]
    );
    account = rows[0];
    const { rows: photos } = await db.query(
      'SELECT EXISTS (SELECT 1 FROM hk_staff_profile_photos WHERE user_id = $1) AS present',
      [req.user.userId]
    );
    account.has_profile_photo = photos[0].present;
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'That email address is already assigned to another account.');
    }
    throw err;
  }
  if (!account) {
    throw new HttpError(404, 'Account not found.');
  }

  // Refresh the session claims so the header shows the new name immediately.
  const { iat, exp, mustChangePassword, ...claims } = req.user;
  const nextClaims = { ...claims, name: `${account.first_name} ${account.last_name}` };
  const token = jwt.sign(nextClaims, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const { pwv, ...publicUser } = nextClaims;
  res.json({
    account,
    token,
    user: { ...publicUser, mustChangePassword: Boolean(mustChangePassword) },
  });
});

// GET/PUT/DELETE /api/auth/account/photo: each user manages their own image.
router.get('/account/photo', authenticate, async (req, res) => {
  const { rows } = await db.query(
    'SELECT content_type, data FROM hk_staff_profile_photos WHERE user_id = $1',
    [req.user.userId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Profile photo not found.');
  }
  res.set('Content-Type', rows[0].content_type);
  res.set('Cache-Control', 'private, no-store');
  res.send(rows[0].data);
});

router.put('/account/photo', authenticate, async (req, res) => {
  const image = req.body && req.body.image;
  const match = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match || !PROFILE_PHOTO_TYPES.includes(match[1])) {
    throw new HttpError(400, 'Upload a JPEG, PNG or WebP profile photo.');
  }
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new HttpError(400, 'Profile photos must be 2 MB or smaller.');
  }
  const { rows } = await db.query(
    `INSERT INTO hk_staff_profile_photos (user_id, content_type, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = NOW()
     RETURNING content_type, updated_at`,
    [req.user.userId, match[1], data]
  );
  res.json({ photo: rows[0] });
});

router.delete('/account/photo', authenticate, async (req, res) => {
  await db.query('DELETE FROM hk_staff_profile_photos WHERE user_id = $1', [req.user.userId]);
  res.status(204).end();
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
  if (typeof currentPassword !== 'string' || currentPassword.length > 72) {
    throw new HttpError(400, 'Your current password is incorrect.');
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
