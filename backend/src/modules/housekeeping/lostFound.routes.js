const express = require('express');
const db = require('../../config/db');
const HttpError = require('../../utils/httpError');
const v = require('./validate');
const { requirePosition } = require('../../middleware/auth');

const router = express.Router();

const ITEM_STATUSES = ['STORED', 'RELEASED', 'DISPOSED'];
const ID_TYPES = ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'UMID', 'SSS', 'PHILHEALTH', 'POSTAL_ID', 'VOTERS_ID', 'COMPANY_ID', 'OTHER'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTOS = 3;

const ITEM_TEXT = {
  description: [255, 'Description'],
  foundLocation: [100, 'Found location'],
  storageLocation: [100, 'Storage location'],
};

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
    `SELECT i.*, r.room_number, CONCAT(u.first_name, ' ', u.last_name) AS found_by_name,
            CONCAT(d.first_name, ' ', d.last_name) AS disposed_by_name,
            COALESCE((SELECT ARRAY_AGG(p.photo_id ORDER BY p.photo_id) FROM hk_lost_found_photos p
                       WHERE p.item_id = i.item_id), '{}') AS photo_ids
       FROM hk_lost_found_items i
       LEFT JOIN rooms r ON r.room_id = i.room_id
       JOIN users u ON u.user_id = i.found_by
       LEFT JOIN users d ON d.user_id = i.disposed_by
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
  v.maxLengths(body, ITEM_TEXT);
  const foundAt = v.optionalPastDateTime(body.foundAt, 'Date found');
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
        `LF-${String(itemId).padStart(4, '0')}`, body.storageLocation, foundAt]
    );
    return rows[0];
  });
  res.status(201).json({ item });
});

// Update the details of a stored item. Release happens only through a claim,
// and disposal only through POST /:id/dispose (supervisors).
router.patch('/:id', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body || {};
  if (body.status !== undefined) {
    throw new HttpError(400, 'Use Release (claim) or Dispose to change an item\'s status.');
  }
  v.maxLengths(body, ITEM_TEXT);
  const { rows } = await db.query(
    `UPDATE hk_lost_found_items
        SET item_description = COALESCE($1, item_description),
            storage_location = COALESCE($2, storage_location)
      WHERE item_id = $3 AND item_status = 'STORED' RETURNING *`,
    [body.description || null, body.storageLocation || null, itemId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Item not found, or it was already released or disposed.');
  }
  res.json({ item: rows[0] });
});

// Dispose of an unclaimed item (donated, discarded, handed to authorities).
// Supervisors only; the reason and who did it are kept on the record.
router.post('/:id/dispose', requirePosition('SUPERVISOR'), async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body || {};
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    throw new HttpError(400, 'Write why the item is being disposed of.');
  }
  v.maxLengths({ reason }, { reason: [255, 'Reason'] });
  const { rows } = await db.query(
    `UPDATE hk_lost_found_items
        SET item_status = 'DISPOSED', disposed_by = $1, disposed_at = NOW(), disposal_reason = $2
      WHERE item_id = $3 AND item_status = 'STORED' RETURNING *`,
    [req.user.userId, reason, itemId]
  );
  if (!rows[0]) {
    throw new HttpError(409, 'Item not found, or it was already released or disposed.');
  }
  res.json({ item: rows[0] });
});

// Photos of a found item: POST { image: "data:image/jpeg;base64,..." }.
router.post('/:id/photos', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const image = req.body && req.body.image;
  const match = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match || !PHOTO_TYPES.includes(match[1])) {
    throw new HttpError(400, 'Upload a JPEG, PNG or WebP photo.');
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_PHOTO_BYTES) {
    throw new HttpError(400, 'Photos must be 2 MB or smaller.');
  }
  const photo = await db.withTransaction(async (client) => {
    const { rows: items } = await client.query(
      'SELECT item_status FROM hk_lost_found_items WHERE item_id = $1 FOR UPDATE',
      [itemId]
    );
    if (!items[0]) {
      throw new HttpError(404, 'Item not found.');
    }
    const { rows: count } = await client.query(
      'SELECT COUNT(*)::int AS n FROM hk_lost_found_photos WHERE item_id = $1',
      [itemId]
    );
    if (count[0].n >= MAX_PHOTOS) {
      throw new HttpError(409, `An item can have up to ${MAX_PHOTOS} photos.`);
    }
    const { rows } = await client.query(
      `INSERT INTO hk_lost_found_photos (item_id, content_type, data, uploaded_by)
       VALUES ($1, $2, $3, $4) RETURNING photo_id, item_id, content_type, uploaded_at`,
      [itemId, match[1], data, req.user.userId]
    );
    return rows[0];
  });
  res.status(201).json({ photo });
});

// The photo itself (shown in the item details).
router.get('/:id/photos/:photoId', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const photoId = v.id(req.params.photoId, 'photo id');
  const { rows } = await db.query(
    'SELECT content_type, data FROM hk_lost_found_photos WHERE photo_id = $1 AND item_id = $2',
    [photoId, itemId]
  );
  if (!rows[0]) {
    throw new HttpError(404, 'Photo not found.');
  }
  res.set('Content-Type', rows[0].content_type);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(rows[0].data);
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const photoId = v.id(req.params.photoId, 'photo id');
  const { rowCount } = await db.query(
    `DELETE FROM hk_lost_found_photos p USING hk_lost_found_items i
      WHERE p.photo_id = $1 AND p.item_id = $2 AND i.item_id = p.item_id AND i.item_status = 'STORED'`,
    [photoId, itemId]
  );
  if (!rowCount) {
    throw new HttpError(404, 'Photo not found, or the item is no longer stored.');
  }
  res.status(204).end();
});

// HK-012: process a claim. The item is released only when the claimant's ID
// is verified and the description matches; otherwise the claim is rejected.
router.post('/:id/claims', async (req, res) => {
  const itemId = v.id(req.params.id, 'item id');
  const body = req.body;
  v.required(body, ['claimantName', 'claimantContact']);
  v.maxLengths(body, { claimantName: [100, 'Claimant name'], claimantContact: [100, 'Claimant contact'] });
  v.oneOf(body.idType || undefined, ID_TYPES, 'idType');
  const idLast4 = body.idNumber ? String(body.idNumber).replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() : null;
  if (body.idVerified === true && (!body.idType || !idLast4)) {
    throw new HttpError(400, 'Record the type and number of the ID that was checked.');
  }
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
          processed_by, claim_status, released_at, id_type, id_last4)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [itemId, v.optionalId(body.guestId, 'guest'), body.claimantName, body.claimantContact,
        body.idVerified === true, body.descriptionMatch === true, req.user.userId,
        valid ? 'VALID' : 'REJECTED', valid ? new Date() : null, body.idType || null, idLast4]
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
