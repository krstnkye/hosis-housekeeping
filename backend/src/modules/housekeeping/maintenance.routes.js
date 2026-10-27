const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { changeRoomStatus } = require('./roomStatus');

const router = express.Router();

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE', 'APPLIANCE', 'OTHER'];

const SELECT = `
  SELECT m.*, r.room_number, r.room_status,
         CONCAT(u.first_name, ' ', u.last_name) AS reported_by_name
    FROM hk_maintenance_requests m
    JOIN rooms r ON r.room_id = m.room_id
    JOIN users u ON u.user_id = m.reported_by`;

// Open issues by default, ?view=all for history.
router.get('/', async (req, res) => {
  const where = req.query.view === 'all' ? '' : `WHERE m.status <> 'CLOSED'`;
  const { rows } = await db.query(
    `${SELECT} ${where}
      ORDER BY CASE m.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               m.reported_at DESC`
  );
  res.json({ requests: rows });
});

// HK-015: create a maintenance request for Engineering and, when asked,
// set the room OUT OF ORDER so it cannot be sold.
router.post('/', async (req, res) => {
  const body = req.body;
  v.required(body, ['roomId', 'category', 'description']);
  v.oneOf(body.category, CATEGORIES, 'category');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  const roomId = v.id(body.roomId, 'room');
  const setOutOfOrder = body.setOutOfOrder === true;

  const request = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO hk_maintenance_requests
         (room_id, reported_by, issue_category, issue_description, priority, room_set_ooo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [roomId, req.user.userId, body.category, body.description, body.priority || 'NORMAL', setOutOfOrder]
    );
    if (setOutOfOrder) {
      await changeRoomStatus(client, {
        roomId,
        newStatus: 'OUT_OF_ORDER',
        staffId: req.user.userId,
        remarks: `Maintenance request #${rows[0].request_id}: ${body.category}`,
        manual: false,
      });
    }
    return rows[0];
  });
  res.status(201).json({ request });
});

// Track Engineering's progress (IN_PROGRESS, then REPAIRED when the repair is done).
router.patch('/:id', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const body = req.body;
  v.oneOf(body.status, ['REPORTED', 'IN_PROGRESS', 'REPAIRED'], 'status');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  const { rows } = await db.query(
    `UPDATE hk_maintenance_requests
        SET status = COALESCE($1, status),
            priority = COALESCE($2, priority),
            issue_description = COALESCE($3, issue_description),
            resolved_at = CASE WHEN $1 = 'REPAIRED' THEN NOW() WHEN $1 IS NULL THEN resolved_at ELSE NULL END
      WHERE request_id = $4 AND status <> 'CLOSED' RETURNING *`,
    [body.status || null, body.priority || null, body.description || null, requestId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Request not found or already closed.');
  }
  res.json({ request: rows[0] });
});

// After Engineering completes the repair: room goes OUT_OF_ORDER -> DIRTY and
// a post-repair cleaning task is created, then the request is closed.
router.post('/:id/release', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const result = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM hk_maintenance_requests WHERE request_id = $1 FOR UPDATE',
      [requestId]
    );
    const request = rows[0];
    if (!request) {
      throw new HttpError(404, 'Maintenance request not found.');
    }
    if (request.status !== 'REPAIRED') {
      throw new HttpError(409, 'Engineering must mark the repair as REPAIRED before the room is released.');
    }
    await client.query(
      `UPDATE hk_maintenance_requests SET status = 'CLOSED' WHERE request_id = $1`,
      [requestId]
    );

    // Another open request may still be keeping the room out of order.
    const { rows: others } = await client.query(
      `SELECT 1 FROM hk_maintenance_requests
        WHERE room_id = $1 AND room_set_ooo AND status <> 'CLOSED'`,
      [request.room_id]
    );
    const { rows: room } = await client.query('SELECT room_status FROM rooms WHERE room_id = $1', [request.room_id]);
    if (others.length || room[0].room_status !== 'OUT_OF_ORDER') {
      return { request: { ...request, status: 'CLOSED' }, task: null };
    }

    await changeRoomStatus(client, {
      roomId: request.room_id,
      newStatus: 'DIRTY',
      staffId: req.user.userId,
      remarks: `Repair completed (maintenance request #${requestId})`,
      manual: false,
    });
    const { rows: task } = await client.query(
      `INSERT INTO hk_cleaning_tasks (room_id, task_type, priority, notes)
       VALUES ($1, 'POST_REPAIR', 'HIGH', $2) RETURNING *`,
      [request.room_id, `Clean after repair: ${request.issue_description}`]
    );
    return { request: { ...request, status: 'CLOSED' }, task: task[0] };
  });
  res.json(result);
});

module.exports = router;
