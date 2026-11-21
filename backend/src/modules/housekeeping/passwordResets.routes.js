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

const STAFF_POSITIONS = ['HOUSEKEEPER', 'INSPECTOR', 'SUPERVISOR'];

// Readable temporary password, e.g. "Hk-7Q4M-2XPA" (no 0/O or 1/I).
function temporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => chars[b % chars.length]).join('');
  return `Hk-${pick(4)}-${pick(4)}`;
}

// POST /api/housekeeping/password-resets/staff
// Creates an approved Housekeeping account. There is deliberately no public
// sign-up route: a supervisor chooses the employee's role and gives them the
// one-time password in person.
router.post('/staff', async (req, res) => {
  const body = req.body || {};
  v.required(body, ['firstName', 'lastName', 'username', 'email', 'position']);
  v.maxLengths(body, {
    firstName: [50, 'First name'],
    lastName: [50, 'Last name'],
    username: [50, 'Username'],
    email: [100, 'Email'],
  });

  const firstName = String(body.firstName).trim();
  const lastName = String(body.lastName).trim();
  const username = String(body.username).trim().toLowerCase();
  const email = String(body.email).trim().toLowerCase();
  const position = String(body.position).trim().toUpperCase();

  v.oneOf(position, STAFF_POSITIONS, 'Position');
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3 to 50 characters and use only letters, numbers, dots, underscores or hyphens.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  const password = temporaryPassword();
  const hash = await bcrypt.hash(password, 10);
  let staff;
  try {
    staff = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (first_name, last_name, username, email, password_hash, role, position)
         VALUES ($1, $2, $3, $4, $5, 'HOUSEKEEPING', $6)
         RETURNING user_id, username, email, position, employment_status,
                   CONCAT(first_name, ' ', last_name) AS name`,
        [firstName, lastName, username, email, hash, position]
      );
      await client.query(
        `INSERT INTO hk_password_must_change (user_id, set_by) VALUES ($1, $2)`,
        [rows[0].user_id, req.user.userId]
      );
      return rows[0];
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'That username or email is already assigned to an account.');
    }
    throw err;
  }

  res.status(201).json({ staff, temporaryPassword: password });
});

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
          AND (position <> 'SUPERVISOR' OR $3)
        RETURNING user_id, username, CONCAT(first_name, ' ', last_name) AS name`,
      [hash, userId, req.user.role === 'ADMIN']
    );
    if (!rows[0]) {
      throw new HttpError(404, 'Only active housekeepers and inspectors can have their password reset here. Another supervisor\'s password is reset by the system administrator.');
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
