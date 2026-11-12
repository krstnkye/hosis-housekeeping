const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

// Linen, guest amenity and cleaning-supply stock. Every change is written as a
// movement, so the balance can always be traced. Any housekeeping staff member
// records what they take (OUT) or return (IN); supervisors add items, edit
// reorder levels and record stock counts (ADJUST).
const router = express.Router();

const CATEGORIES = ['LINEN', 'AMENITY', 'CLEANING_SUPPLY'];
const TYPES = ['IN', 'OUT', 'ADJUST'];

const ITEM_TEXT = {
  itemName: [100, 'Item name'],
  unit: [20, 'Unit'],
  storageArea: [100, 'Storage area'],
};

// GET /inventory?category=&search=&low=1
router.get('/', async (req, res) => {
  const { category, search, low } = req.query;
  v.oneOf(category, CATEGORIES, 'category');
  const params = [];
  const where = ['i.active'];
  if (category) {
    params.push(category);
    where.push(`i.category = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(i.item_name ILIKE $${params.length} OR i.storage_area ILIKE $${params.length})`);
  }
  if (low === '1') {
    where.push('i.quantity <= i.reorder_level');
  }
  const { rows: items } = await db.query(
    `SELECT i.*, (i.quantity <= i.reorder_level) AS low_stock,
            COALESCE((SELECT SUM(m.quantity) FROM hk_inventory_movements m
                       WHERE m.inv_item_id = i.inv_item_id AND m.movement_type = 'OUT'
                         AND m.moved_at::date = CURRENT_DATE), 0)::int AS used_today
       FROM hk_inventory_items i
      WHERE ${where.join(' AND ')}
      ORDER BY (i.quantity <= i.reorder_level) DESC, i.category, i.item_name`,
    params
  );
  const { rows: summary } = await db.query(
    `SELECT COUNT(*)::int AS items,
            COUNT(*) FILTER (WHERE quantity <= reorder_level)::int AS low_stock,
            COUNT(*) FILTER (WHERE quantity = 0)::int AS out_of_stock
       FROM hk_inventory_items WHERE active`
  );
  res.json({ items, summary: summary[0] });
});

// GET /inventory/movements?itemId=&limit=
router.get('/movements', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.itemId) {
    params.push(v.id(req.query.itemId, 'item id'));
    where = `WHERE m.inv_item_id = $${params.length}`;
  }
  const limit = req.query.limit ? v.int(req.query.limit, 'limit', { min: 1, max: 200 }) : 30;
  params.push(limit);
  const { rows } = await db.query(
    `SELECT m.*, i.item_name, i.unit, r.room_number, CONCAT(u.first_name, ' ', u.last_name) AS staff_name
       FROM hk_inventory_movements m
       JOIN hk_inventory_items i ON i.inv_item_id = m.inv_item_id
       LEFT JOIN rooms r ON r.room_id = m.room_id
       JOIN users u ON u.user_id = m.staff_id
      ${where}
      ORDER BY m.moved_at DESC, m.movement_id DESC LIMIT $${params.length}`,
    params
  );
  res.json({ movements: rows });
});

// POST /inventory (supervisor): add a stock item.
router.post('/', requirePosition('SUPERVISOR'), async (req, res) => {
  const body = req.body || {};
  v.required(body, ['itemName', 'category', 'unit']);
  v.oneOf(body.category, CATEGORIES, 'category');
  v.maxLengths(body, ITEM_TEXT);
  const quantity = body.quantity === undefined || body.quantity === '' ? 0 : v.int(body.quantity, 'Starting quantity');
  const reorderLevel = body.reorderLevel === undefined || body.reorderLevel === '' ? 0 : v.int(body.reorderLevel, 'Reorder level');
  const item = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO hk_inventory_items (item_name, category, unit, quantity, reorder_level, storage_area)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [String(body.itemName).trim(), body.category, String(body.unit).trim(), quantity, reorderLevel, body.storageArea || null]
    );
    if (quantity > 0) {
      await client.query(
        `INSERT INTO hk_inventory_movements (inv_item_id, movement_type, quantity, balance_after, remarks, staff_id)
         VALUES ($1, 'IN', $2, $2, 'Opening stock', $3)`,
        [rows[0].inv_item_id, quantity, req.user.userId]
      );
    }
    return rows[0];
  });
  res.status(201).json({ item });
});

// PATCH /inventory/:id (supervisor): name, unit, reorder level, storage area,
// or remove it from the list (active: false). Quantity changes go through
// movements only.
router.patch('/:id', requirePosition('SUPERVISOR'), async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body || {};
  if (body.quantity !== undefined) {
    throw new HttpError(400, 'Change the quantity by recording stock in, out or a stock count.');
  }
  v.oneOf(body.category, CATEGORIES, 'category');
  v.maxLengths(body, ITEM_TEXT);
  const reorderLevel = body.reorderLevel === undefined || body.reorderLevel === '' ? null : v.int(body.reorderLevel, 'Reorder level');
  const { rows } = await db.query(
    `UPDATE hk_inventory_items
        SET item_name = COALESCE($1, item_name), category = COALESCE($2, category), unit = COALESCE($3, unit),
            reorder_level = COALESCE($4, reorder_level), storage_area = COALESCE($5, storage_area),
            active = COALESCE($6, active)
      WHERE inv_item_id = $7 RETURNING *`,
    [body.itemName || null, body.category || null, body.unit || null, reorderLevel, body.storageArea || null,
      typeof body.active === 'boolean' ? body.active : null, itemId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Item not found.');
  }
  res.json({ item: rows[0] });
});

// POST /inventory/:id/movements  { type: IN | OUT | ADJUST, quantity, roomId?, remarks? }
// IN adds, OUT takes away (cannot go below zero), ADJUST sets the counted
// quantity (supervisors only, remarks required).
router.post('/:id/movements', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body || {};
  v.required(body, ['type', 'quantity']);
  v.oneOf(body.type, TYPES, 'type');
  v.maxLengths(body, { remarks: [255, 'Remarks'] });
  const isAdjust = body.type === 'ADJUST';
  const quantity = v.int(body.quantity, isAdjust ? 'Counted quantity' : 'Quantity', { min: isAdjust ? 0 : 1 });
  const roomId = v.optionalId(body.roomId, 'room');
  if (isAdjust) {
    if (req.user.position !== 'SUPERVISOR' && req.user.role !== 'ADMIN') {
      throw new HttpError(403, 'Only supervisors can record a stock count.');
    }
    if (!body.remarks) {
      throw new HttpError(400, 'Write why the stock count differs (e.g. monthly count, damaged linen).');
    }
  }
  const result = await db.withTransaction(async (client) => {
    const { rows: items } = await client.query(
      'SELECT * FROM hk_inventory_items WHERE inv_item_id = $1 AND active FOR UPDATE',
      [itemId]
    );
    const item = items[0];
    if (!item) {
      throw new HttpError(404, 'Item not found.');
    }
    let balance;
    let moved = quantity;
    if (body.type === 'IN') balance = item.quantity + quantity;
    if (body.type === 'OUT') {
      if (quantity > item.quantity) {
        throw new HttpError(409, `Only ${item.quantity} ${item.unit} of ${item.item_name} left in stock.`);
      }
      balance = item.quantity - quantity;
    }
    if (isAdjust) {
      balance = quantity;
      moved = quantity - item.quantity;
    }
    const { rows: updated } = await client.query(
      'UPDATE hk_inventory_items SET quantity = $1 WHERE inv_item_id = $2 RETURNING *',
      [balance, itemId]
    );
    const { rows: movement } = await client.query(
      `INSERT INTO hk_inventory_movements (inv_item_id, movement_type, quantity, balance_after, room_id, remarks, staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [itemId, body.type, moved, balance, roomId, body.remarks || null, req.user.userId]
    );
    return { item: { ...updated[0], low_stock: balance <= item.reorder_level }, movement: movement[0] };
  });
  res.status(201).json(result);
});

module.exports = router;
