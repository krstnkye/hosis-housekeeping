require('dotenv').config();
const { assertConfig } = require('./config/env');

try {
  assertConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`HOSIS API running on http://localhost:${PORT}`);
});
