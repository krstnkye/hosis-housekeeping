const HttpError = require('../../utils/httpError');

const ROOM_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'CLEAN', 'INSPECTED', 'OUT_OF_ORDER'];

// Status changes Housekeeping may make by hand from the Room Status page (HK-003).
// - Front Office owns AVAILABLE/RESERVED/OCCUPIED, so Housekeeping never sets those.
// - INSPECTED is set only by a passed inspection (HK-007), so every pass is recorded.
// - OUT_OF_ORDER is set only through a maintenance request (HK-015), and a room
//   leaves it only when that request is released after Engineering's repair.
// - CLEAN is set only by completing a cleaning task (HK-006), so a room cannot
//   skip cleaning and inspection by being marked CLEAN by hand.
const MANUAL_TRANSITIONS = {
  AVAILABLE: ['DIRTY'],
  RESERVED: [],
  OCCUPIED: ['DIRTY'],
  DIRTY: [],
  CLEAN: ['DIRTY'],
  INSPECTED: ['DIRTY'],
  OUT_OF_ORDER: [],
};

async function lockRoom(client, roomId) {
  const { rows } = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
  if (!rows[0]) {
    throw new HttpError(404, 'Room not found.');
  }
  return rows[0];
}

async function notifyFrontOffice(client, roomId, message, staffId) {
  await client.query(
    'INSERT INTO hk_front_office_notifications (room_id, message, created_by) VALUES ($1, $2, $3)',
    [roomId, message, staffId]
  );
}

function outOfOrderError(room) {
  return new HttpError(
    409,
    `Room ${room.room_number} is OUT OF ORDER. It can only be released from its maintenance request after Engineering completes the repair.`
  );
}

// Changes a room's status and writes the change to the room status log.
// Workflow steps (task completion, inspection, maintenance) pass manual=false
// because their own rules already decide the next status. Only the maintenance
// release passes releaseOutOfOrder=true, so no other step can move a room out
// of OUT_OF_ORDER while it is waiting for a repair.
async function changeRoomStatus(client, { roomId, newStatus, staffId, remarks, manual = true, releaseOutOfOrder = false }) {
  const room = await lockRoom(client, roomId);
  if (room.room_status === newStatus) {
    return room;
  }
  if (room.room_status === 'OUT_OF_ORDER' && !releaseOutOfOrder) {
    throw outOfOrderError(room);
  }
  if (manual && !MANUAL_TRANSITIONS[room.room_status].includes(newStatus)) {
    throw new HttpError(
      409,
      `Housekeeping cannot change room ${room.room_number} from ${room.room_status} to ${newStatus}.`
    );
  }

  const { rows } = await client.query(
    'UPDATE rooms SET room_status = $1, updated_at = NOW() WHERE room_id = $2 RETURNING *',
    [newStatus, roomId]
  );
  await client.query(
    `INSERT INTO hk_room_status_logs (room_id, staff_id, previous_status, new_status, remarks)
     VALUES ($1, $2, $3, $4, $5)`,
    [roomId, staffId, room.room_status, newStatus, remarks || null]
  );
  if (newStatus === 'INSPECTED') {
    await notifyFrontOffice(
      client,
      roomId,
      `Room ${room.room_number} passed inspection and is ready to be released as AVAILABLE.`,
      staffId
    );
  }
  return rows[0];
}

// Stops cleaning and inspection steps on a room that is waiting for a repair.
async function assertNotOutOfOrder(client, roomId) {
  const room = await lockRoom(client, roomId);
  if (room.room_status === 'OUT_OF_ORDER') {
    throw outOfOrderError(room);
  }
  return room;
}

module.exports = {
  ROOM_STATUSES,
  MANUAL_TRANSITIONS,
  changeRoomStatus,
  lockRoom,
  notifyFrontOffice,
  assertNotOutOfOrder,
};
