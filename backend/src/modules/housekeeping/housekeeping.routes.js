const express = require('express');
const db = require('../../config/db');
const { authenticate, authorize, requirePasswordChanged } = require('../../middleware/auth');

const router = express.Router();

// All Housekeeping endpoints need a logged-in user.
router.use(authenticate);
// A temporary password (set by a supervisor) must be changed first.
router.use(requirePasswordChanged);

// Integration endpoints for other HOSIS departments. Each route checks its own
// role, so these are mounted before the HOUSEKEEPING-only gate below.
router.use(require('./frontOffice.routes'));
router.use('/maintenance', require('./engineering.routes'));

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
    `SELECT * FROM (
       SELECT 'ROOM_READY' AS type, n.message, n.created_at AS at, 'rooms' AS page
         FROM hk_front_office_notifications n
        WHERE n.created_at > NOW() - INTERVAL '1 day' AND n.notice_type = 'ROOM_READY'
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
     ORDER BY at DESC NULLS LAST LIMIT 15`,
    [
      req.user.userId,
      ['INSPECTOR', 'SUPERVISOR'].includes(req.user.position) || req.user.role === 'ADMIN',
      req.user.position === 'SUPERVISOR' || req.user.role === 'ADMIN',
    ]
  );
  res.json({ alerts: rows });
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

// Lookups for dropdowns.
router.get('/staff', async (req, res) => {
  const { rows } = await db.query(
    `SELECT user_id, CONCAT(first_name, ' ', last_name) AS name, position
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
