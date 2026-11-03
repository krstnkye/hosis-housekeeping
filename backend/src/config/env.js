// Checks the environment before the server starts (NFR-SEC-006, NFR-DEP-002).
const EXAMPLE_SECRETS = ['change-this-secret', 'replace-with-the-class-project-secret'];

function assertConfig(env = process.env) {
  const problems = [];
  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  }
  if (!env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set.');
  } else if (EXAMPLE_SECRETS.includes(env.JWT_SECRET) || env.JWT_SECRET.length < 16) {
    problems.push('JWT_SECRET is still the example value or shorter than 16 characters. Use a long private secret.');
  }
  if (problems.length) {
    throw new Error(`Backend configuration error:\n- ${problems.join('\n- ')}\nSee backend/.env.example.`);
  }
}

// Origins allowed to call the API from a browser. Defaults to the Vite dev server.
function corsOrigins(env = process.env) {
  return (env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

module.exports = { assertConfig, corsOrigins };
