// Sends every error as { error: message } so the frontend can show it (SYS-007).
function errorHandler(err, req, res, _next) {
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  // A request body that is not valid JSON, or too large.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request could not be read. Please try again.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The upload is too large.' });
  }
  // PostgreSQL errors caused by the input become readable 400/409 responses
  // instead of "Something went wrong".
  switch (err.code) {
    case '23505':
      return res.status(409).json({ error: 'A record with the same details already exists.' });
    case '23503':
    case '23514':
      return res.status(400).json({ error: 'Invalid value: ' + (err.detail || err.message) });
    case '22001':
      return res.status(400).json({ error: 'One of the fields is too long.' });
    case '22003':
      return res.status(400).json({ error: 'A number is out of range.' });
    case '22007':
    case '22008':
      return res.status(400).json({ error: 'Please enter a valid date or time.' });
    case '22P02':
      return res.status(400).json({ error: 'One of the values is not in the right format.' });
    default:
      break;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = errorHandler;
