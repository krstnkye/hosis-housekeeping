const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');
const { changeRoomStatus } = require('./roomStatus');

const router = express.Router();

const TASK_TYPES = ['CHECKOUT', 'STAYOVER', 'DEEP_CLEAN', 'TOUCH_UP', 'POST_REPAIR'];
const TASK_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTED', 'RETURNED'];
const ACTIVE_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RETURNED'];

const TASK_SELECT = `
  SELECT t.*, r.room_number, r.room_type, r.room_status,
         CONCAT(u.first_name, ' ', u.last_name) AS housekeeper
    FROM hk_cleaning_tasks t
    JOIN rooms r ON r.room_id = t.room_id
    LEFT JOIN users u ON u.user_id = t.staff_id`;

async function getTask(client, taskId, lock = false) {
  const { rows } = await client.query(
    `SELECT * FROM hk_cleaning_tasks WHERE task_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [taskId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Cleaning task not found.');
  }
  return rows[0];
}

async function getHousekeeper(client, staffId) {
  const { rows } = await client.query(
    `SELECT user_id FROM users
      WHERE user_id = $1 AND role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'`,
    [staffId]
  );
  if (!rows[0]) {
    throw new HttpError(400, 'Assigned staff must be an active housekeeping employee.');
  }
}

// HK-004 (view): today's cleaning queue. ?mine=1 shows only the user's tasks.
router.get('/', async (req, res) => {
  const { status, mine, search } = req.query;
  v.oneOf(status, TASK_STATUSES, 'status');
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`t.task_status = $${params.length}`);
  } else {
    // Active work plus anything finished today.
    where.push(`(t.task_status <> 'INSPECTED' OR t.completion_time::date = CURRENT_DATE)`);
  }
  if (mine === '1') {
    params.push(req.user.userId);
    where.push(`t.staff_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.room_number ILIKE $${params.length} OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${params.length})`);
  }
  const { rows } = await db.query(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               t.due_time NULLS LAST, t.task_id`,
    params
  );
  res.json({ tasks: rows });
});

// Housekeeper workload for today (bottom card on the Cleaning Tasks page).
router.get('/workload', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.user_id, CONCAT(u.first_name, ' ', u.last_name) AS name,
            COUNT(t.task_id) FILTER (WHERE t.task_status IN ('ASSIGNED', 'IN_PROGRESS', 'RETURNED'))::int AS open_tasks,
            COUNT(t.task_id) FILTER (WHERE t.task_status IN ('COMPLETED', 'INSPECTED'))::int AS done_tasks
       FROM users u
       LEFT JOIN hk_cleaning_tasks t ON t.staff_id = u.user_id AND t.assigned_date = CURRENT_DATE
      WHERE u.role = 'HOUSEKEEPING' AND u.position = 'HOUSEKEEPER' AND u.employment_status = 'ACTIVE'
      GROUP BY u.user_id ORDER BY name`
  );
  res.json({ workload: rows });
});

router.get('/:id', async (req, res) => {
  const taskId = v.id(req.params.id, 'task id');
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.task_id = $1`, [taskId]);
  if (!rows[0]) {
    throw new HttpError(404, 'Cleaning task not found.');
  }
  res.json({ task: rows[0] });
});

// HK-004: create a cleaning task. HK-005: assign a housekeeper when creating.
router.post('/', requirePosition('SUPERVISOR'), async (req, res) => {
  const body = req.body;
  v.required(body, ['roomId', 'taskType']);
  v.oneOf(body.taskType, TASK_TYPES, 'taskType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  const roomId = v.id(body.roomId, 'room');
  const staffId = v.optionalId(body.staffId, 'housekeeper');

  const task = await db.withTransaction(async (client) => {
    const { rows: room } = await client.query('SELECT room_status FROM rooms WHERE room_id = $1', [roomId]);
    if (!room[0]) {
      throw new HttpError(404, 'Room not found.');
    }
    if (room[0].room_status === 'OUT_OF_ORDER') {
      throw new HttpError(409, 'This room is OUT OF ORDER. Release the maintenance request first.');
    }
    const { rows: active } = await client.query(
      'SELECT task_id FROM hk_cleaning_tasks WHERE room_id = $1 AND task_status = ANY($2)',
      [roomId, ACTIVE_STATUSES]
    );
    if (active.length) {
      throw new HttpError(409, `This room already has an open cleaning task (#${active[0].task_id}).`);
    }
    if (staffId) {
      await getHousekeeper(client, staffId);
    }
    const { rows } = await client.query(
      `INSERT INTO hk_cleaning_tasks (room_id, staff_id, task_type, priority, task_status, notes, due_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [roomId, staffId, body.taskType, body.priority || 'NORMAL', staffId ? 'ASSIGNED' : 'PENDING',
        body.notes || null, body.dueTime || null]
    );
    return rows[0];
  });
  res.status(201).json({ task });
});

// HK-004 / HK-005: update task details or (re)assign the housekeeper.
router.patch('/:id', requirePosition('SUPERVISOR'), async (req, res) => {
  const taskId = v.id(req.params.id, 'task id');
  const body = req.body;
  v.oneOf(body.taskType, TASK_TYPES, 'taskType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');

  const task = await db.withTransaction(async (client) => {
    const current = await getTask(client, taskId, true);
    if (current.task_status === 'INSPECTED') {
      throw new HttpError(409, 'This task is already inspected and closed.');
    }
    let staffId = current.staff_id;
    if (body.staffId !== undefined) {
      staffId = v.optionalId(body.staffId, 'housekeeper');
      if (staffId) {
        await getHousekeeper(client, staffId);
      }
    }
    let status = current.task_status;
    if (status === 'PENDING' && staffId) status = 'ASSIGNED';
    if (status === 'ASSIGNED' && !staffId) status = 'PENDING';

    const { rows } = await client.query(
      `UPDATE hk_cleaning_tasks
          SET staff_id = $1, task_type = $2, priority = $3, notes = $4, due_time = $5, task_status = $6
        WHERE task_id = $7 RETURNING *`,
      [staffId, body.taskType || current.task_type, body.priority || current.priority,
        body.notes !== undefined ? body.notes || null : current.notes,
        body.dueTime !== undefined ? body.dueTime || null : current.due_time, status, taskId]
    );
    return rows[0];
  });
  res.json({ task });
});

// The assigned housekeeper (or a supervisor) may update task progress.
function canWorkOn(user, task) {
  return task.staff_id === user.userId || user.position === 'SUPERVISOR' || user.role === 'ADMIN';
}

// HK-006: start cleaning.
router.post('/:id/start', async (req, res) => {
  const taskId = v.id(req.params.id, 'task id');
  const task = await db.withTransaction(async (client) => {
    const current = await getTask(client, taskId, true);
    if (!canWorkOn(req.user, current)) {
      throw new HttpError(403, 'Only the assigned housekeeper can start this task.');
    }
    if (!['ASSIGNED', 'RETURNED'].includes(current.task_status)) {
      throw new HttpError(409, `A ${current.task_status} task cannot be started. Assign a housekeeper first.`);
    }
    const { rows } = await client.query(
      `UPDATE hk_cleaning_tasks SET task_status = 'IN_PROGRESS', start_time = NOW(), completion_time = NULL
        WHERE task_id = $1 RETURNING *`,
      [taskId]
    );
    return rows[0];
  });
  res.json({ task });
});

// HK-006: cleaning completed, room becomes CLEAN and waits for inspection.
router.post('/:id/complete', async (req, res) => {
  const taskId = v.id(req.params.id, 'task id');
  const task = await db.withTransaction(async (client) => {
    const current = await getTask(client, taskId, true);
    if (!canWorkOn(req.user, current)) {
      throw new HttpError(403, 'Only the assigned housekeeper can complete this task.');
    }
    if (current.task_status !== 'IN_PROGRESS') {
      throw new HttpError(409, 'Only a task that is in progress can be marked complete.');
    }
    const { rows } = await client.query(
      `UPDATE hk_cleaning_tasks SET task_status = 'COMPLETED', completion_time = NOW()
        WHERE task_id = $1 RETURNING *`,
      [taskId]
    );
    await changeRoomStatus(client, {
      roomId: current.room_id,
      newStatus: 'CLEAN',
      staffId: req.user.userId,
      remarks: `Cleaning task #${taskId} completed`,
      manual: false,
    });
    return rows[0];
  });
  res.json({ task });
});

module.exports = router;
