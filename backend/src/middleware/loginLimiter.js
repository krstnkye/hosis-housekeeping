const db = require('../config/db');
const HttpError = require('../utils/httpError');

// Slows down password guessing (NFR-SEC-001). After MAX_FAILURES wrong
// passwords for the same account from the same address within WINDOW_MINUTES,
// that pair is locked out until the window passes. Failures are kept in the
// hk_login_failures table, so a server restart does not clear a lockout.
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

function keyFor(req) {
  const username = String((req.body && req.body.username) || '').toLowerCase().slice(0, 150);
  return `${req.ip}|${username}`;
}

async function checkLoginAllowed(req) {
  const { rows } = await db.query(
    `SELECT failures, CEIL(EXTRACT(EPOCH FROM (first_at + $2 * INTERVAL '1 minute' - NOW())) / 60)::int AS minutes_left
       FROM hk_login_failures
      WHERE attempt_key = $1 AND first_at > NOW() - $2 * INTERVAL '1 minute'`,
    [keyFor(req), WINDOW_MINUTES]
  );
  if (rows[0] && rows[0].failures >= MAX_FAILURES) {
    throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${Math.max(rows[0].minutes_left, 1)} minute(s).`);
  }
}

async function recordLoginFailure(req) {
  // A failure after the window has passed starts a new window.
  await db.query(
    `INSERT INTO hk_login_failures (attempt_key) VALUES ($1)
     ON CONFLICT (attempt_key) DO UPDATE SET
       failures = CASE WHEN hk_login_failures.first_at > NOW() - $2 * INTERVAL '1 minute'
                       THEN hk_login_failures.failures + 1 ELSE 1 END,
       first_at = CASE WHEN hk_login_failures.first_at > NOW() - $2 * INTERVAL '1 minute'
                       THEN hk_login_failures.first_at ELSE NOW() END`,
    [keyFor(req), WINDOW_MINUTES]
  );
}

async function clearLoginFailures(req) {
  await db.query('DELETE FROM hk_login_failures WHERE attempt_key = $1', [keyFor(req)]);
}

module.exports = { checkLoginAllowed, recordLoginFailure, clearLoginFailures, MAX_FAILURES };
