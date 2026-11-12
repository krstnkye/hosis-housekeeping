const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

// Reports and history for supervisors and inspectors: what was done between
// two dates, how long it took, and who did it.
const router = express.Router();

router.use(requirePosition('SUPERVISOR', 'INSPECTOR'));

const MAX_DAYS = 92;

function dateRange(query) {
  const today = db.today();
  const to = query.to ? v.date(query.to, 'To date') : today;
  const from = query.from ? v.date(query.from, 'From date') : shift(to, -6);
  if (from > to) {
    throw new HttpError(400, 'The From date must be on or before the To date.');
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > MAX_DAYS) {
    throw new HttpError(400, `Choose a range of ${MAX_DAYS} days or fewer.`);
  }
  return { from, to };
}

function shift(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to the last 7 days)
router.get('/summary', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const p = [from, to];
  const inRange = (col) => `${col} >= $1::date AND ${col} < $2::date + 1`;

  const [totals, daily, staff] = await Promise.all([
    db.query(
      `SELECT
         (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE ${inRange('completion_time')})::int AS tasks_completed,
         (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completion_time - start_time)) / 60))
            FROM hk_cleaning_tasks WHERE ${inRange('completion_time')} AND start_time IS NOT NULL)::int AS avg_clean_minutes,
         (SELECT COUNT(*) FROM hk_inspections WHERE ${inRange('inspected_at')} AND inspection_result = 'PASSED')::int AS inspections_passed,
         (SELECT COUNT(*) FROM hk_inspections WHERE ${inRange('inspected_at')} AND inspection_result = 'FAILED')::int AS inspections_failed,
         (SELECT COUNT(*) FROM hk_guest_requests WHERE ${inRange('requested_at')})::int AS requests_received,
         (SELECT COUNT(*) FROM hk_guest_requests WHERE ${inRange('completed_at')})::int AS requests_completed,
         (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - requested_at)) / 60))
            FROM hk_guest_requests WHERE ${inRange('completed_at')})::int AS avg_request_minutes,
         (SELECT COUNT(*) FROM hk_maintenance_requests WHERE ${inRange('reported_at')})::int AS maintenance_reported,
         (SELECT COUNT(*) FROM hk_lost_found_items WHERE ${inRange('found_at')})::int AS items_found,
         (SELECT COUNT(*) FROM hk_item_claims WHERE ${inRange('released_at')})::int AS items_released,
         (SELECT COUNT(*) FROM hk_lost_found_items WHERE ${inRange('disposed_at')})::int AS items_disposed,
         (SELECT COUNT(*) FROM hk_room_status_logs WHERE ${inRange('changed_at')})::int AS status_changes`,
      p
    ),
    db.query(
      `SELECT TO_CHAR(d, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE completion_time::date = d)::int AS tasks_completed,
              (SELECT COUNT(*) FROM hk_inspections WHERE inspected_at::date = d AND inspection_result = 'PASSED')::int AS passed,
              (SELECT COUNT(*) FROM hk_inspections WHERE inspected_at::date = d AND inspection_result = 'FAILED')::int AS failed,
              (SELECT COUNT(*) FROM hk_guest_requests WHERE completed_at::date = d)::int AS requests_completed
         FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d
        ORDER BY d`,
      p
    ),
    db.query(
      `SELECT u.user_id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.position,
              (SELECT COUNT(*) FROM hk_cleaning_tasks t WHERE t.staff_id = u.user_id AND ${inRange('t.completion_time')})::int AS tasks_completed,
              (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (t.completion_time - t.start_time)) / 60)) FROM hk_cleaning_tasks t
                WHERE t.staff_id = u.user_id AND ${inRange('t.completion_time')} AND t.start_time IS NOT NULL)::int AS avg_clean_minutes,
              (SELECT COUNT(*) FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
                WHERE t.staff_id = u.user_id AND ${inRange('i.inspected_at')} AND i.inspection_result = 'PASSED')::int AS passed,
              (SELECT COUNT(*) FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
                WHERE t.staff_id = u.user_id AND ${inRange('i.inspected_at')} AND i.inspection_result = 'FAILED')::int AS failed,
              (SELECT COUNT(*) FROM hk_guest_requests q WHERE q.staff_id = u.user_id AND ${inRange('q.completed_at')})::int AS requests_completed,
              (SELECT COUNT(*) FROM hk_schedules s WHERE s.staff_id = u.user_id AND s.shift_date BETWEEN $1::date AND $2::date)::int AS shifts
         FROM users u
        WHERE u.role = 'HOUSEKEEPING' AND u.employment_status = 'ACTIVE'
        ORDER BY u.position = 'HOUSEKEEPER' DESC, name`,
      p
    ),
  ]);
  res.json({ from, to, totals: totals.rows[0], daily: daily.rows, staff: staff.rows });
});

// GET /reports/history?type=tasks|inspections|status&from=&to=&search=
// Every finished task, inspection or room status change in the range,
// newest first (up to 500 rows).
const HISTORY = {
  tasks: {
    sql: `SELECT t.task_id AS id, t.completion_time AS at, r.room_number, t.task_type, t.priority, t.task_status,
                 CONCAT(u.first_name, ' ', u.last_name) AS staff_name, t.start_time, t.completion_time,
                 ROUND(EXTRACT(EPOCH FROM (t.completion_time - t.start_time)) / 60)::int AS minutes, t.notes
            FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id LEFT JOIN users u ON u.user_id = t.staff_id
           WHERE t.completion_time >= $1::date AND t.completion_time < $2::date + 1`,
    search: `(r.room_number ILIKE $3 OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $3)`,
  },
  inspections: {
    sql: `SELECT i.inspection_id AS id, i.inspected_at AS at, r.room_number, i.inspection_result, i.remarks,
                 CONCAT(c.first_name, ' ', c.last_name) AS staff_name, CONCAT(u.first_name, ' ', u.last_name) AS inspector
            FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
            JOIN rooms r ON r.room_id = t.room_id JOIN users u ON u.user_id = i.inspected_by
            LEFT JOIN users c ON c.user_id = t.staff_id
           WHERE i.inspected_at >= $1::date AND i.inspected_at < $2::date + 1`,
    search: `(r.room_number ILIKE $3 OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $3 OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $3)`,
  },
  status: {
    sql: `SELECT l.log_id AS id, l.changed_at AS at, r.room_number, l.previous_status, l.new_status, l.remarks,
                 CONCAT(u.first_name, ' ', u.last_name) AS staff_name
            FROM hk_room_status_logs l JOIN rooms r ON r.room_id = l.room_id LEFT JOIN users u ON u.user_id = l.staff_id
           WHERE l.changed_at >= $1::date AND l.changed_at < $2::date + 1`,
    search: `(r.room_number ILIKE $3 OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $3)`,
  },
};

router.get('/history', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const type = req.query.type || 'tasks';
  v.oneOf(type, Object.keys(HISTORY), 'type');
  const q = HISTORY[type];
  const params = [from, to];
  let sql = q.sql;
  if (req.query.search) {
    params.push(`%${String(req.query.search).slice(0, 50)}%`);
    sql += ` AND ${q.search}`;
  }
  const { rows } = await db.query(`${sql} ORDER BY at DESC LIMIT 500`, params);
  res.json({ from, to, type, rows });
});

module.exports = router;
