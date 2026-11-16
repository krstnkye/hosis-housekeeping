const { Pool, types } = require('pg');

// Every connection uses the hotel's time zone, so "today" in queries
// (CURRENT_DATE, NOW()) matches the hotel's local date.
const TIME_ZONE = process.env.DB_TIME_ZONE || 'Asia/Manila';

// TIMESTAMP columns hold hotel local time with no zone. Node reads them in its
// own zone, so it must use the hotel's zone too; otherwise a server set to
// another zone (e.g. UTC) would shift every time by hours.
process.env.TZ = TIME_ZONE;
// DATE columns (shift_date, assigned_date) are sent as plain 'YYYY-MM-DD',
// not as a midnight timestamp that can land on the previous day in UTC.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c TimeZone=${TIME_ZONE}`,
});

// Today's date (YYYY-MM-DD) in the hotel's time zone.
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

// Runs fn(client) inside a transaction so multi-step changes
// (e.g. task update + room status + status log) save together or not at all.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query: (text, params) => pool.query(text, params), withTransaction, today, TIME_ZONE };
