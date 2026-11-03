const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { authorize } = require('../../middleware/auth');
const { changeRoomStatus, lockRoom } = require('./roomStatus');

// Integration points used by Front Office (HOSIS section 9.1).
const router = express.Router();

// GET /api/housekeeping/notifications[?unread=1]
// "Room ready" notices that Housekeeping raises when a room passes inspection.
router.get('/notifications', authorize('HOUSEKEEPING', 'FRONT_OFFICE'), async (req, res) => {
  const unread = req.query.unread === '1';
  const { rows } = await db.query(
    `SELECT n.*, r.room_number FROM hk_front_office_notifications n
       JOIN rooms r ON r.room_id = n.room_id
      ${unread ? 'WHERE n.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC LIMIT 50`
  );
  res.json({ notifications: rows });
});

// PATCH /api/housekeeping/notifications/:id/read
// Front Office marks a notice as handled once it has released the room.
router.patch('/notifications/:id/read', authorize('FRONT_OFFICE'), async (req, res) => {
  const id = v.id(req.params.id, 'notification id');
  const { rows } = await db.query(
    `UPDATE hk_front_office_notifications SET read_at = COALESCE(read_at, NOW())
      WHERE notification_id = $1 RETURNING *`,
    [id]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Notification not found.');
  }
  res.json({ notification: rows[0] });
});

// POST /api/housekeeping/checkout  { roomId, notes? }
// Front Office calls this when a guest checks out: the room becomes DIRTY and
// Housekeeping receives a CHECKOUT cleaning task for the supervisor to assign.
router.post('/checkout', authorize('FRONT_OFFICE'), async (req, res) => {
  v.required(req.body, ['roomId']);
  const roomId = v.id(req.body.roomId, 'room');
  const result = await db.withTransaction(async (client) => {
    const room = await lockRoom(client, roomId);
    if (room.room_status !== 'OCCUPIED') {
      throw new HttpError(409, `Room ${room.room_number} is ${room.room_status}, not OCCUPIED.`);
    }
    const updated = await changeRoomStatus(client, {
      roomId,
      newStatus: 'DIRTY',
      staffId: req.user.userId,
      remarks: 'Guest checked out (Front Office)',
      manual: false,
    });
    const { rows: open } = await client.query(
      `SELECT * FROM hk_cleaning_tasks
        WHERE room_id = $1 AND task_status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RETURNED')
        LIMIT 1`,
      [roomId]
    );
    if (open[0]) {
      return { room: updated, task: open[0], created: false };
    }
    const { rows } = await client.query(
      `INSERT INTO hk_cleaning_tasks (room_id, task_type, priority, notes)
       VALUES ($1, 'CHECKOUT', 'NORMAL', $2) RETURNING *`,
      [roomId, req.body.notes ? String(req.body.notes).slice(0, 255) : 'Guest checked out']
    );
    return { room: updated, task: rows[0], created: true };
  });
  res.status(result.created ? 201 : 200).json(result);
});

module.exports = router;
