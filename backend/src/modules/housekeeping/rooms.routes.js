const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { ROOM_STATUSES, MANUAL_TRANSITIONS, changeRoomStatus } = require('./roomStatus');

const router = express.Router();

// HK-001: view room status, with counts for the summary cards.
router.get('/', async (req, res) => {
  const { status, search } = req.query;
  v.oneOf(status, ROOM_STATUSES, 'status');
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`r.room_status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.room_number ILIKE $${params.length} OR r.room_type ILIKE $${params.length})`);
  }
  const { rows: rooms } = await db.query(
    `SELECT r.*, t.task_id, t.task_status, t.priority AS task_priority,
            CONCAT(u.first_name, ' ', u.last_name) AS housekeeper
       FROM rooms r
       LEFT JOIN LATERAL (
         SELECT * FROM hk_cleaning_tasks ct
          WHERE ct.room_id = r.room_id AND ct.task_status <> 'INSPECTED'
          ORDER BY ct.created_at DESC LIMIT 1
       ) t ON TRUE
       LEFT JOIN users u ON u.user_id = t.staff_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.room_number`,
    params
  );
  const { rows: counts } = await db.query(
    'SELECT room_status, COUNT(*)::int AS count FROM rooms GROUP BY room_status'
  );
  const summary = Object.fromEntries(ROOM_STATUSES.map((s) => [s, 0]));
  counts.forEach((c) => (summary[c.room_status] = c.count));
  res.json({ rooms, summary });
});

// HK-002: select a room to see its details and status history.
router.get('/:id', async (req, res) => {
  const roomId = v.id(req.params.id, 'room id');
  const { rows } = await db.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
  if (!rows[0]) {
    throw new HttpError(404, 'Room not found.');
  }
  const { rows: history } = await db.query(
    `SELECT l.*, CONCAT(u.first_name, ' ', u.last_name) AS changed_by
       FROM hk_room_status_logs l LEFT JOIN users u ON u.user_id = l.staff_id
      WHERE l.room_id = $1 ORDER BY l.changed_at DESC LIMIT 10`,
    [roomId]
  );
  const { rows: tasks } = await db.query(
    `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) AS housekeeper
       FROM hk_cleaning_tasks t LEFT JOIN users u ON u.user_id = t.staff_id
      WHERE t.room_id = $1 AND t.task_status <> 'INSPECTED'
      ORDER BY t.created_at DESC LIMIT 1`,
    [roomId]
  );
  const room = rows[0];
  res.json({
    room,
    history,
    currentTask: tasks[0] || null,
    allowedStatuses: MANUAL_TRANSITIONS[room.room_status],
  });
});

// HK-003: update room status (logged, and Front Office is notified on INSPECTED).
router.patch('/:id/status', async (req, res) => {
  const roomId = v.id(req.params.id, 'room id');
  v.required(req.body, ['status']);
  v.oneOf(req.body.status, ROOM_STATUSES, 'status');
  if (
    req.body.status === 'INSPECTED' &&
    !['INSPECTOR', 'SUPERVISOR'].includes(req.user.position) &&
    req.user.role !== 'ADMIN'
  ) {
    throw new HttpError(403, 'Only inspectors or supervisors can mark a room INSPECTED.');
  }
  const room = await db.withTransaction((client) =>
    changeRoomStatus(client, {
      roomId,
      newStatus: req.body.status,
      staffId: req.user.userId,
      remarks: req.body.remarks,
    })
  );
  res.json({ room });
});

module.exports = router;
