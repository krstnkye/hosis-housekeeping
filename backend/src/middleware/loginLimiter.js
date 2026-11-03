const HttpError = require('../utils/httpError');

// Slows down password guessing (NFR-SEC-001). After MAX_FAILURES wrong
// passwords for the same account from the same address within WINDOW_MS,
// that pair is locked out until the window passes. Kept in memory, so it
// resets when the server restarts; the shared HOSIS backend can replace it.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function keyFor(req) {
  const username = String((req.body && req.body.username) || '').toLowerCase();
  return `${req.ip}|${username}`;
}

function current(key, now = Date.now()) {
  const entry = failures.get(key);
  if (entry && now - entry.first > WINDOW_MS) {
    failures.delete(key);
    return null;
  }
  return entry || null;
}

function checkLoginAllowed(req) {
  const entry = current(keyFor(req));
  if (entry && entry.count >= MAX_FAILURES) {
    const minutes = Math.ceil((entry.first + WINDOW_MS - Date.now()) / 60000);
    throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${minutes} minute(s).`);
  }
}

function recordLoginFailure(req) {
  const key = keyFor(req);
  const entry = current(key);
  if (entry) {
    entry.count += 1;
  } else {
    failures.set(key, { count: 1, first: Date.now() });
  }
}

function clearLoginFailures(req) {
  failures.delete(keyFor(req));
}

module.exports = { checkLoginAllowed, recordLoginFailure, clearLoginFailures, MAX_FAILURES };
