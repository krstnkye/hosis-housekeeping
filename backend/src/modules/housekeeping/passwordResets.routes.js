const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

// Forgot password, supervisor side. A staff member asks from the login page
// (POST /api/auth/forgot-password); the supervisor sets a temporary password
// here and gives it to them in person. At the next sign-in they must choose
// a new password before they can do anything else.
const router = express.Router();

router.use(requirePosition('SUPERVISOR'));

// Readable temporary password, e.g. "Hk-7Q4M-2XPA" (no 0/O or 1/I).
function temporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => chars[b % chars.length]).join('');
  return `Hk-${pick(4)}-${pick(4)}`;
}

// GET /api/housekeeping/password-resets: open requests, newest first.
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.reset_id, p.user_id, p.requested_at, u.username, u.email, u.position,
            CONCAT(u.first_name, ' ', u.last_name) AS name
       FROM hk_password_resets p JOIN users u ON u.user_id = p.user_id
      WHERE p.status = 'REQUESTED'
      ORDER BY p.requested_at DESC`
  );
  res.json({ requests: rows });
});

// POST /api/housekeeping/password-resets/staff/:userId
// Sets a temporary password for a housekeeping staff member (with or without
// a request). The temporary password is returned once and never stored.
router.post('/staff/:userId', async (req, res) => {
  const userId = v.id(req.params.userId, 'staff id');
  if (userId === req.user.userId) {
    throw new HttpError(400, 'Change your own password on the Account page.');
  }
  const password = temporaryPassword();
  const hash = await bcrypt.hash(password, 10);
  const staff = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE users SET password_hash = $1
        WHERE user_id = $2 AND role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'
        RETURNING user_id, username, CONCAT(first_name, ' ', last_name) AS name`,
      [hash, userId]
    );
    if (!rows[0]) {
      throw new HttpError(404, 'Only active housekeeping staff can have their password reset here.');
    }
    await client.query(
      `INSERT INTO hk_password_must_change (user_id, set_by) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET set_by = EXCLUDED.set_by, set_at = NOW()`,
      [userId, req.user.userId]
    );
    await client.query(
      `UPDATE hk_password_resets SET status = 'DONE', handled_by = $2, handled_at = NOW()
        WHERE user_id = $1 AND status = 'REQUESTED'`,
      [userId, req.user.userId]
    );
    return rows[0];
  });
  res.json({ staff, temporaryPassword: password });
});

// POST /api/housekeeping/password-resets/:id/dismiss: the request was not
// genuine (e.g. the staff member did not ask for it).
router.post('/:id/dismiss', async (req, res) => {
  const resetId = v.id(req.params.id, 'request id');
  const { rows } = await db.query(
    `UPDATE hk_password_resets SET status = 'DISMISSED', handled_by = $2, handled_at = NOW()
      WHERE reset_id = $1 AND status = 'REQUESTED' RETURNING *`,
    [resetId, req.user.userId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Request not found or already handled.');
  }
  res.json({ request: rows[0] });
});

module.exports = router;
