// Integration tests for the Housekeeping API.
// They need a PostgreSQL database with the shared tables and
// database/schema/06-housekeeping.sql loaded. Before the tests run, they
// reload database/seed/06-housekeeping-seed.sql, which RESETS all hk_ data,
// so point DATABASE_URL at a development or test database only:
//   DATABASE_URL=postgres://... npm test
require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-tests';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');
const { assertConfig } = require('../src/config/env');

let server;
let base;

before(async () => {
  const seed = fs.readFileSync(path.join(__dirname, '../../database/seed/06-housekeeping-seed.sql'), 'utf8');
  await db.query(seed);
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

async function loginAs(username, department) {
  const res = await api('POST', '/auth/login', { body: { username, password: 'password123', department } });
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

  // INSPECTED comes only from an inspection, OUT_OF_ORDER only from a maintenance request.
  const sup = await login('hk.supervisor');
  const clean = await roomId('205');
  for (const status of ['INSPECTED', 'OUT_OF_ORDER']) {
    const refused = await api('PATCH', `/housekeeping/rooms/${clean}/status`, { token: sup.token, body: { status } });
    assert.equal(refused.status, 409, status);
  }
  assert.equal(await roomStatus(clean), 'CLEAN');
  const detail = await api('GET', `/housekeeping/rooms/${clean}`, { token: sup.token });
  assert.deepEqual(detail.body.allowedStatuses, ['DIRTY']);
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

  // The records list must immediately return the item under RELEASED, not STORED.
  const releasedItems = await api('GET', '/housekeeping/lost-found?status=RELEASED', { token: liza.token });
  assert.ok(releasedItems.body.items.some((item) => item.item_id === itemId));
  const storedItems = await api('GET', '/housekeeping/lost-found?status=STORED', { token: liza.token });
  assert.equal(storedItems.body.items.some((item) => item.item_id === itemId), false);

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

  const eng = await loginAs('eng.tech', 'ENGINEERING');
  const repaired = await api('PATCH', `/housekeeping/maintenance/${id}/status`, { token: eng.token, body: { status: 'REPAIRED' } });
  assert.equal(repaired.status, 200);
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

test('login with email, alerts, activity and my schedule', async () => {
  const byEmail = await api('POST', '/auth/login', {
    body: { username: 'Maria.Santos@grandhorizon.ph', password: 'password123', department: 'HOUSEKEEPING' },
  });
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.body.user.username, 'hk.supervisor');

  const joy = await login('hk.joy');
  const alerts = await api('GET', '/housekeeping/alerts', { token: joy.token });
  assert.equal(alerts.status, 200);
  assert.ok(alerts.body.alerts.some((a) => a.type === 'TASK'));

  const activity = await api('GET', '/housekeeping/activity', { token: joy.token });
  assert.ok(activity.body.activity.length > 0);

  const mine = await api('GET', '/housekeeping/schedules/mine', { token: joy.token });
  assert.ok(mine.body.schedules.length >= 1);
  const days = await api('GET', '/housekeeping/schedules/days', { token: joy.token });
  assert.ok(days.body.days.length >= 1);

  const all = await api('GET', '/housekeeping/guest-requests?view=all', { token: joy.token });
  assert.ok(all.body.requests.some((r) => r.request_status === 'COMPLETED'));
});

test('out of order: open cleaning cannot finish, release reopens the task', async () => {
  const joy = await login('hk.joy');
  const mark = await login('hk.mark');
  const sup = await login('hk.supervisor');
  const room = await roomId('103');
  const { rows } = await db.query(`SELECT task_id FROM hk_cleaning_tasks WHERE room_id = $1`, [room]);
  const taskId = rows[0].task_id;

  assert.equal((await api('POST', `/housekeeping/tasks/${taskId}/start`, { token: joy.token })).status, 200);
  const report = await api('POST', '/housekeeping/maintenance', {
    token: mark.token,
    body: { roomId: room, category: 'PLUMBING', description: 'Toilet leaking', setOutOfOrder: true },
  });
  assert.equal(report.status, 201);

  // Finishing the old task must not turn the broken room CLEAN.
  const complete = await api('POST', `/housekeeping/tasks/${taskId}/complete`, { token: joy.token });
  assert.equal(complete.status, 409);
  assert.equal(await roomStatus(room), 'OUT_OF_ORDER');
  // And no new task can be created for it.
  const create = await api('POST', '/housekeeping/tasks', { token: sup.token, body: { roomId: room, taskType: 'TOUCH_UP' } });
  assert.equal(create.status, 409);

  const eng = await loginAs('eng.tech', 'ENGINEERING');
  await api('PATCH', `/housekeeping/maintenance/${report.body.request.request_id}/status`, {
    token: eng.token,
    body: { status: 'REPAIRED' },
  });
  const released = await api('POST', `/housekeeping/maintenance/${report.body.request.request_id}/release`, { token: mark.token });
  assert.equal(released.status, 200);
  assert.equal(released.body.reopened, true);
  assert.equal(released.body.task.task_id, taskId);
  assert.equal(released.body.task.task_status, 'ASSIGNED');
  assert.equal(released.body.task.priority, 'HIGH');
  assert.equal(await roomStatus(room), 'DIRTY');
  const { rows: open } = await db.query(
    `SELECT COUNT(*)::int AS n FROM hk_cleaning_tasks WHERE room_id = $1 AND task_status <> 'INSPECTED'`,
    [room]
  );
  assert.equal(open[0].n, 1);
});

test('maintenance: occupied rooms are not set out of order', async () => {
  const liza = await login('hk.liza');
  const occupied = await roomId('301');
  const refused = await api('POST', '/housekeeping/maintenance', {
    token: liza.token,
    body: { roomId: occupied, category: 'AIRCON', description: 'Noisy', setOutOfOrder: true },
  });
  assert.equal(refused.status, 409);
  assert.equal(await roomStatus(occupied), 'OCCUPIED');
  const reportOnly = await api('POST', '/housekeeping/maintenance', {
    token: liza.token,
    body: { roomId: occupied, category: 'AIRCON', description: 'Noisy' },
  });
  assert.equal(reportOnly.status, 201);
});

test('engineering: only Engineering updates repair status', async () => {
  const liza = await login('hk.liza');
  const eng = await loginAs('eng.tech', 'ENGINEERING');
  const report = await api('POST', '/housekeeping/maintenance', {
    token: liza.token,
    body: { roomId: await roomId('204'), category: 'ELECTRICAL', description: 'Lamp flickers', priority: 'LOW' },
  });
  const id = report.body.request.request_id;

  assert.equal((await api('PATCH', `/housekeeping/maintenance/${id}`, { token: liza.token, body: { status: 'REPAIRED' } })).status, 403);
  assert.equal((await api('PATCH', `/housekeeping/maintenance/${id}/status`, { token: liza.token, body: { status: 'REPAIRED' } })).status, 403);
  assert.equal((await api('GET', '/housekeeping/maintenance/incoming', { token: liza.token })).status, 403);
  // Engineering cannot reach the rest of Housekeeping.
  assert.equal((await api('GET', '/housekeeping/tasks', { token: eng.token })).status, 403);

  const incoming = await api('GET', '/housekeeping/maintenance/incoming', { token: eng.token });
  assert.equal(incoming.status, 200);
  assert.ok(incoming.body.requests.some((r) => r.request_id === id));
  const progress = await api('PATCH', `/housekeeping/maintenance/${id}/status`, { token: eng.token, body: { status: 'IN_PROGRESS' } });
  assert.equal(progress.body.request.status, 'IN_PROGRESS');
  const done = await api('PATCH', `/housekeeping/maintenance/${id}/status`, { token: eng.token, body: { status: 'REPAIRED' } });
  assert.equal(done.body.request.status, 'REPAIRED');
  assert.ok(done.body.request.resolved_at);

  // Housekeeping can still correct the priority.
  const edited = await api('PATCH', `/housekeeping/maintenance/${id}`, { token: liza.token, body: { priority: 'HIGH' } });
  assert.equal(edited.body.request.priority, 'HIGH');
});

test('guest request: only housekeeping staff can be assigned', async () => {
  const joy = await login('hk.joy');
  const { rows } = await db.query(`SELECT user_id FROM users WHERE username = 'fo.desk'`);
  const created = await api('POST', '/housekeeping/guest-requests', {
    token: joy.token,
    body: { roomId: await roomId('202'), requestType: 'TOWELS', details: 'Towels', staffId: rows[0].user_id },
  });
  assert.equal(created.status, 400);
});

test('front office: checkout creates a task, notifications can be marked read', async () => {
  const fo = await api('POST', '/auth/login', { body: { username: 'fo.desk', password: 'password123' } });
  const token = fo.body.token;
  const sup = await login('hk.supervisor');

  const room = await roomId('102');
  const checkout = await api('POST', '/housekeeping/checkout', { token, body: { roomId: room } });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.body.task.task_type, 'CHECKOUT');
  assert.equal(await roomStatus(room), 'DIRTY');
  assert.equal((await api('POST', '/housekeeping/checkout', { token, body: { roomId: room } })).status, 409);
  assert.equal((await api('POST', '/housekeeping/checkout', { token: sup.token, body: { roomId: room } })).status, 403);

  const unread = await api('GET', '/housekeeping/notifications?unread=1', { token });
  assert.equal(unread.status, 200);
  assert.ok(unread.body.notifications.length > 0);
  const id = unread.body.notifications[0].notification_id;
  assert.equal((await api('PATCH', `/housekeeping/notifications/${id}/read`, { token: sup.token })).status, 403);
  const read = await api('PATCH', `/housekeeping/notifications/${id}/read`, { token });
  assert.equal(read.status, 200);
  assert.ok(read.body.notification.read_at);
  const after = await api('GET', '/housekeeping/notifications?unread=1', { token });
  assert.equal(after.body.notifications.some((n) => n.notification_id === id), false);
});

test('account: staff see their account and change their own password', async () => {
  const joy = await login('hk.joy');
  const account = await api('GET', '/auth/account', { token: joy.token });
  assert.equal(account.status, 200);
  assert.equal(account.body.account.username, 'hk.joy');
  assert.equal(account.body.account.email, 'joy.delacruz@grandhorizon.ph');
  assert.equal(account.body.account.password_hash, undefined);

  const change = (currentPassword, newPassword) =>
    api('POST', '/auth/password', { token: joy.token, body: { currentPassword, newPassword } });
  assert.equal((await change('wrong-password', 'new-password-1')).status, 400);
  assert.equal((await change('password123', 'short')).status, 400);
  assert.equal((await change('password123', 'password123')).status, 400);
  assert.equal((await change('password123', 'new-password-1')).status, 200);

  const old = await api('POST', '/auth/login', { body: { username: 'hk.joy', password: 'password123', department: 'HOUSEKEEPING' } });
  assert.equal(old.status, 401);
  const fresh = await api('POST', '/auth/login', { body: { username: 'hk.joy', password: 'new-password-1', department: 'HOUSEKEEPING' } });
  assert.equal(fresh.status, 200);
  // Put the demo password back for the other tests.
  assert.equal((await change('new-password-1', 'password123')).status, 200);
});

test('room condition: staff report to Front Office and see their reports and record', async () => {
  const liza = await login('hk.liza');
  const room = await roomId('104');
  const bad = await api('POST', '/housekeeping/room-reports', { token: liza.token, body: { roomId: room, condition: 'BROKEN', details: 'x' } });
  assert.equal(bad.status, 400);
  const sent = await api('POST', '/housekeeping/room-reports', {
    token: liza.token,
    body: { roomId: room, condition: 'DAMAGED', details: 'Cracked bathroom mirror' },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.notification.notice_type, 'ROOM_CONDITION');
  assert.match(sent.body.notification.message, /Room 104 condition \(damaged\): Cracked bathroom mirror/);

  const fo = await api('POST', '/auth/login', { body: { username: 'fo.desk', password: 'password123' } });
  const notices = await api('GET', '/housekeeping/notifications?unread=1', { token: fo.body.token });
  assert.ok(notices.body.notifications.some((n) => n.notification_id === sent.body.notification.notification_id && n.notice_type === 'ROOM_CONDITION'));

  const issue = await api('POST', '/housekeeping/maintenance', {
    token: liza.token,
    body: { roomId: room, category: 'FURNITURE', description: 'Cracked bathroom mirror' },
  });
  assert.equal(issue.status, 201);
  const reports = await api('GET', '/housekeeping/me/reports', { token: liza.token });
  assert.equal(reports.status, 200);
  assert.deepEqual(new Set(reports.body.reports.filter((r) => r.room_number === '104').map((r) => r.sent_to)), new Set(['FRONT_OFFICE', 'MAINTENANCE']));

  const record = await api('GET', '/housekeeping/me/record', { token: liza.token });
  assert.equal(record.status, 200);
  assert.equal(record.body.profile.username, 'hk.liza');
  assert.ok(record.body.totals.conditions_reported >= 1);
  assert.ok(record.body.totals.issues_reported >= 1);
  assert.ok(record.body.recent.some((a) => a.type === 'ROOM_CONDITION'));
});

test('login: repeated wrong passwords are locked out', async () => {
  let last;
  for (let i = 0; i < 6; i += 1) {
    last = await api('POST', '/auth/login', { body: { username: 'no.such.user', password: 'wrong' } });
  }
  assert.equal(last.status, 429);
});

test('config: the server refuses an example or missing JWT secret', () => {
  const ok = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a-long-private-secret-value' };
  assert.doesNotThrow(() => assertConfig(ok));
  assert.throws(() => assertConfig({ ...ok, JWT_SECRET: 'change-this-secret' }));
  assert.throws(() => assertConfig({ ...ok, JWT_SECRET: '' }));
  assert.throws(() => assertConfig({ JWT_SECRET: ok.JWT_SECRET }));
});
