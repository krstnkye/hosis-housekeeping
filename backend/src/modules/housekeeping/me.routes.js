const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');

// The signed-in staff member's own records: personal work record and the room
// condition reports they sent to Front Office and Maintenance.
const router = express.Router();

// Room conditions a staff member can report (Report Room Condition page).
const CONDITIONS = ['DAMAGED', 'MISSING_ITEMS', 'STAINS_ODOR', 'SMOKING', 'PEST', 'SAFETY_HAZARD', 'EXCESSIVE_MESS', 'OTHER'];

// GET /api/housekeeping/me/record: personal record for the signed-in user.
router.get('/me/record', async (req, res) => {
  const userId = req.user.userId;
  const [profile, totals, month, inspections, recent] = await Promise.all([
    db.query(
      `SELECT user_id, username, email, first_name, last_name, role, position, employment_status, created_at
         FROM users WHERE user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT
         (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE staff_id = $1 AND task_status IN ('COMPLETED', 'INSPECTED'))::int AS tasks_completed,
         (SELECT COUNT(*) FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
           WHERE t.staff_id = $1 AND i.inspection_result = 'PASSED')::int AS inspections_passed,
         (SELECT COUNT(*) FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
           WHERE t.staff_id = $1 AND i.inspection_result = 'FAILED')::int AS inspections_failed,
         (SELECT COUNT(*) FROM hk_guest_requests WHERE staff_id = $1 AND request_status = 'COMPLETED')::int AS requests_completed,
         (SELECT COUNT(*) FROM hk_lost_found_items WHERE found_by = $1)::int AS items_found,
         (SELECT COUNT(*) FROM hk_maintenance_requests WHERE reported_by = $1)::int AS issues_reported,
         (SELECT COUNT(*) FROM hk_front_office_notifications WHERE created_by = $1 AND notice_type = 'ROOM_CONDITION')::int AS conditions_reported,
         (SELECT COUNT(*) FROM hk_schedules WHERE staff_id = $1 AND shift_date <= CURRENT_DATE)::int AS shifts_worked`,
      [userId]
    ),
    db.query(
      `SELECT
         (SELECT COUNT(*) FROM hk_schedules WHERE staff_id = $1
           AND date_trunc('month', shift_date) = date_trunc('month', CURRENT_DATE))::int AS shifts_this_month,
         (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE staff_id = $1 AND task_status IN ('COMPLETED', 'INSPECTED')
           AND date_trunc('month', completion_time) = date_trunc('month', CURRENT_DATE))::int AS tasks_this_month`,
      [userId]
    ),
    db.query(
      `SELECT i.inspection_id, i.inspection_result, i.remarks, i.inspected_at, r.room_number, t.task_type,
              CONCAT(u.first_name, ' ', u.last_name) AS inspector
         FROM hk_inspections i
         JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
         JOIN rooms r ON r.room_id = t.room_id
         JOIN users u ON u.user_id = i.inspected_by
        WHERE t.staff_id = $1
        ORDER BY i.inspected_at DESC LIMIT 10`,
      [userId]
    ),
    db.query(
      `SELECT * FROM (
         SELECT 'TASK' AS type, CONCAT('Cleaned Room ', r.room_number, ' (', LOWER(REPLACE(t.task_type, '_', ' ')), ')') AS text, t.completion_time AS at
           FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id
          WHERE t.staff_id = $1 AND t.completion_time IS NOT NULL
         UNION ALL
         SELECT 'REQUEST', CONCAT('Completed ', LOWER(REPLACE(q.request_type, '_', ' ')), ' request for Room ', r.room_number), q.completed_at
           FROM hk_guest_requests q JOIN rooms r ON r.room_id = q.room_id
          WHERE q.staff_id = $1 AND q.completed_at IS NOT NULL
         UNION ALL
         SELECT 'LOST_FOUND', CONCAT('Recorded found item ', l.storage_label, ': ', l.item_description), l.found_at
           FROM hk_lost_found_items l WHERE l.found_by = $1
         UNION ALL
         SELECT 'MAINTENANCE', CONCAT('Reported ', LOWER(m.issue_category), ' issue in Room ', r.room_number), m.reported_at
           FROM hk_maintenance_requests m JOIN rooms r ON r.room_id = m.room_id WHERE m.reported_by = $1
         UNION ALL
         SELECT 'ROOM_CONDITION', CONCAT('Reported Room ', r.room_number, ' condition to Front Office'), n.created_at
           FROM hk_front_office_notifications n JOIN rooms r ON r.room_id = n.room_id
          WHERE n.created_by = $1 AND n.notice_type = 'ROOM_CONDITION'
       ) a ORDER BY at DESC LIMIT 15`,
      [userId]
    ),
  ]);
  if (!profile.rows[0]) {
    throw new HttpError(404, 'Account not found.');
  }
  res.json({
    profile: profile.rows[0],
    totals: { ...totals.rows[0], ...month.rows[0] },
    inspections: inspections.rows,
    recent: recent.rows,
  });
});

// GET /api/housekeeping/me/reports: room condition reports this user sent to
// Front Office and maintenance requests they reported, newest first.
router.get('/me/reports', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT 'FRONT_OFFICE' AS sent_to, n.notification_id AS id, r.room_number, n.message AS details,
              CASE WHEN n.read_at IS NULL THEN 'SENT' ELSE 'SEEN' END AS status, n.created_at AS reported_at
         FROM hk_front_office_notifications n JOIN rooms r ON r.room_id = n.room_id
        WHERE n.created_by = $1 AND n.notice_type = 'ROOM_CONDITION'
       UNION ALL
       SELECT 'MAINTENANCE', m.request_id, r.room_number, m.issue_description, m.status, m.reported_at
         FROM hk_maintenance_requests m JOIN rooms r ON r.room_id = m.room_id
        WHERE m.reported_by = $1
     ) a ORDER BY reported_at DESC LIMIT 20`,
    [req.user.userId]
  );
  res.json({ reports: rows });
});

// POST /api/housekeeping/room-reports  { roomId, condition, details }
// Report a room's condition to Front Office. It reaches Front Office through
// GET /notifications as a ROOM_CONDITION notice. Repairs go to Engineering
// through POST /maintenance instead.
router.post('/room-reports', async (req, res) => {
  const body = req.body || {};
  v.required(body, ['roomId', 'condition', 'details']);
  v.oneOf(body.condition, CONDITIONS, 'condition');
  const roomId = v.id(body.roomId, 'room');
  const details = String(body.details).trim();
  if (!details) {
    throw new HttpError(400, 'Describe the room condition.');
  }
  const { rows: rooms } = await db.query('SELECT room_number FROM rooms WHERE room_id = $1', [roomId]);
  if (!rooms[0]) {
    throw new HttpError(404, 'Room not found.');
  }
  const condition = body.condition.replace(/_/g, ' ').toLowerCase();
  const message = `Room ${rooms[0].room_number} condition (${condition}): ${details}`.slice(0, 255);
  const { rows } = await db.query(
    `INSERT INTO hk_front_office_notifications (room_id, notice_type, message, created_by)
     VALUES ($1, 'ROOM_CONDITION', $2, $3) RETURNING *`,
    [roomId, message, req.user.userId]
  );
  res.status(201).json({ notification: rows[0] });
});

module.exports = router;
