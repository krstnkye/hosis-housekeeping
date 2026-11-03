const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { authorize } = require('../../middleware/auth');

// Engineering's view of the maintenance requests that Housekeeping reports
// (HOSIS ENG-002 and ENG-003). Mounted under /api/housekeeping/maintenance
// for ENGINEERING accounts (ADMIN also passes).
const router = express.Router();

// GET /api/housekeeping/maintenance/incoming
// Open requests for Engineering: REPORTED and IN_PROGRESS first, then REPAIRED
// requests that are waiting for Housekeeping to release the room.
router.get('/incoming', authorize('ENGINEERING'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.request_id, m.room_id, r.room_number, r.floor_number, r.room_status,
            m.issue_category, m.issue_description, m.priority, m.status,
            m.room_set_ooo, m.reported_at, m.resolved_at,
            CONCAT(u.first_name, ' ', u.last_name) AS reported_by_name
       FROM hk_maintenance_requests m
       JOIN rooms r ON r.room_id = m.room_id
       JOIN users u ON u.user_id = m.reported_by
      WHERE m.status <> 'CLOSED'
      ORDER BY CASE m.status WHEN 'REPAIRED' THEN 1 ELSE 0 END,
               CASE m.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               m.reported_at`
  );
  res.json({ requests: rows });
});

// PATCH /api/housekeeping/maintenance/:id/status  { status: IN_PROGRESS | REPAIRED | REPORTED }
// Engineering records repair progress. REPAIRED lets Housekeeping release the room.
router.patch('/:id/status', authorize('ENGINEERING'), async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  v.required(req.body, ['status']);
  v.oneOf(req.body.status, ['REPORTED', 'IN_PROGRESS', 'REPAIRED'], 'status');
  const { rows } = await db.query(
    `UPDATE hk_maintenance_requests
        SET status = $1::varchar,
            resolved_at = CASE WHEN $1::varchar = 'REPAIRED' THEN NOW() ELSE NULL END
      WHERE request_id = $2 AND status <> 'CLOSED' RETURNING *`,
    [req.body.status, requestId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Request not found or already closed.');
  }
  res.json({ request: rows[0] });
});

module.exports = router;
