const HttpError = require('../../utils/httpError');

// Small helpers that check request input before it reaches the database (SYS-006).

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    throw new HttpError(400, `Missing required field(s): ${missing.join(', ')}`);
  }
}

function oneOf(value, allowed, label) {
  if (value !== undefined && value !== null && !allowed.includes(value)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(', ')}`);
  }
}

function id(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return n;
}

function optionalId(value, label) {
  return value === undefined || value === null || value === '' ? null : id(value, label);
}

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

module.exports = { required, oneOf, id, optionalId, PRIORITIES };
