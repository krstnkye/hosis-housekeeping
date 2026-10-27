const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

const router = express.Router();

const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function checkSchedule(body) {
  v.oneOf(body.shift, SHIFTS, 'shift');
  if (body.shiftDate !== undefined && !DATE_RE.test(body.shiftDate)) {
    throw new HttpError(400, 'shiftDate must be in YYYY-MM-DD format.');
  }
  for (const f of ['startTime', 'endTime']) {
    if (body[f] !== undefined && !TIME_RE.test(body[f])) {
      throw new HttpError(400, `${f} must be in HH:MM format.`);
    }
  }
  // Only the night shift may cross midnight.
  if (body.startTime && body.endTime && body.shift !== 'NIGHT' && body.endTime <= body.startTime) {
    throw new HttpError(400, 'Shift end time must be after the start time.');
  }
}

// HK-008: view the staff schedule for a day (defaults to today),
// with each person's cleaning task count for that day.
router.get('/', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) {
    throw new HttpError(400, 'date must be in YYYY-MM-DD format.');
  }
  const { rows } = await db.query(
    `SELECT s.*, TO_CHAR(s.shift_date, 'YYYY-MM-DD') AS shift_date,
            CONCAT(u.first_name, ' ', u.last_name) AS staff_name, u.position,
            (SELECT COUNT(*)::int FROM hk_cleaning_tasks t
              WHERE t.staff_id = s.staff_id AND t.assigned_date = s.shift_date) AS assigned_tasks
       FROM hk_schedules s JOIN users u ON u.user_id = s.staff_id
      WHERE s.shift_date = $1
      ORDER BY s.start_time, staff_name`,
    [date]
  );
  const coverage = Object.fromEntries(SHIFTS.map((s) => [s, 0]));
  rows.forEach((r) => coverage[r.shift]++);
  res.json({ date, schedules: rows, coverage });
});

// HK-009: create a schedule entry (assign shift and work area).
router.post('/', requirePosition('SUPERVISOR'), async (req, res) => {
  const body = req.body;
  v.required(body, ['staffId', 'shiftDate', 'shift', 'startTime', 'endTime', 'assignedArea']);
  checkSchedule(body);
  const staffId = v.id(body.staffId, 'staff');
  const { rows: staff } = await db.query(
    `SELECT user_id FROM users WHERE user_id = $1 AND role = 'HOUSEKEEPING'`,
    [staffId]
  );
  if (!staff[0]) {
    throw new HttpError(400, 'Schedules can only be created for housekeeping staff.');
  }
  const { rows } = await db.query(
    `INSERT INTO hk_schedules (staff_id, shift_date, shift, start_time, end_time, assigned_area, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [staffId, body.shiftDate, body.shift, body.startTime, body.endTime, body.assignedArea, body.notes || null]
  );
  res.status(201).json({ schedule: rows[0] });
});

// HK-009: update a schedule entry.
router.patch('/:id', requirePosition('SUPERVISOR'), async (req, res) => {
  const scheduleId = v.id(req.params.id, 'schedule id');
  const { rows: found } = await db.query('SELECT * FROM hk_schedules WHERE schedule_id = $1', [scheduleId]);
  const current = found[0];
  if (!current) {
    throw new HttpError(404, 'Schedule not found.');
  }
  const merged = {
    shift: req.body.shift || current.shift,
    shiftDate: req.body.shiftDate,
    startTime: req.body.startTime || current.start_time.slice(0, 5),
    endTime: req.body.endTime || current.end_time.slice(0, 5),
  };
  checkSchedule(merged);
  const { rows } = await db.query(
    `UPDATE hk_schedules
        SET shift_date = COALESCE($1, shift_date), shift = $2, start_time = $3, end_time = $4,
            assigned_area = COALESCE($5, assigned_area), notes = $6
      WHERE schedule_id = $7 RETURNING *`,
    [merged.shiftDate || null, merged.shift, merged.startTime, merged.endTime,
      req.body.assignedArea || null, req.body.notes !== undefined ? req.body.notes || null : current.notes,
      scheduleId]
  );
  res.json({ schedule: rows[0] });
});

router.delete('/:id', requirePosition('SUPERVISOR'), async (req, res) => {
  const scheduleId = v.id(req.params.id, 'schedule id');
  const { rowCount } = await db.query('DELETE FROM hk_schedules WHERE schedule_id = $1', [scheduleId]);
  if (!rowCount) {
    throw new HttpError(404, 'Schedule not found.');
  }
  res.status(204).end();
});

module.exports = router;
