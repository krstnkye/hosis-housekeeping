const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { assertHousekeepingStaff } = require('./staff');

const router = express.Router();

// Optional stock for a request (e.g. 2 bath towels). Both or neither.
async function readStock(client, body, current = {}) {
  const itemGiven = body.invItemId !== undefined;
  const qtyGiven = body.quantity !== undefined;
  if (!itemGiven && !qtyGiven) {
    return { itemId: current.inv_item_id || null, quantity: current.quantity_requested || null };
  }
  const itemId = itemGiven ? v.optionalId(body.invItemId, 'stock item') : current.inv_item_id;
  if (!itemId) {
    return { itemId: null, quantity: null };
  }
  const quantity = v.int(qtyGiven ? body.quantity : current.quantity_requested, 'Quantity requested', { min: 1, max: 999 });
  const { rows } = await client.query('SELECT 1 FROM hk_inventory_items WHERE inv_item_id = $1 AND active', [itemId]);
  if (!rows[0]) {
    throw new HttpError(400, 'Choose a stock item from the inventory list.');
  }
  return { itemId, quantity };
}

const REQUEST_TYPES = ['TOWELS', 'AMENITIES', 'EXTRA_BED', 'CLEANING', 'LAUNDRY', 'OTHER'];

// Supervisors (and inspectors, who lead the floor) may assign any request.
// A housekeeper may take an unassigned request for themselves and work on
// their own requests, but cannot reassign or close someone else's.
function canManage(user) {
  return user.role === 'ADMIN' || ['SUPERVISOR', 'INSPECTOR'].includes(user.position);
}

const REQUEST_SELECT = `
  SELECT q.*, r.room_number,
         CONCAT(g.first_name, ' ', g.last_name) AS guest_name,
         CONCAT(u.first_name, ' ', u.last_name) AS assigned_to,
         i.item_name, i.unit, i.category AS item_category, i.quantity AS on_hand, i.reorder_level
    FROM hk_guest_requests q
    LEFT JOIN hk_inventory_items i ON i.inv_item_id = q.inv_item_id
    JOIN rooms r ON r.room_id = q.room_id
    LEFT JOIN guests g ON g.guest_id = q.guest_id
    LEFT JOIN users u ON u.user_id = q.staff_id`;

// Open requests (default), completed requests for today (?view=completed),
// or every request (?view=all).
const VIEWS = {
  open: [`q.request_status <> 'COMPLETED'`],
  completed: [`q.request_status = 'COMPLETED' AND q.completed_at::date = CURRENT_DATE`],
  all: [],
};

router.get('/', async (req, res) => {
  const params = [];
  const where = [...(VIEWS[req.query.view] || VIEWS.open)];
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    where.push(`(r.room_number ILIKE $1 OR q.request_details ILIKE $1 OR CONCAT(g.first_name, ' ', g.last_name) ILIKE $1)`);
  }
  const { rows } = await db.query(
    `${REQUEST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE q.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
               q.requested_at`,
    params
  );
  res.json({ requests: rows });
});

// HK-013: record a guest request.
router.post('/', async (req, res) => {
  const body = req.body;
  v.required(body, ['roomId', 'requestType', 'details']);
  v.oneOf(body.requestType, REQUEST_TYPES, 'requestType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  v.maxLengths(body, { details: [255, 'Details'] });
  const staffId = v.optionalId(body.staffId, 'staff');
  if (staffId && staffId !== req.user.userId && !canManage(req.user)) {
    throw new HttpError(403, 'Only a supervisor can assign a request to someone else. Leave it unassigned or assign it to yourself.');
  }
  if (staffId) {
    await assertHousekeepingStaff(db, staffId, 'Guest requests can only be assigned to active housekeeping staff.');
  }
  const stock = await readStock(db, body);
  const { rows } = await db.query(
    `INSERT INTO hk_guest_requests (guest_id, room_id, staff_id, request_type, priority, request_details, request_status,
                                    inv_item_id, quantity_requested)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [v.optionalId(body.guestId, 'guest'), v.id(body.roomId, 'room'), staffId, body.requestType,
      body.priority || 'NORMAL', body.details, staffId ? 'IN_PROGRESS' : 'OPEN', stock.itemId, stock.quantity]
  );
  res.status(201).json({ request: rows[0] });
});

// Assign and process the request (assigning staff moves it to IN_PROGRESS).
router.patch('/:id', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const body = req.body;
  v.oneOf(body.requestType, REQUEST_TYPES, 'requestType');
  v.oneOf(body.priority, v.PRIORITIES, 'priority');
  v.maxLengths(body, { details: [255, 'Details'] });
  const { rows: found } = await db.query('SELECT * FROM hk_guest_requests WHERE request_id = $1', [requestId]);
  const current = found[0];
  if (!current) {
    throw new HttpError(404, 'Guest request not found.');
  }
  if (current.request_status === 'COMPLETED') {
    throw new HttpError(409, 'This request is already completed.');
  }
  const staffId = body.staffId !== undefined ? v.optionalId(body.staffId, 'staff') : current.staff_id;
  if (!canManage(req.user)) {
    if (current.staff_id && current.staff_id !== req.user.userId) {
      throw new HttpError(403, 'This request is assigned to another staff member. Ask a supervisor to reassign it.');
    }
    if (staffId && staffId !== req.user.userId) {
      throw new HttpError(403, 'Only a supervisor can assign a request to someone else.');
    }
  }
  if (staffId && staffId !== current.staff_id) {
    await assertHousekeepingStaff(db, staffId, 'Guest requests can only be assigned to active housekeeping staff.');
  }
  if (current.stock_approved_at && (body.invItemId !== undefined || body.quantity !== undefined)) {
    const same = Number(body.invItemId ?? current.inv_item_id) === current.inv_item_id
      && Number(body.quantity ?? current.quantity_requested) === current.quantity_requested;
    if (!same) {
      throw new HttpError(409, 'The stock for this request was already approved and taken out of inventory.');
    }
  }
  const stock = await readStock(db, body, current);
  const { rows } = await db.query(
    `UPDATE hk_guest_requests
        SET staff_id = $1, request_type = $2, priority = $3, request_details = $4, request_status = $5,
            inv_item_id = $6, quantity_requested = $7
      WHERE request_id = $8 RETURNING *`,
    [staffId, body.requestType || current.request_type, body.priority || current.priority,
      body.details || current.request_details, staffId ? 'IN_PROGRESS' : 'OPEN',
      stock.itemId, stock.quantity, requestId]
  );
  res.json({ request: rows[0] });
});

// Approve request: take the requested stock out of inventory for the room.
// Supervisors and inspectors, or the staff member assigned to the request.
router.post('/:id/approve-stock', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  const result = await db.withTransaction(async (client) => {
    const { rows: found } = await client.query(
      'SELECT * FROM hk_guest_requests WHERE request_id = $1 FOR UPDATE',
      [requestId]
    );
    const current = found[0];
    if (!current) {
      throw new HttpError(404, 'Guest request not found.');
    }
    if (!canManage(req.user) && current.staff_id !== req.user.userId) {
      throw new HttpError(403, 'Only the assigned staff member or a supervisor can approve this request.');
    }
    if (current.request_status === 'COMPLETED') {
      throw new HttpError(409, 'This request is already completed.');
    }
    if (!current.inv_item_id) {
      throw new HttpError(400, 'This request does not use any stock.');
    }
    if (current.stock_approved_at) {
      throw new HttpError(409, 'The stock for this request was already approved.');
    }
    const { rows: items } = await client.query(
      'SELECT * FROM hk_inventory_items WHERE inv_item_id = $1 FOR UPDATE',
      [current.inv_item_id]
    );
    const item = items[0];
    if (!item || !item.active) {
      throw new HttpError(409, 'The stock item is no longer tracked.');
    }
    if (current.quantity_requested > item.quantity) {
      throw new HttpError(409, `Only ${item.quantity} ${item.unit} of ${item.item_name} left in stock.`);
    }
    const balance = item.quantity - current.quantity_requested;
    await client.query('UPDATE hk_inventory_items SET quantity = $1 WHERE inv_item_id = $2', [balance, item.inv_item_id]);
    await client.query(
      `INSERT INTO hk_inventory_movements (inv_item_id, movement_type, quantity, balance_after, room_id, remarks, staff_id)
       VALUES ($1, 'OUT', $2, $3, $4, $5, $6)`,
      [item.inv_item_id, current.quantity_requested, balance, current.room_id,
        `Guest request GR-${current.request_id}`, req.user.userId]
    );
    const { rows } = await client.query(
      `UPDATE hk_guest_requests
          SET stock_approved_at = NOW(),
              staff_id = COALESCE(staff_id, $1),
              request_status = 'IN_PROGRESS'
        WHERE request_id = $2 RETURNING *`,
      [req.user.userId, requestId]
    );
    return rows[0];
  });
  res.json({ request: result });
});

// HK-014: complete the request.
router.post('/:id/complete', async (req, res) => {
  const requestId = v.id(req.params.id, 'request id');
  v.maxLengths(req.body || {}, { completionNotes: [255, 'Completion notes'] });
  const { rows: found } = await db.query('SELECT staff_id FROM hk_guest_requests WHERE request_id = $1', [requestId]);
  if (found[0] && found[0].staff_id && found[0].staff_id !== req.user.userId && !canManage(req.user)) {
    throw new HttpError(403, 'Only the assigned staff member or a supervisor can complete this request.');
  }
  const { rows } = await db.query(
    `UPDATE hk_guest_requests
        SET request_status = 'COMPLETED', completed_at = NOW(), completion_notes = $1,
            staff_id = COALESCE(staff_id, $2)
      WHERE request_id = $3 AND request_status <> 'COMPLETED' RETURNING *`,
    [(req.body && req.body.completionNotes) || null, req.user.userId, requestId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Request not found or already completed.');
  }
  res.json({ request: rows[0] });
});

module.exports = router;
