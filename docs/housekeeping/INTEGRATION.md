# Housekeeping integration guide

This subsystem intentionally uses the same programming languages, frameworks,
and package versions as the class-wide HOSIS repository. It can be merged as a
module without converting its source code.

## Shared technology stack

| Layer | Language / technology | Class repository compatibility |
| --- | --- | --- |
| Frontend | JavaScript, JSX, React 19, Vite 8, CSS | Exact package-version match |
| Backend | JavaScript, Node.js, CommonJS, Express 5 | Exact package-version match |
| Database | PostgreSQL SQL through the `pg` driver | Exact driver-version match |
| Authentication | JSON Web Token and bcrypt | Exact package-version match |

Do not convert this module to PHP, Python, Java, TypeScript, or another database
engine unless the class project manager changes the technology stack for the
entire HOSIS project.

## Files owned by Housekeeping

- `frontend/src/modules/housekeeping/`
- `backend/src/modules/housekeeping/`
- `database/schema/06-housekeeping.sql`
- `database/seed/06-housekeeping-seed.sql`
- `docs/housekeeping/`

The module entry points are:

```js
// Frontend
import { HousekeepingApp } from './modules/housekeeping/index.js'

// Backend
const housekeepingRoutes = require('./modules/housekeeping')
app.use('/api/housekeeping', housekeepingRoutes)
```

The frontend expects the backend under `/api`. During local development,
Vite forwards `/api` to `http://localhost:5000`.

## Shared database contract

Housekeeping owns tables prefixed with `hk_`. It references three shared HOSIS
tables that must be created before `06-housekeeping.sql`:

| Shared table | Required columns used by Housekeeping |
| --- | --- |
| `users` | `user_id`, `first_name`, `last_name`, `username`, `password_hash`, `role`, `position`, `employment_status` |
| `rooms` | `room_id`, `room_number`, `room_type`, `floor_number`, `room_status`, `updated_at` |
| `guests` | `guest_id`, `first_name`, `last_name`, `contact_number` |

The current Housekeeping schema includes minimal `CREATE TABLE IF NOT EXISTS`
definitions so the standalone repository can run while the owners of the shared
tables are still developing them. In the combined HOSIS database, load schemas
in numerical order and let `01-users.sql`, `03-guests.sql`, and `04-rooms.sql`
create the shared tables first.

## Merge checklist for the project manager

1. Copy the Housekeeping-owned paths listed above into the class repository.
2. Keep the class repository's root React application and import
   `HousekeepingApp` from the module entry point instead of replacing the root
   application with the standalone `frontend/src/App.jsx`.
3. Mount the Housekeeping router at `/api/housekeeping` in the shared Express
   application. Keep only one global JSON parser, CORS setup, error handler, and
   server listener in the combined backend.
4. Reuse the class-wide authentication route if it returns the same JWT fields:
   `userId`, `role`, and `position`. Otherwise retain the included
   `backend/src/modules/auth/` implementation until authentication is unified.
5. Load the SQL schemas in numerical order, then load the Housekeeping seed only
   in development or demo databases.
6. Preserve the `hk_` table prefix and `/api/housekeeping` route prefix to avoid
   naming collisions with other departments.
7. Run `npm install`, `npm run lint`, and `npm run build` in `frontend/`, then
   start the shared backend and test the Housekeeping login and all eight pages.

## Environment variables

The backend uses the same environment style as the class project:

```env
PORT=5000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hosis
JWT_SECRET=replace-with-the-class-project-secret
JWT_EXPIRES_IN=8h
```

Only one `.env` file and one PostgreSQL database connection should be used by
the combined backend.
