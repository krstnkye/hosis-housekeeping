const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');

const router = express.Router();

const ITEM_STATUSES = ['STORED', 'RELEASED', 'DISPOSED'];

// HK-011: search and view lost and found records.
router.get('/', async (req, res) => {
  const { status, search } = req.query;
  v.oneOf(status, ITEM_STATUSES, 'status');
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`i.item_status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(i.item_description ILIKE $${params.length} OR i.storage_label ILIKE $${params.length} OR r.room_number ILIKE $${params.length})`);
  }
  const { rows } = await db.query(
    `SELECT i.*, r.room_number, CONCAT(u.first_name, ' ', u.last_name) AS found_by_name
       FROM hk_lost_found_items i
       LEFT JOIN rooms r ON r.room_id = i.room_id
       JOIN users u ON u.user_id = i.found_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.found_at DESC`,
    params
  );
  res.json({ items: rows });
});

// Claim history of one item (chain of custody).
router.get('/:id/claims', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const { rows } = await db.query(
    `SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) AS processed_by_name
       FROM hk_item_claims c JOIN users u ON u.user_id = c.processed_by
      WHERE c.item_id = $1 ORDER BY c.claimed_at DESC`,
    [itemId]
  );
  res.json({ claims: rows });
});

// HK-010: record a found item; it is stored under a generated label (LF-0001).
router.post('/', async (req, res) => {
  const body = req.body;
  v.required(body, ['description', 'foundLocation', 'storageLocation']);
  const item = await db.withTransaction(async (client) => {
    const { rows: seq } = await client.query(
      `SELECT nextval(pg_get_serial_sequence('hk_lost_found_items', 'item_id'))::int AS id`
    );
    const itemId = seq[0].id;
    const { rows } = await client.query(
      `INSERT INTO hk_lost_found_items
         (item_id, room_id, found_by, item_description, found_location, storage_label, storage_location, found_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW())) RETURNING *`,
      [itemId, v.optionalId(body.roomId, 'room'), req.user.userId, body.description, body.foundLocation,
        `LF-${String(itemId).padStart(4, '0')}`, body.storageLocation, body.foundAt || null]
    );
    return rows[0];
  });
  res.status(201).json({ item });
});

// Update item details or mark it DISPOSED (release only happens through a claim).
router.patch('/:id', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body;
  v.oneOf(body.status, ['STORED', 'DISPOSED'], 'status');
  const { rows } = await db.query(
    `UPDATE hk_lost_found_items
        SET item_description = COALESCE($1, item_description),
            storage_location = COALESCE($2, storage_location),
            item_status = COALESCE($3, item_status)
      WHERE item_id = $4 AND item_status <> 'RELEASED' RETURNING *`,
    [body.description || null, body.storageLocation || null, body.status || null, itemId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Item not found or already released.');
  }
  res.json({ item: rows[0] });
});

// HK-012: process a claim. The item is released only when the claimant's ID
// is verified and the description matches; otherwise the claim is rejected.
router.post('/:id/claims', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body;
  v.required(body, ['claimantName', 'claimantContact']);
  const valid = body.idVerified === true && body.descriptionMatch === true;

  const result = await db.withTransaction(async (client) => {
    const { rows: items } = await client.query(
      'SELECT * FROM hk_lost_found_items WHERE item_id = $1 FOR UPDATE',
      [itemId]
    );
    if (!items[0]) {
      throw new HttpError(404, 'Item not found.');
    }
    if (items[0].item_status !== 'STORED') {
      throw new HttpError(409, `This item is already ${items[0].item_status.toLowerCase()}.`);
    }
    const { rows: claims } = await client.query(
      `INSERT INTO hk_item_claims
         (item_id, guest_id, claimant_name, claimant_contact, id_verified, description_match,
          processed_by, claim_status, released_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [itemId, v.optionalId(body.guestId, 'guest'), body.claimantName, body.claimantContact,
        body.idVerified === true, body.descriptionMatch === true, req.user.userId,
        valid ? 'VALID' : 'REJECTED', valid ? new Date() : null]
    );
    let item = items[0];
    if (valid) {
      const { rows } = await client.query(
        `UPDATE hk_lost_found_items SET item_status = 'RELEASED' WHERE item_id = $1 RETURNING *`,
        [itemId]
      );
      item = rows[0];
    }
    return { claim: claims[0], item, released: valid };
  });
  res.status(201).json(result);
});

module.exports = router;
