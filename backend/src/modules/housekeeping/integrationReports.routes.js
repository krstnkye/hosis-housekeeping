const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const { authorize } = require('../../middleware/auth');

const router = express.Router();

function range(query) {
  const today = new Date();
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const from = String(query.from || first);
  const to = String(query.to || next);
  if (![from, to].every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)) || from >= to) {
    throw new HttpError(400, 'Use a valid date range: from=YYYY-MM-DD&to=YYYY-MM-DD, with from before to.');
  }
  return { from, to };
}

// HR receives performance/workload totals without guest or claim details.
router.get('/integrations/hr/staff-summary', authorize('HR'), async (req, res) => {
  const dates = range(req.query);
  const { rows } = await db.query(
    `SELECT u.user_id, u.username, CONCAT(u.first_name, ' ', u.last_name) AS staff_name, u.position,
            COUNT(DISTINCT t.task_id) FILTER (WHERE t.task_status = 'INSPECTED')::int AS completed_cleaning_tasks,
            COUNT(DISTINCT i.inspection_id)::int AS inspections_recorded,
            COUNT(DISTINCT q.request_id) FILTER (WHERE q.request_status = 'COMPLETED')::int AS completed_guest_requests,
            COUNT(DISTINCT s.schedule_id)::int AS scheduled_shifts
       FROM users u
       LEFT JOIN hk_cleaning_tasks t ON t.staff_id = u.user_id AND t.assigned_date >= $1::date AND t.assigned_date < $2::date
       LEFT JOIN hk_inspections i ON i.inspected_by = u.user_id AND i.inspected_at >= $1::date AND i.inspected_at < $2::date
       LEFT JOIN hk_guest_requests q ON q.staff_id = u.user_id AND q.requested_at >= $1::date AND q.requested_at < $2::date
       LEFT JOIN hk_schedules s ON s.staff_id = u.user_id AND s.shift_date >= $1::date AND s.shift_date < $2::date
      WHERE u.role = 'HOUSEKEEPING'
      GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.position
      ORDER BY staff_name`,
    [dates.from, dates.to]
  );
  res.json({ range: dates, staff: rows });
});

// Finance receives stock quantities and movement totals, never guest data.
router.get('/integrations/finance/inventory-usage', authorize('FINANCE'), async (req, res) => {
  const dates = range(req.query);
  const { rows } = await db.query(
    `SELECT i.inv_item_id, i.item_name, i.category, i.unit, i.quantity AS current_quantity,
            i.reorder_level, (i.quantity <= i.reorder_level) AS needs_reorder,
            COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'IN'), 0)::int AS quantity_in,
            COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'OUT'), 0)::int AS quantity_used,
            COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'ADJUST'), 0)::int AS quantity_adjusted
       FROM hk_inventory_items i
       LEFT JOIN hk_inventory_movements m ON m.inv_item_id = i.inv_item_id
        AND m.moved_at >= $1::date AND m.moved_at < $2::date
      WHERE i.active
      GROUP BY i.inv_item_id
      ORDER BY i.category, i.item_name`,
    [dates.from, dates.to]
  );
  res.json({ range: dates, inventory: rows });
});

module.exports = router;
