const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

const router = express.Router();

const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT'];
const { DATE_RE, TIME_RE } = v;

function checkSchedule(body) {
  v.oneOf(body.shift, SHIFTS, 'shift');
  if (body.shiftDate !== undefined && body.shiftDate !== null) {
    v.date(body.shiftDate, 'Shift date');
  }
  for (const f of ['startTime', 'endTime']) {
    if (body[f] !== undefined && !TIME_RE.test(body[f])) {
      throw new HttpError(400, `${f} must be in HH:MM format.`);
    }
  }
  v.maxLengths(body, { assignedArea: [100, 'Assigned area'], notes: [255, 'Notes'] });
  // Only the night shift may cross midnight.
  if (body.startTime && body.endTime && body.shift !== 'NIGHT' && body.endTime <= body.startTime) {
    throw new HttpError(400, 'Shift end time must be after the start time.');
  }
}

// Minutes from midnight; a shift that ends at or before it starts runs past
// midnight (night shift), so its end moves to the next day.
function range(start, end) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 24 * 60;
  return [s, e];
}

// A staff member cannot be on two shifts at the same time. Shifts on the day
// before are checked too, because a night shift can run into this day.
async function assertNoOverlap({ staffId, shiftDate, startTime, endTime, ignoreId = null }) {
  const { rows } = await db.query(
    `SELECT schedule_id, shift, TO_CHAR(shift_date, 'YYYY-MM-DD') AS shift_date,
            TO_CHAR(start_time, 'HH24:MI') AS start_time, TO_CHAR(end_time, 'HH24:MI') AS end_time,
            (shift_date - $2::date) AS day_offset
       FROM hk_schedules
      WHERE staff_id = $1 AND shift_date BETWEEN $2::date - 1 AND $2::date + 1
        AND ($3::int IS NULL OR schedule_id <> $3)`,
    [staffId, shiftDate, ignoreId]
  );
  const [s, e] = range(startTime, endTime);
  for (const other of rows) {
    const [os, oe] = range(other.start_time, other.end_time);
    const shift = other.day_offset * 24 * 60;
    if (s < oe + shift && os + shift < e) {
      throw new HttpError(
        409,
        `This overlaps the ${other.shift.toLowerCase()} shift on ${other.shift_date} (${other.start_time}-${other.end_time}) for the same staff member.`
      );
    }
  }
}

function assertNotPast(shiftDate) {
  if (shiftDate < db.today()) {
    throw new HttpError(400, 'Shifts cannot be created or moved to a date that has already passed.');
  }
}

// HK-008: view the staff schedule for a day (defaults to today),
// with each person's cleaning task count for that day.
router.get('/', async (req, res) => {
  const date = req.query.date || db.today();
  if (!DATE_RE.test(date)) {
    throw new HttpError(400, 'date must be in YYYY-MM-DD format.');
  }
  const { rows } = await db.query(
    `SELECT s.*, TO_CHAR(s.shift_date, 'YYYY-MM-DD') AS shift_date,
            CONCAT(u.first_name, ' ', u.last_name) AS staff_name, u.position,
            (SELECT COUNT(*)::int FROM hk_cleaning_tasks t
              WHERE t.staff_id = s.staff_id AND t.assigned_date = s.shift_date) AS assigned_tasks,
            (SELECT COUNT(*)::int FROM hk_cleaning_tasks t
              WHERE t.staff_id = s.staff_id AND t.assigned_date = s.shift_date
                AND t.task_status IN ('COMPLETED', 'INSPECTED')) AS completed_tasks
       FROM hk_schedules s JOIN users u ON u.user_id = s.staff_id
      WHERE s.shift_date = $1
      ORDER BY s.start_time, staff_name`,
    [date]
  );
  const coverage = Object.fromEntries(SHIFTS.map((s) => [s, 0]));
  rows.forEach((r) => coverage[r.shift]++);
  res.json({ date, schedules: rows, coverage });
});

// HK-008 for housekeepers: the logged-in staff member's own upcoming shifts.
router.get('/mine', async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, TO_CHAR(s.shift_date, 'YYYY-MM-DD') AS shift_date,
            (SELECT COUNT(*)::int FROM hk_cleaning_tasks t
              WHERE t.staff_id = s.staff_id AND t.assigned_date = s.shift_date) AS assigned_tasks,
            (SELECT COUNT(*)::int FROM hk_cleaning_tasks t
              WHERE t.staff_id = s.staff_id AND t.assigned_date = s.shift_date
                AND t.task_status IN ('COMPLETED', 'INSPECTED')) AS completed_tasks
       FROM hk_schedules s
      WHERE s.staff_id = $1 AND s.shift_date >= CURRENT_DATE - 7
      ORDER BY s.shift_date, s.start_time`,
    [req.user.userId]
  );
  res.json({ schedules: rows });
});

// Days in a month that have at least one shift (dots on the calendar picker).
router.get('/days', async (req, res) => {
  const month = req.query.month || db.today().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new HttpError(400, 'month must be in YYYY-MM format.');
  }
  const { rows } = await db.query(
    `SELECT TO_CHAR(shift_date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS shifts
       FROM hk_schedules
      WHERE TO_CHAR(shift_date, 'YYYY-MM') = $1
      GROUP BY shift_date ORDER BY shift_date`,
    [month]
  );
  res.json({ days: rows });
});

// HK-009: create a schedule entry (assign shift and work area).
router.post('/', requirePosition('SUPERVISOR'), async (req, res) => {
  const body = req.body;
  v.required(body, ['staffId', 'shiftDate', 'shift', 'startTime', 'endTime', 'assignedArea']);
  checkSchedule(body);
  assertNotPast(body.shiftDate);
  const staffId = v.id(body.staffId, 'staff');
  const { rows: staff } = await db.query(
    `SELECT user_id FROM users WHERE user_id = $1 AND role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'`,
    [staffId]
  );
  if (!staff[0]) {
    throw new HttpError(400, 'Schedules can only be created for active housekeeping staff.');
  }
  await assertNoOverlap({ staffId, shiftDate: body.shiftDate, startTime: body.startTime, endTime: body.endTime });
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
  const { rows: found } = await db.query(
    `SELECT *, TO_CHAR(shift_date, 'YYYY-MM-DD') AS shift_date_text FROM hk_schedules WHERE schedule_id = $1`,
    [scheduleId]
  );
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
  checkSchedule({ ...merged, assignedArea: req.body.assignedArea, notes: req.body.notes });
  // Moving a shift to another day must not move it into the past. Editing the
  // notes or area of a shift that already happened is still allowed.
  if (merged.shiftDate && merged.shiftDate !== current.shift_date_text) {
    assertNotPast(merged.shiftDate);
  }
  await assertNoOverlap({
    staffId: current.staff_id,
    shiftDate: merged.shiftDate || current.shift_date_text,
    startTime: merged.startTime,
    endTime: merged.endTime,
    ignoreId: scheduleId,
  });
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
