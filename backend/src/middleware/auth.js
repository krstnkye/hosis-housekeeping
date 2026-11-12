const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const HttpError = require('../utils/httpError');

// A short fingerprint of the stored password hash. It is put in the JWT, so a
// token stops working as soon as the password is changed or reset.
function passwordVersion(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 16);
}

// Verifies the JWT from "Authorization: Bearer <token>" (SYS-001), then
// re-reads the account so a deactivated account, a changed role or a changed
// password takes effect right away instead of when the token expires.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(new HttpError(401, 'Please log in to continue.'));
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
  try {
    const { rows } = await db.query(
      `SELECT u.role, u.position, u.employment_status, u.password_hash,
              (m.user_id IS NOT NULL) AS must_change_password
         FROM users u LEFT JOIN hk_password_must_change m ON m.user_id = u.user_id
        WHERE u.user_id = $1`,
      [payload.userId]
    );
    const account = rows[0];
    if (!account || account.employment_status !== 'ACTIVE') {
      return next(new HttpError(401, 'This account is no longer active. Please contact your supervisor.'));
    }
    if (payload.pwv && payload.pwv !== passwordVersion(account.password_hash)) {
      return next(new HttpError(401, 'Your password was changed. Please log in again.'));
    }
    req.user = {
      ...payload,
      role: account.role,
      position: account.position,
      mustChangePassword: account.must_change_password,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Blocks everything except the password change until a temporary password
// (set by a supervisor) has been replaced.
function requirePasswordChanged(req, res, next) {
  if (req.user.mustChangePassword) {
    return next(new HttpError(403, 'Please choose a new password before continuing.'));
  }
  next();
}

// Allows only the given HOSIS roles (SYS-002, SYS-003). ADMIN always passes.
function authorize(...roles) {
  return (req, res, next) => {
    if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) {
      return next();
    }
    next(new HttpError(403, 'You do not have permission to perform this action.'));
  };
}

// Allows only the given positions inside a department, e.g. SUPERVISOR.
function requirePosition(...positions) {
  return (req, res, next) => {
    if (req.user.role === 'ADMIN' || positions.includes(req.user.position)) {
      return next();
    }
    next(new HttpError(403, `Only ${positions.join(' or ').toLowerCase()}s can perform this action.`));
  };
}

module.exports = { authenticate, authorize, requirePosition, requirePasswordChanged, passwordVersion };
