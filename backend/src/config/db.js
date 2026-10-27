const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

module.exports = { pool, query: (text, params) => pool.query(text, params), withTransaction };
