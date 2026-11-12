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

// Text fields must fit their database column (VARCHAR(n)).
// limits = { fieldName: [maxLength, 'Label shown in the error'] }
function maxLengths(body, limits) {
  for (const [field, [max, label]] of Object.entries(limits)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new HttpError(400, `${label} must be text.`);
    }
    if (String(value).length > max) {
      throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// YYYY-MM-DD that is a real calendar date.
function date(value, label) {
  if (typeof value !== 'string' || !isRealDate(value)) {
    throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`);
  }
  return value;
}

// HH:MM (24-hour), optional.
function optionalTime(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !TIME_RE.test(value)) {
    throw new HttpError(400, `${label} must be a valid time (HH:MM, 24-hour).`);
  }
  return value;
}

// A date and time such as 2026-11-12T09:30, not in the future.
function optionalPastDateTime(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const d = typeof value === 'string' ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new HttpError(400, `${label} must be a valid date and time.`);
  }
  if (d.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new HttpError(400, `${label} cannot be in the future.`);
  }
  return value;
}

// Whole number in a range (stock quantities and similar).
function int(value, label, { min = 0, max = 100000 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

module.exports = {
  required, oneOf, id, optionalId, maxLengths, date, optionalTime, optionalPastDateTime, int, isRealDate,
  DATE_RE, TIME_RE, PRIORITIES,
};
