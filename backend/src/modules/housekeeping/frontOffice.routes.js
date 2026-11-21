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
  const body = req.body || {};
  v.required(body, ['roomId']);
  v.maxLengths(body, { notes: [255, 'Notes'], reservationReference: [100, 'Reservation reference'] });
  const roomId = v.id(body.roomId, 'room');
  const reservationReference = body.reservationReference ? String(body.reservationReference).trim() : null;
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
      // The guest has left, so the open task (often a stayover) becomes a full
      // checkout clean. One that was already cleaned and waiting for
      // inspection goes back to the housekeeper: the room is DIRTY again and
      // could otherwise never pass or fail inspection. Keep the Front Office
      // reservation reference when one was supplied for cross-module tracing.
      const { rows: task } = await client.query(
        `UPDATE hk_cleaning_tasks
            SET task_type = 'CHECKOUT',
                task_status = CASE WHEN task_status = 'COMPLETED' THEN 'RETURNED' ELSE task_status END,
                reservation_reference = COALESCE(reservation_reference, $2)
          WHERE task_id = $1 RETURNING *`,
        [open[0].task_id, reservationReference]
      );
      return { room: updated, task: task[0], created: false };
    }
    const { rows } = await client.query(
      `INSERT INTO hk_cleaning_tasks (room_id, task_type, priority, notes, reservation_reference)
       VALUES ($1, 'CHECKOUT', 'NORMAL', $2, $3) RETURNING *`,
      [roomId, body.notes ? String(body.notes).trim() : 'Guest checked out', reservationReference]
    );
    return { room: updated, task: rows[0], created: true };
  });
  res.status(result.created ? 201 : 200).json(result);
});

// POST /api/housekeeping/front-office/guest-requests
// Front Office records a housekeeping-type request from an existing booking.
// reservationReference is deliberately stored as text instead of a foreign
// key because the combined HOSIS reservation table is owned by Front Office.
router.post('/front-office/guest-requests', authorize('FRONT_OFFICE'), async (req, res) => {
  const body = req.body || {};
  v.required(body, ['roomId', 'requestType', 'details']);
  v.oneOf(body.requestType, ['TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER'], 'requestType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  v.maxLengths(body, { details: [255, 'Details'], reservationReference: [100, 'Reservation reference'] });
  const roomId = v.id(body.roomId, 'room');
  const guestId = v.optionalId(body.guestId, 'guest');
  const reservationReference = body.reservationReference ? String(body.reservationReference).trim() : null;

  const request = await db.withTransaction(async (client) => {
    const { rows: rooms } = await client.query('SELECT room_id FROM rooms WHERE room_id = $1', [roomId]);
    if (!rooms[0]) throw new HttpError(400, 'The selected room does not exist.');
    if (guestId) {
      const { rows: guests } = await client.query('SELECT guest_id FROM guests WHERE guest_id = $1', [guestId]);
      if (!guests[0]) throw new HttpError(400, 'The selected guest does not exist.');
    }
    const { rows } = await client.query(
      `INSERT INTO hk_guest_requests
         (guest_id, room_id, request_type, priority, request_details, reservation_reference)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [guestId, roomId, body.requestType, body.priority || 'NORMAL', String(body.details).trim(), reservationReference]
    );
    return rows[0];
  });
  res.status(201).json({ request });
});

// GET /api/housekeeping/front-office/guest-requests[?reservationReference=...]
// Lets Front Office show the current Housekeeping status on a booking without
// granting access to the Housekeeping staff interface.
router.get('/front-office/guest-requests', authorize('FRONT_OFFICE'), async (req, res) => {
  v.oneOf(req.query.status, ['OPEN', 'IN_PROGRESS', 'COMPLETED'], 'status');
  v.maxLengths(req.query, { reservationReference: [100, 'Reservation reference'] });
  const params = [];
  const where = [];
  if (req.query.reservationReference) {
    params.push(req.query.reservationReference);
    where.push(`q.reservation_reference = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`q.request_status = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT q.request_id, q.room_id, r.room_number, q.guest_id,
            q.reservation_reference, q.request_type, q.priority,
            q.request_details, q.request_status, q.requested_at, q.completed_at,
            u.username AS assigned_staff_username
       FROM hk_guest_requests q
       JOIN rooms r ON r.room_id = q.room_id
       LEFT JOIN users u ON u.user_id = q.staff_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY q.requested_at DESC LIMIT 100`,
    params
  );
  res.json({ requests: rows });
});

// ---------------------------------------------------------------------
// Front Office stand-ins. Front Office owns AVAILABLE, RESERVED and OCCUPIED.
// Until the Front Office module exists, these let the demo finish the room
// cycle (npm run frontoffice). The combined HOSIS app should replace them with
// the Front Office module's own check-in and room release.
// ---------------------------------------------------------------------

// GET /api/housekeeping/front-office/rooms: every room and its status.
router.get('/front-office/rooms', authorize('FRONT_OFFICE'), async (req, res) => {
  const { rows } = await db.query('SELECT room_id, room_number, room_type, room_status FROM rooms ORDER BY room_number');
  res.json({ rooms: rows });
});

// POST /api/housekeeping/front-office/release  { roomId }
// Front Office puts an INSPECTED room back on sale: INSPECTED -> AVAILABLE,
// and its "room ready" notices are marked read.
router.post('/front-office/release', authorize('FRONT_OFFICE'), async (req, res) => {
  v.required(req.body || {}, ['roomId']);
  const roomId = v.id(req.body.roomId, 'room');
  const room = await db.withTransaction(async (client) => {
    const current = await lockRoom(client, roomId);
    if (current.room_status !== 'INSPECTED') {
      throw new HttpError(409, `Room ${current.room_number} is ${current.room_status}. Only INSPECTED rooms can be released.`);
    }
    const updated = await changeRoomStatus(client, {
      roomId,
      newStatus: 'AVAILABLE',
      staffId: req.user.userId,
      remarks: 'Released for sale (Front Office)',
      manual: false,
    });
    await client.query(
      `UPDATE hk_front_office_notifications SET read_at = NOW()
        WHERE room_id = $1 AND notice_type = 'ROOM_READY' AND read_at IS NULL`,
      [roomId]
    );
    return updated;
  });
  res.json({ room });
});

// POST /api/housekeeping/front-office/check-in  { roomId }
// A guest checks in: AVAILABLE or RESERVED -> OCCUPIED.
router.post('/front-office/check-in', authorize('FRONT_OFFICE'), async (req, res) => {
  v.required(req.body || {}, ['roomId']);
  const roomId = v.id(req.body.roomId, 'room');
  const room = await db.withTransaction(async (client) => {
    const current = await lockRoom(client, roomId);
    if (!['AVAILABLE', 'RESERVED'].includes(current.room_status)) {
      throw new HttpError(409, `Room ${current.room_number} is ${current.room_status}. Only AVAILABLE or RESERVED rooms can be checked in.`);
    }
    return changeRoomStatus(client, {
      roomId,
      newStatus: 'OCCUPIED',
      staffId: req.user.userId,
      remarks: 'Guest checked in (Front Office)',
      manual: false,
    });
  });
  res.json({ room });
});

module.exports = router;
