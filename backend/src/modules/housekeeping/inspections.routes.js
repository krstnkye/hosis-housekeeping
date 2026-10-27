const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');
const { changeRoomStatus } = require('./roomStatus');

const router = express.Router();

// Rooms waiting for inspection: tasks that are cleaned but not yet inspected.
router.get('/queue', async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.task_id, t.task_type, t.priority, t.start_time, t.completion_time, t.notes,
            r.room_id, r.room_number, r.room_type, r.room_status,
            CONCAT(u.first_name, ' ', u.last_name) AS housekeeper,
            (SELECT COUNT(*)::int FROM hk_inspections i WHERE i.task_id = t.task_id) AS previous_inspections
       FROM hk_cleaning_tasks t
       JOIN rooms r ON r.room_id = t.room_id
       LEFT JOIN users u ON u.user_id = t.staff_id
      WHERE t.task_status = 'COMPLETED'
      ORDER BY t.completion_time`
  );
  res.json({ queue: rows });
});

// Recent inspection results.
router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.taskId) {
    params.push(v.id(req.query.taskId, 'task id'));
    where = 'WHERE i.task_id = $1';
  }
  const { rows } = await db.query(
    `SELECT i.*, r.room_number, CONCAT(u.first_name, ' ', u.last_name) AS inspector
       FROM hk_inspections i
       JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
       JOIN rooms r ON r.room_id = t.room_id
       JOIN users u ON u.user_id = i.inspected_by
      ${where}
      ORDER BY i.inspected_at DESC LIMIT 20`,
    params
  );
  res.json({ inspections: rows });
});

// HK-007: inspect a cleaned room and record the result.
// Passed -> task INSPECTED, room INSPECTED, Front Office notified.
// Failed -> task RETURNED to the housekeeper, room back to DIRTY.
router.post('/', requirePosition('INSPECTOR', 'SUPERVISOR'), async (req, res) => {
  const body = req.body;
  v.required(body, ['taskId', 'result']);
  v.oneOf(body.result, ['PASSED', 'FAILED'], 'result');
  const taskId = v.id(body.taskId, 'task id');
  if (body.result === 'FAILED' && !body.remarks) {
    throw new HttpError(400, 'Please write what needs re-cleaning when an inspection fails.');
  }
  const checklist = body.checklist && typeof body.checklist === 'object' ? body.checklist : {};

  const result = await db.withTransaction(async (client) => {
    const { rows: tasks } = await client.query(
      'SELECT * FROM hk_cleaning_tasks WHERE task_id = $1 FOR UPDATE',
      [taskId]
    );
    const task = tasks[0];
    if (!task) {
      throw new HttpError(404, 'Cleaning task not found.');
    }
    if (task.task_status !== 'COMPLETED') {
      throw new HttpError(409, 'Only completed cleaning tasks can be inspected.');
    }
    const { rows } = await client.query(
      `INSERT INTO hk_inspections (task_id, inspected_by, inspection_result, checklist, remarks)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [taskId, req.user.userId, body.result, JSON.stringify(checklist), body.remarks || null]
    );
    const passed = body.result === 'PASSED';
    await client.query('UPDATE hk_cleaning_tasks SET task_status = $1 WHERE task_id = $2', [
      passed ? 'INSPECTED' : 'RETURNED',
      taskId,
    ]);
    const room = await changeRoomStatus(client, {
      roomId: task.room_id,
      newStatus: passed ? 'INSPECTED' : 'DIRTY',
      staffId: req.user.userId,
      remarks: passed ? 'Inspection passed' : `Returned for re-cleaning: ${body.remarks}`,
      manual: false,
    });
    return { inspection: rows[0], room };
  });
  res.status(201).json(result);
});

module.exports = router;
