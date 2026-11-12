// Demo helper for running Housekeeping on its own, before the Front Office
// module exists: signs in as the seeded Front Office account and uses the
// Front Office endpoints, so the whole room cycle can be shown.
//
//   npm run frontoffice -- rooms             list rooms and their status
//   npm run frontoffice -- notices           unread notices from Housekeeping
//   npm run frontoffice -- checkin <room>    AVAILABLE/RESERVED -> OCCUPIED
//   npm run frontoffice -- checkout <room>   OCCUPIED -> DIRTY + cleaning task
//   npm run frontoffice -- release <room>    INSPECTED -> AVAILABLE
//
// <room> is the room number, e.g. 203. The backend must be running.
// API_URL defaults to http://localhost:5000/api.
const API = process.env.API_URL || 'http://localhost:5000/api';
const USERNAME = process.env.FO_USERNAME || 'fo.desk';
const PASSWORD = process.env.FO_PASSWORD || 'password123';

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const ACTIONS = {
  checkin: ['/housekeeping/front-office/check-in', 'checked in'],
  checkout: ['/housekeeping/checkout', 'checked out'],
  release: ['/housekeeping/front-office/release', 'released'],
};

(async () => {
  const [action = 'rooms', roomNumber] = process.argv.slice(2);
  const { token } = await call('POST', '/auth/login', null, {
    username: USERNAME,
    password: PASSWORD,
    department: 'FRONT_OFFICE',
  });
  const { rooms } = await call('GET', '/housekeeping/front-office/rooms', token);
  if (action === 'rooms') {
    for (const r of rooms) console.log(`Room ${r.room_number}  ${r.room_type.padEnd(10)}  ${r.room_status}`);
    return;
  }
  if (action === 'notices') {
    const { notifications } = await call('GET', '/housekeeping/notifications?unread=1', token);
    for (const n of notifications) console.log(`#${n.notification_id}  ${n.notice_type}  ${n.message}`);
    if (!notifications.length) console.log('No unread notices.');
    return;
  }
  if (!ACTIONS[action] || !roomNumber) {
    throw new Error('Usage: npm run frontoffice -- rooms | notices | checkin <room> | checkout <room> | release <room>');
  }
  const room = rooms.find((r) => r.room_number === String(roomNumber));
  if (!room) throw new Error(`Room ${roomNumber} not found.`);
  const [path, verb] = ACTIONS[action];
  const result = await call('POST', path, token, { roomId: room.room_id });
  console.log(`Room ${roomNumber} ${verb}. Status is now ${result.room.room_status}.`);
  if (result.task) console.log(`Cleaning task #${result.task.task_id} is waiting for the supervisor to assign it.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
