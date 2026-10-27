const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');

const router = express.Router();

const REQUEST_TYPES = ['TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER'];

const REQUEST_SELECT = `
  SELECT q.*, r.room_number,
         CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
         CONCAT(u.first_name, ' ', u.last_name) AS assigned_to
    FROM hk_guest_requests q
    JOIN rooms r ON r.room_id = q.room_id
    LEFT JOIN guests g ON g.guest_id = q.guest_id
    LEFT JOIN users u ON u.user_id = q.staff_id`;

// Open requests, or completed requests for today (?view=completed).
router.get('/', async (req, res) => {
  const params = [];
  const where =
    req.query.view === 'completed'
      ? [`q.request_status = 'COMPLETED' AND q.completed_at::date = CURRENT_DATE`]
      : [`q.request_status <> 'COMPLETED'`];
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    where.push(`(r.room_number ILIKE $1 OR q.request_details ILIKE $1 OR CONCAT(g.first_name, ' ', g.last_name) ILIKE $1)`);
  }
  const { rows } = await db.query(
    `${REQUEST_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY CASE q.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               q.requested_at`,
    params
  );
  res.json({ requests: rows });
});

// HK-013: record a guest request.
router.post('/', async (req, res) => {
  const body = req.body;
  v.required(body, ['roomId', 'requestType', 'details']);
  v.oneOf(body.requestType, REQUEST_TYPES, 'requestType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  const staffId = v.optionalId(body.staffId, 'staff');
  const { rows } = await db.query(
    `INSERT INTO hk_guest_requests (guest_id, room_id, staff_id, request_type, priority, request_details, request_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [v.optionalId(body.guestId, 'guest'), v.id(body.roomId, 'room'), staffId, body.requestType,
      body.priority || 'NORMAL', body.details, staffId ? 'IN_PROGRESS' : 'OPEN']
  );
  res.status(201).json({ request: rows[0] });
});

// Assign and process the request (assigning staff moves it to IN_PROGRESS).
router.patch('/:id', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const body = req.body;
  v.oneOf(body.requestType, REQUEST_TYPES, 'requestType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  const { rows: found } = await db.query('SELECT * FROM hk_guest_requests WHERE request_id = $1', [requestId]);
  const current = found[0];
  if (!current) {
    throw new HttpError(404, 'Guest request not found.');
  }
  if (current.request_status === 'COMPLETED') {
    throw new HttpError(409, 'This request is already completed.');
  }
  const staffId = body.staffId !== undefined ? v.optionalId(body.staffId, 'staff') : current.staff_id;
  const { rows } = await db.query(
    `UPDATE hk_guest_requests
        SET staff_id = $1, request_type = $2, priority = $3, request_details = $4, request_status = $5
      WHERE request_id = $6 RETURNING *`,
    [staffId, body.requestType || current.request_type, body.priority || current.priority,
      body.details || current.request_details, staffId ? 'IN_PROGRESS' : 'OPEN', requestId]
  );
  res.json({ request: rows[0] });
});

// HK-014: complete the request.
router.post('/:id/complete', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const { rows } = await db.query(
    `UPDATE hk_guest_requests
        SET request_status = 'COMPLETED', completed_at = NOW(), completion_notes = $1,
            staff_id = COALESCE(staff_id, $2)
      WHERE request_id = $3 AND request_status <> 'COMPLETED' RETURNING *`,
    [req.body.completionNotes || null, req.user.userId, requestId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Request not found or already completed.');
  }
  res.json({ request: rows[0] });
});

module.exports = router;
