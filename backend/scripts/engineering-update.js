// Demo helper for running Housekeeping on its own, before the Engineering
// module exists: signs in as the seeded Engineering account and records
// repair progress through the real Engineering endpoints.
//
//   npm run engineering -- list
//   npm run engineering -- <requestId> IN_PROGRESS
//   npm run engineering -- <requestId> REPAIRED
//
// The backend must be running. API_URL defaults to http://localhost:5000/api.
const API = process.env.API_URL || 'http://localhost:5000/api';
const USERNAME = process.env.ENG_USERNAME || 'eng.tech';
const PASSWORD = process.env.ENG_PASSWORD || 'password123';

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

(async () => {
  const [requestId, status] = process.argv.slice(2);
  const { token } = await call('POST', '/auth/login', null, {
    username: USERNAME,
    password: PASSWORD,
    department: 'ENGINEERING',
  });
  if (!requestId || requestId === 'list') {
    const { requests } = await call('GET', '/housekeeping/maintenance/incoming', token);
    for (const r of requests) {
      console.log(`#${r.request_id}  Room ${r.room_number}  ${r.issue_category}  ${r.priority}  ${r.status}  ${r.issue_description}`);
    }
    if (!requests.length) console.log('No open maintenance requests.');
    return;
  }
  const { request } = await call('PATCH', `/housekeeping/maintenance/${requestId}/status`, token, { status });
  console.log(`Request #${request.request_id} is now ${request.status}.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
