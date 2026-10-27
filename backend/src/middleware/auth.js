const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');

// Verifies the JWT from "Authorization: Bearer <token>" (SYS-001).
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(new HttpError(401, 'Please log in to continue.'));
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
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

module.exports = { authenticate, authorize, requirePosition };
