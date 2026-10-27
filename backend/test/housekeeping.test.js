// Integration tests for the Housekeeping API.
// They need a PostgreSQL database loaded with database/schema/06-housekeeping.sql
// and database/seed/06-housekeeping-seed.sql. Set DATABASE_URL before running:
//   DATABASE_URL=postgres://... npm test
require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let base;

before(async () => {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await db.pool.end();
});

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(username) {
  const res = await api('POST', '/auth/login', {
    body: { username, password: 'password123', department: 'HOUSEKEEPING' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function roomId(number) {
  const { rows } = await db.query('SELECT room_id FROM rooms WHERE room_number = $1', [number]);
  return rows[0].room_id;
}

async function roomStatus(id) {
  const { rows } = await db.query('SELECT room_status FROM rooms WHERE room_id = $1', [id]);
  return rows[0].room_status;
}

test('login: wrong password and other departments are denied', async () => {
  const wrong = await api('POST', '/auth/login', { body: { username: 'hk.liza', password: 'nope' } });
  assert.equal(wrong.status, 401);
  const fo = await api('POST', '/auth/login', {
    body: { username: 'fo.desk', password: 'password123', department: 'HOUSEKEEPING' },
  });
  assert.equal(fo.status, 403);
  assert.match(fo.body.error, /Access denied/);
  const noToken = await api('GET', '/housekeeping/rooms');
  assert.equal(noToken.status, 401);
});

test('cleaning flow: create, assign, clean, fail inspection, re-clean, pass', async () => {
  const sup = await login('hk.supervisor');
  const insp = await login('hk.inspector');
  const joy = await login('hk.joy');
  const mark = await login('hk.mark');

  // Free room 204's seeded pending task so we can create our own.
  const room = await roomId('204');
  await db.query(`DELETE FROM hk_cleaning_tasks WHERE room_id = $1`, [room]);

  // Housekeepers cannot create tasks (supervisor only).
  const denied = await api('POST', '/housekeeping/tasks', {
    token: joy.token,
    body: { roomId: room, taskType: 'CHECKOUT' },
  });
  assert.equal(denied.status, 403);

  const created = await api('POST', '/housekeeping/tasks', {
    token: sup.token,
    body: { roomId: room, taskType: 'CHECKOUT', priority: 'HIGH', staffId: joy.user.userId },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.task_status, 'ASSIGNED');
  const taskId = created.body.task.task_id;

  const dup = await api('POST', '/housekeeping/tasks', {
    token: sup.token,
    body: { roomId: room, taskType: 'CHECKOUT' },
  });
  assert.equal(dup.status, 409);

  // Another housekeeper cannot work on Joy's task.
  assert.equal((await api('POST', `/housekeeping/tasks/${taskId}/start`, { token: mark.token })).status, 403);

  assert.equal((await api('POST', `/housekeeping/tasks/${taskId}/start`, { token: joy.token })).status, 200);
  assert.equal((await api('POST', `/housekeeping/tasks/${taskId}/complete`, { token: joy.token })).status, 200);
  assert.equal(await roomStatus(room), 'CLEAN');

  // Housekeepers cannot inspect.
  const noInspect = await api('POST', '/housekeeping/inspections', {
    token: joy.token,
    body: { taskId, result: 'PASSED' },
  });
  assert.equal(noInspect.status, 403);

  const failed = await api('POST', '/housekeeping/inspections', {
    token: insp.token,
    body: { taskId, result: 'FAILED', remarks: 'Bathroom mirror has streaks' },
  });
  assert.equal(failed.status, 201);
  assert.equal(await roomStatus(room), 'DIRTY');

  await api('POST', `/housekeeping/tasks/${taskId}/start`, { token: joy.token });
  await api('POST', `/housekeeping/tasks/${taskId}/complete`, { token: joy.token });
  const passed = await api('POST', '/housekeeping/inspections', {
    token: insp.token,
    body: { taskId, result: 'PASSED', checklist: { bed: true, bathroom: true } },
  });
  assert.equal(passed.status, 201);
  assert.equal(await roomStatus(room), 'INSPECTED');

  const notes = await api('GET', '/housekeeping/notifications', { token: sup.token });
  assert.ok(notes.body.notifications.some((n) => n.room_id === room));

  const { rows: logs } = await db.query(
    'SELECT new_status FROM hk_room_status_logs WHERE room_id = $1 ORDER BY log_id',
    [room]
  );
  assert.deepEqual(logs.map((l) => l.new_status), ['CLEAN', 'DIRTY', 'CLEAN', 'INSPECTED']);
});

test('room status: only allowed manual changes', async () => {
  const liza = await login('hk.liza');
  const occupied = await roomId('202');
  const bad = await api('PATCH', `/housekeeping/rooms/${occupied}/status`, {
    token: liza.token,
    body: { status: 'AVAILABLE' },
  });
  assert.equal(bad.status, 409);
  const ok = await api('PATCH', `/housekeeping/rooms/${occupied}/status`, {
    token: liza.token,
    body: { status: 'DIRTY', remarks: 'Guest asked for service' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.room.room_status, 'DIRTY');
});

test('lost and found: invalid claim is rejected, valid claim releases', async () => {
  const liza = await login('hk.liza');
  const created = await api('POST', '/housekeeping/lost-found', {
    token: liza.token,
    body: { roomId: await roomId('101'), description: 'Red scarf', foundLocation: 'Closet', storageLocation: 'Cabinet A' },
  });
  assert.equal(created.status, 201);
  assert.match(created.body.item.storage_label, /^LF-\d{4}$/);
  const itemId = created.body.item.item_id;

  const rejected = await api('POST', `/housekeeping/lost-found/${itemId}/claims`, {
    token: liza.token,
    body: { claimantName: 'Someone', claimantContact: '0917', idVerified: true, descriptionMatch: false },
  });
  assert.equal(rejected.body.released, false);
  assert.equal(rejected.body.item.item_status, 'STORED');

  const valid = await api('POST', `/housekeeping/lost-found/${itemId}/claims`, {
    token: liza.token,
    body: { claimantName: 'Grace Lim', claimantContact: '0918', idVerified: true, descriptionMatch: true },
  });
  assert.equal(valid.body.released, true);
  assert.equal(valid.body.item.item_status, 'RELEASED');

  const again = await api('POST', `/housekeeping/lost-found/${itemId}/claims`, {
    token: liza.token,
    body: { claimantName: 'X', claimantContact: 'Y', idVerified: true, descriptionMatch: true },
  });
  assert.equal(again.status, 409);
});

test('guest request: record, assign, complete', async () => {
  const joy = await login('hk.joy');
  const created = await api('POST', '/housekeeping/guest-requests', {
    token: joy.token,
    body: { roomId: await roomId('301'), requestType: 'TOWELS', details: 'Two towels' },
  });
  assert.equal(created.body.request.request_status, 'OPEN');
  const id = created.body.request.request_id;
  const assigned = await api('PATCH', `/housekeeping/guest-requests/${id}`, {
    token: joy.token,
    body: { staffId: joy.user.userId },
  });
  assert.equal(assigned.body.request.request_status, 'IN_PROGRESS');
  const done = await api('POST', `/housekeeping/guest-requests/${id}/complete`, {
    token: joy.token,
    body: { completionNotes: 'Delivered' },
  });
  assert.equal(done.body.request.request_status, 'COMPLETED');
});

test('maintenance: report sets OUT OF ORDER, release creates cleaning task', async () => {
  const mark = await login('hk.mark');
  const room = await roomId('101');
  const created = await api('POST', '/housekeeping/maintenance', {
    token: mark.token,
    body: { roomId: room, category: 'PLUMBING', description: 'Leaking faucet', priority: 'HIGH', setOutOfOrder: true },
  });
  assert.equal(created.status, 201);
  assert.equal(await roomStatus(room), 'OUT_OF_ORDER');
  const id = created.body.request.request_id;

  const early = await api('POST', `/housekeeping/maintenance/${id}/release`, { token: mark.token });
  assert.equal(early.status, 409);

  await api('PATCH', `/housekeeping/maintenance/${id}`, { token: mark.token, body: { status: 'REPAIRED' } });
  const released = await api('POST', `/housekeeping/maintenance/${id}/release`, { token: mark.token });
  assert.equal(released.status, 200);
  assert.equal(released.body.task.task_type, 'POST_REPAIR');
  assert.equal(await roomStatus(room), 'DIRTY');
});

test('schedules: supervisor creates, invalid times rejected', async () => {
  const sup = await login('hk.supervisor');
  const mark = await login('hk.mark');
  const bad = await api('POST', '/housekeeping/schedules', {
    token: sup.token,
    body: { staffId: mark.user.userId, shiftDate: '2030-01-01', shift: 'MORNING', startTime: '14:00', endTime: '06:00', assignedArea: 'Floor 3' },
  });
  assert.equal(bad.status, 400);
  const ok = await api('POST', '/housekeeping/schedules', {
    token: sup.token,
    body: { staffId: mark.user.userId, shiftDate: '2030-01-01', shift: 'MORNING', startTime: '06:00', endTime: '14:00', assignedArea: 'Floor 3' },
  });
  assert.equal(ok.status, 201);
  const list = await api('GET', '/housekeeping/schedules?date=2030-01-01', { token: mark.token });
  assert.equal(list.body.schedules.length, 1);
  assert.equal(list.body.coverage.MORNING, 1);
});
