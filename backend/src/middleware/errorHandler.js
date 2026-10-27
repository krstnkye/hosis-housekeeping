// Sends every error as { error: message } so the frontend can show it (SYS-007).
function errorHandler(err, req, res, _next) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  // PostgreSQL constraint errors become readable 400/409 responses.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with the same details already exists.' });
  }
  if (err.code === '23503' || err.code === '23514' || err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid value: ' + (err.detail || err.message) });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = errorHandler;
