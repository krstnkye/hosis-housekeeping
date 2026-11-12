const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { changeRoomStatus, lockRoom } = require('./roomStatus');

// Housekeeping side of maintenance (HK-015). Engineering's side
// (viewing incoming requests and updating repair progress) is in
// engineering.routes.js, so only Engineering can mark a repair REPAIRED.
const router = express.Router();

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'AIRCON', 'FURNITURE', 'APPLIANCE', 'OTHER'];

// Front Office owns rooms that are sold or in use. Housekeeping can still
// report a problem in them, but cannot take them off sale by itself.
const FRONT_OFFICE_HELD = ['OCCUPIED', 'RESERVED'];

const SELECT = `
  SELECT m.*, r.room_number, r.room_status,
         CONCAT(u.first_name, ' ', u.last_name) AS reported_by_name
    FROM hk_maintenance_requests m
    JOIN rooms r ON r.room_id = m.room_id
    JOIN users u ON u.user_id = m.reported_by`;

const PRIORITY_ORDER = `CASE m.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END`;

// Open issues by default, ?view=all for history.
router.get('/', async (req, res) => {
  const where = req.query.view === 'all' ? '' : `WHERE m.status <> 'CLOSED'`;
  const { rows } = await db.query(`${SELECT} ${where} ORDER BY ${PRIORITY_ORDER}, m.reported_at DESC`);
  res.json({ requests: rows });
});

// HK-015: create a maintenance request for Engineering and, when asked,
// set the room OUT OF ORDER so it cannot be sold.
router.post('/', async (req, res) => {
  const body = req.body;
  v.required(body, ['roomId', 'category', 'description']);
  v.oneOf(body.category, CATEGORIES, 'category');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  v.maxLengths(body, { description: [255, 'Description'] });
  const roomId = v.id(body.roomId, 'room');
  const setOutOfOrder = body.setOutOfOrder === true;

  const request = await db.withTransaction(async (client) => {
    const room = await lockRoom(client, roomId);
    if (setOutOfOrder && FRONT_OFFICE_HELD.includes(room.room_status)) {
      throw new HttpError(
        409,
        `Room ${room.room_number} is ${room.room_status}. Report the issue without setting it OUT OF ORDER, and ask Front Office to move the guest first.`
      );
    }
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

// Housekeeping may correct the priority or description of an open request.
// The repair status belongs to Engineering (see engineering.routes.js).
router.patch('/:id', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const body = req.body;
  if (body.status !== undefined) {
    throw new HttpError(403, 'Only Engineering can update the repair status.');
  }
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  v.maxLengths(body, { description: [255, 'Description'] });
  const { rows } = await db.query(
    `UPDATE hk_maintenance_requests
        SET priority = COALESCE($1, priority),
            issue_description = COALESCE($2, issue_description)
      WHERE request_id = $3 AND status <> 'CLOSED' RETURNING *`,
    [body.priority || null, body.description || null, requestId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Request not found or already closed.');
  }
  res.json({ request: rows[0] });
});

// After Engineering marks the repair REPAIRED, Housekeeping releases the room:
// OUT_OF_ORDER -> DIRTY, the request is closed, and the room gets a
// high-priority cleaning task. A cleaning task that was still open when the
// room went out of order is reopened instead of creating a second one.
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
    await client.query(`UPDATE hk_maintenance_requests SET status = 'CLOSED' WHERE request_id = $1`, [requestId]);
    const closed = { ...request, status: 'CLOSED' };

    // Another open request may still be keeping the room out of order.
    const { rows: others } = await client.query(
      `SELECT 1 FROM hk_maintenance_requests
        WHERE room_id = $1 AND room_set_ooo AND status <> 'CLOSED'`,
      [request.room_id]
    );
    const room = await lockRoom(client, request.room_id);
    if (others.length || room.room_status !== 'OUT_OF_ORDER') {
      return { request: closed, task: null };
    }

    await changeRoomStatus(client, {
      roomId: request.room_id,
      newStatus: 'DIRTY',
      staffId: req.user.userId,
      remarks: `Repair completed (maintenance request #${requestId})`,
      manual: false,
      releaseOutOfOrder: true,
    });

    const note = `Clean after repair: ${request.issue_description}`.slice(0, 255);
    const { rows: open } = await client.query(
      `SELECT * FROM hk_cleaning_tasks
        WHERE room_id = $1 AND task_status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RETURNED')
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [request.room_id]
    );
    if (open[0]) {
      const { rows: task } = await client.query(
        `UPDATE hk_cleaning_tasks
            SET task_status = CASE WHEN staff_id IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END,
                priority = CASE WHEN priority = 'URGENT' THEN 'URGENT' ELSE 'HIGH' END,
                start_time = NULL, completion_time = NULL, notes = $2
          WHERE task_id = $1 RETURNING *`,
        [open[0].task_id, note]
      );
      return { request: closed, task: task[0], reopened: true };
    }
    const { rows: task } = await client.query(
      `INSERT INTO hk_cleaning_tasks (room_id, task_type, priority, notes)
       VALUES ($1, 'POST_REPAIR', 'HIGH', $2) RETURNING *`,
      [request.room_id, note]
    );
    return { request: closed, task: task[0], reopened: false };
  });
  res.json(result);
});

module.exports = router;
