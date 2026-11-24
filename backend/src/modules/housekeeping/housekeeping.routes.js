const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authenticate, authorize, requirePosition, requirePasswordChanged } = require('../../middleware/auth');

const router = express.Router();

function reportWindow(period, anchorText) {
  const value = String(period || '').toUpperCase();
  if (!['WEEKLY', 'MONTHLY', 'ANNUAL'].includes(value)) {
    throw new HttpError(400, 'Report period must be WEEKLY, MONTHLY or ANNUAL.');
  }
  const anchor = String(anchorText || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(Date.parse(`${anchor}T00:00:00Z`))) {
    throw new HttpError(400, 'Report anchor must be a valid YYYY-MM-DD date.');
  }
  const day = new Date(`${anchor}T00:00:00Z`);
  let start;
  let end;
  if (value === 'WEEKLY') {
    const mondayOffset = (day.getUTCDay() + 6) % 7;
    start = new Date(day);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (value === 'MONTHLY') {
    start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  } else {
    start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1));
  }
  return { period: value, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

// All Housekeeping endpoints need a logged-in user.
router.use(authenticate);
// A temporary password (set by a supervisor) must be changed first.
router.use(requirePasswordChanged);

// Integration endpoints for other HOSIS departments. Each route checks its own
// role, so these are mounted before the HOUSEKEEPING-only gate below.
router.use(require('./frontOffice.routes'));
router.use('/maintenance', require('./engineering.routes'));
router.use(require('./integrationReports.routes'));
router.use(require('./workflows.routes'));

// Everything else is for HOUSEKEEPING (or ADMIN) users only.
router.use(authorize('HOUSEKEEPING'));

// Housekeeping Dashboard: counts shown on the Overview page.
router.get('/dashboard', async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM rooms WHERE room_status = 'DIRTY')::int AS dirty_rooms,
       (SELECT COUNT(*) FROM rooms WHERE room_status = 'OUT_OF_ORDER')::int AS out_of_order_rooms,
       (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE task_status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED'))::int AS open_tasks,
       (SELECT COUNT(*) FROM hk_cleaning_tasks WHERE task_status = 'COMPLETED')::int AS awaiting_inspection,
       (SELECT COUNT(*) FROM hk_guest_requests WHERE request_status <> 'COMPLETED')::int AS open_requests,
       (SELECT COUNT(*) FROM hk_lost_found_items WHERE item_status = 'STORED')::int AS stored_items,
       (SELECT COUNT(*) FROM hk_maintenance_requests WHERE status <> 'CLOSED')::int AS open_maintenance,
       (SELECT COUNT(*) FROM hk_cleaning_tasks
         WHERE staff_id = $1 AND task_status IN ('ASSIGNED', 'IN_PROGRESS', 'RETURNED'))::int AS my_tasks,
       (SELECT COUNT(*) FROM hk_inventory_items WHERE active AND quantity <= reorder_level)::int AS low_stock_items`,
    [req.user.userId]
  );
  res.json({ stats: rows[0] });
});

// Notification bell: things that need this user's attention right now.
router.get('/alerts', async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*,
            (p.read_through IS NOT NULL AND a.at <= p.read_through) AS is_read
       FROM (
       SELECT 'ROOM_READY' AS type, n.message, n.created_at AS at, 'rooms' AS page
         FROM hk_front_office_notifications n
        WHERE n.created_at > NOW() - INTERVAL '1 day' AND n.notice_type = 'ROOM_READY' AND n.read_at IS NULL
       UNION ALL
       SELECT 'TASK', CONCAT('Room ', r.room_number, ': ', LOWER(REPLACE(t.task_type, '_', ' ')),
              CASE WHEN t.task_status = 'RETURNED' THEN ' returned for re-cleaning' ELSE ' assigned to you' END),
              t.created_at, 'tasks'
         FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id
        WHERE t.staff_id = $1 AND t.task_status IN ('ASSIGNED', 'RETURNED')
       UNION ALL
       SELECT 'INSPECTION', CONCAT('Room ', r.room_number, ' is waiting for inspection'), t.completion_time, 'inspection'
         FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id
        WHERE t.task_status = 'COMPLETED' AND $2
       UNION ALL
       SELECT 'REQUEST', CONCAT('Room ', r.room_number, ': ', LOWER(REPLACE(q.request_type, '_', ' ')), ' request (', LOWER(q.priority), ')'),
              q.requested_at, 'requests'
         FROM hk_guest_requests q JOIN rooms r ON r.room_id = q.room_id
        WHERE q.request_status = 'OPEN'
       UNION ALL
       SELECT 'MAINTENANCE', CONCAT('Room ', r.room_number, ' repair finished, ready to release'), m.resolved_at, 'maintenance'
         FROM hk_maintenance_requests m JOIN rooms r ON r.room_id = m.room_id
        WHERE m.status = 'REPAIRED'
       UNION ALL
       SELECT 'STOCK', CONCAT(i.item_name, ' is low: ', i.quantity, ' ', i.unit, ' left (reorder at ', i.reorder_level, ')'),
              COALESCE((SELECT MAX(m.moved_at) FROM hk_inventory_movements m WHERE m.inv_item_id = i.inv_item_id), i.created_at),
              'requests'
         FROM hk_inventory_items i
        WHERE i.active AND i.quantity <= i.reorder_level AND $3
       UNION ALL
       SELECT 'PASSWORD', CONCAT(u.first_name, ' ', u.last_name, ' forgot their password'), p.requested_at, 'staff-accounts'
         FROM hk_password_resets p JOIN users u ON u.user_id = p.user_id
        WHERE p.status = 'REQUESTED' AND $3
     ) a
     LEFT JOIN hk_alert_preferences p ON p.user_id = $1
     ORDER BY a.at DESC NULLS LAST LIMIT 100`,
    [
      req.user.userId,
      ['INSPECTOR', 'SUPERVISOR'].includes(req.user.position) || req.user.role === 'ADMIN',
      req.user.position === 'SUPERVISOR' || req.user.role === 'ADMIN',
    ]
  );
  res.json({ alerts: rows });
});

router.put('/alerts/read-state', async (req, res) => {
  if (typeof req.body?.read !== 'boolean') {
    throw new HttpError(400, 'read must be true or false.');
  }
  if (req.body.read) {
    await db.query(
      `INSERT INTO hk_alert_preferences (user_id, read_through, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET read_through = EXCLUDED.read_through, updated_at = NOW()`,
      [req.user.userId]
    );
  } else {
    await db.query('DELETE FROM hk_alert_preferences WHERE user_id = $1', [req.user.userId]);
  }
  res.json({ read: req.body.read });
});

// Recent activity: the latest room status changes (shown on the Inspection page).
router.get('/activity', async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.log_id, l.previous_status, l.new_status, l.remarks, l.changed_at, r.room_number,
            CONCAT(u.first_name, ' ', u.last_name) AS changed_by
       FROM hk_room_status_logs l
       JOIN rooms r ON r.room_id = l.room_id
       LEFT JOIN users u ON u.user_id = l.staff_id
      ORDER BY l.changed_at DESC, l.log_id DESC LIMIT 15`
  );
  res.json({ activity: rows });
});

// Supervisor report and audit trail. This is read from the operational tables
// themselves, so exported reports always match the records used by each page.
router.get('/audit', requirePosition('SUPERVISOR'), async (req, res) => {
  const category = String(req.query.category || '').trim().toUpperCase() || null;
  const search = String(req.query.search || '').trim().slice(0, 100) || null;
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 500);
  const report = reportWindow(req.query.period || 'WEEKLY', req.query.anchor);
  const { rows } = await db.query(
    `WITH events AS (
       SELECT CONCAT('ROOM-', l.log_id) AS event_id, 'ROOM_STATUS' AS category,
              CONCAT('Room ', r.room_number) AS reference,
              CONCAT(REPLACE(l.previous_status, '_', ' '), ' to ', REPLACE(l.new_status, '_', ' '),
                     CASE WHEN l.remarks IS NULL THEN '' ELSE CONCAT(' - ', l.remarks) END) AS details,
              COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'System') AS actor, l.changed_at AS occurred_at
         FROM hk_room_status_logs l JOIN rooms r ON r.room_id = l.room_id
         LEFT JOIN users u ON u.user_id = l.staff_id
       UNION ALL
       SELECT CONCAT('TASK-', t.task_id), 'CLEANING_TASK', CONCAT('Room ', r.room_number, ' / Task #', t.task_id),
              CONCAT(REPLACE(t.task_type, '_', ' '), ' - ', REPLACE(t.task_status, '_', ' ')),
              COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Unassigned'), t.created_at
         FROM hk_cleaning_tasks t JOIN rooms r ON r.room_id = t.room_id
         LEFT JOIN users u ON u.user_id = t.staff_id
       UNION ALL
       SELECT CONCAT('INSPECTION-', i.inspection_id), 'INSPECTION', CONCAT('Room ', r.room_number, ' / Task #', t.task_id),
              CONCAT(i.inspection_result, CASE WHEN i.remarks IS NULL THEN '' ELSE CONCAT(' - ', i.remarks) END),
              CONCAT(u.first_name, ' ', u.last_name), i.inspected_at
         FROM hk_inspections i JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
         JOIN rooms r ON r.room_id = t.room_id JOIN users u ON u.user_id = i.inspected_by
       UNION ALL
       SELECT CONCAT('REQUEST-', q.request_id), 'GUEST_REQUEST', CONCAT('Room ', r.room_number, ' / Request #', q.request_id),
              CONCAT(REPLACE(q.request_type, '_', ' '), ' - ', REPLACE(q.request_status, '_', ' '), ' - ', q.request_details),
              COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Unassigned'), q.requested_at
         FROM hk_guest_requests q JOIN rooms r ON r.room_id = q.room_id LEFT JOIN users u ON u.user_id = q.staff_id
       UNION ALL
       SELECT CONCAT('LOST-', f.item_id), 'LOST_FOUND', CONCAT('Item ', f.storage_label),
              CONCAT(f.item_description, ' - ', f.item_status, ' - ', f.found_location),
              CONCAT(u.first_name, ' ', u.last_name), f.found_at
         FROM hk_lost_found_items f JOIN users u ON u.user_id = f.found_by
       UNION ALL
       SELECT CONCAT('CLAIM-', c.claim_id), 'ITEM_CLAIM', CONCAT('Item ', f.storage_label, ' / Claim #', c.claim_id),
              CONCAT(c.claim_status, ' claim by ', c.claimant_name), CONCAT(u.first_name, ' ', u.last_name), c.claimed_at
         FROM hk_item_claims c JOIN hk_lost_found_items f ON f.item_id = c.item_id
         JOIN users u ON u.user_id = c.processed_by
       UNION ALL
       SELECT CONCAT('MAINT-', m.request_id), 'MAINTENANCE', CONCAT('Room ', r.room_number, ' / Request #', m.request_id),
              CONCAT(m.issue_category, ' - ', m.status, ' - ', m.issue_description),
              CONCAT(u.first_name, ' ', u.last_name), m.reported_at
         FROM hk_maintenance_requests m JOIN rooms r ON r.room_id = m.room_id JOIN users u ON u.user_id = m.reported_by
       UNION ALL
       SELECT CONCAT('STOCK-', m.movement_id), 'INVENTORY', CONCAT(i.item_name, ' / Movement #', m.movement_id),
              CONCAT(m.movement_type, ' ', m.quantity, ' ', i.unit, '; balance ', m.balance_after,
                     CASE WHEN m.remarks IS NULL THEN '' ELSE CONCAT(' - ', m.remarks) END),
              CONCAT(u.first_name, ' ', u.last_name), m.moved_at
         FROM hk_inventory_movements m JOIN hk_inventory_items i ON i.inv_item_id = m.inv_item_id
         JOIN users u ON u.user_id = m.staff_id
       UNION ALL
       SELECT CONCAT('SCHEDULE-', s.schedule_id), 'SCHEDULE', CONCAT('Shift #', s.schedule_id, ' / ', s.assigned_area),
              CONCAT(s.shift, ' shift, ', s.start_time, ' to ', s.end_time),
              CONCAT(u.first_name, ' ', u.last_name), (s.shift_date + s.start_time)
         FROM hk_schedules s JOIN users u ON u.user_id = s.staff_id
     )
     SELECT * FROM events
      WHERE ($1::text IS NULL OR category = $1)
        AND ($2::text IS NULL OR reference ILIKE CONCAT('%', $2, '%')
             OR details ILIKE CONCAT('%', $2, '%') OR actor ILIKE CONCAT('%', $2, '%'))
        AND occurred_at >= $3::date AND occurred_at < $4::date
      ORDER BY occurred_at DESC, event_id DESC LIMIT $5`,
    [category, search, report.from, report.to, limit]
  );
  res.json({ events: rows, report });
});

// Lookups for dropdowns.
router.get('/staff', async (req, res) => {
  const { rows } = await db.query(
    `SELECT user_id, username, email, CONCAT(first_name, ' ', last_name) AS name, position
       FROM users WHERE role = 'HOUSEKEEPING' AND employment_status = 'ACTIVE'
      ORDER BY position, name`
  );
  res.json({ staff: rows });
});

// Limited guest info needed for housekeeping work only
// (class HOSIS HK-011; see docs/housekeeping/REQUIREMENTS-MAPPING.md).
router.get('/guests', async (req, res) => {
  const { rows } = await db.query(
    `SELECT guest_id, CONCAT(first_name, ' ', last_name) AS name FROM guests ORDER BY name`
  );
  res.json({ guests: rows });
});

router.use('/rooms', require('./rooms.routes'));
router.use('/tasks', require('./tasks.routes'));
router.use('/inspections', require('./inspections.routes'));
router.use('/schedules', require('./schedules.routes'));
router.use('/guest-requests', require('./guestRequests.routes'));
router.use('/lost-found', require('./lostFound.routes'));
router.use('/maintenance', require('./maintenance.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/password-resets', require('./passwordResets.routes'));
router.use(require('./me.routes'));

module.exports = router;
