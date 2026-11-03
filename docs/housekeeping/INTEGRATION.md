# Housekeeping integration guide

This subsystem uses the same programming languages, frameworks, and package
versions as the class-wide HOSIS repository. It can be merged as a module
without converting its source code.

## Shared technology stack

| Layer | Language / technology | Class repository compatibility |
| --- | --- | --- |
| Frontend | JavaScript, JSX, React 19, Vite 8, CSS | Same versions (plus `jspdf`, `jspdf-autotable`, `write-excel-file` for report exports) |
| Backend | JavaScript, Node.js, CommonJS, Express 5 | Same versions |
| Database | PostgreSQL SQL through the `pg` driver | Same driver version |
| Authentication | JSON Web Token and bcrypt | Same versions |

## Files owned by Housekeeping

- `frontend/src/modules/housekeeping/`
- `backend/src/modules/housekeeping/`
- `database/schema/06-housekeeping.sql`
- `database/seed/06-housekeeping-seed.sql` (development and demo only)
- `docs/housekeeping/`

Standalone-only files (do not copy into the class repository):
`database/standalone/00-shared-tables.sql`, `backend/src/modules/auth/`
(unless the class project has no login yet), `backend/scripts/`,
`frontend/src/App.jsx`.

## Entry points

```jsx
// Frontend: inside the shared app shell, pass the shell's session so
// Housekeeping does not show its own login page.
import { HousekeepingApp } from './modules/housekeeping/index.js'

<HousekeepingApp session={{ token, user }} onLogout={logout} />
// user = { userId, name, role, position }
```

```js
// Backend
const housekeepingRoutes = require('./modules/housekeeping')
app.use('/api/housekeeping', housekeepingRoutes)
```

The frontend calls the backend under `/api`. During local development, Vite
forwards `/api` to `http://localhost:5000`. The Housekeeping pages use the
hash routes `#/housekeeping/<page>`, and every CSS class starts with `hk-`.

## Shared database contract

Housekeeping owns the tables prefixed with `hk_`. It references three shared
HOSIS tables that must exist before `06-housekeeping.sql` is loaded:

| Shared table | Owner | Columns used by Housekeeping |
| --- | --- | --- |
| `users` | `01-users.sql` | `user_id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `role`, `position`, `employment_status` |
| `rooms` | `04-rooms.sql` | `room_id`, `room_number`, `room_type`, `floor_number`, `room_status`, `updated_at` |
| `guests` | `03-guests.sql` | `guest_id`, `first_name`, `last_name`, `contact_number` |

- `role` values: `ADMIN`, `FRONT_OFFICE`, `HOUSEKEEPING`, `HR`, `FINANCE`,
  `SALES_MARKETING`, `ENGINEERING`.
- `position` for Housekeeping staff: `HOUSEKEEPER`, `INSPECTOR`, `SUPERVISOR`.
  If positions end up in the HR `employees` table instead, the shared login
  must still put `position` in the JWT.
- `room_status` values: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `DIRTY`, `CLEAN`,
  `INSPECTED`, `OUT_OF_ORDER`.

## Endpoints for other departments

| Department | Endpoint | Purpose |
| --- | --- | --- |
| Front Office | `POST /api/housekeeping/checkout` `{ roomId }` | Guest checked out: OCCUPIED → DIRTY and a CHECKOUT cleaning task is created |
| Front Office | `GET /api/housekeeping/notifications?unread=1` | "Room ready" notices raised when a room passes inspection |
| Front Office | `PATCH /api/housekeeping/notifications/:id/read` | Mark a notice handled after releasing the room as AVAILABLE |
| Engineering | `GET /api/housekeeping/maintenance/incoming` | Open maintenance requests reported by Housekeeping |
| Engineering | `PATCH /api/housekeeping/maintenance/:id/status` `{ status }` | Record `IN_PROGRESS` or `REPAIRED` |

## Decisions to confirm with the project manager

These differ from, or are not settled by, the class requirement documents.
The code follows the proposal in the last column until the project manager
decides otherwise.

| Topic | Class documents | Housekeeping proposal (current code) |
| --- | --- | --- |
| Who sets OUT_OF_ORDER | Users and Roles 1.7: Engineering | Housekeeping sets it when reporting a problem; only Engineering marks the repair REPAIRED |
| Room after repair | OUT_OF_ORDER → CLEAN → INSPECTED | OUT_OF_ORDER → DIRTY plus a high-priority cleaning task, so the room is cleaned and inspected before it is sold |
| Maintenance request table | Engineering owns maintenance requests | One table, `hk_maintenance_requests`, read and updated by Engineering through the endpoints above (no second table) |
| Guest requests | FO-014: Front Office records guest requests | Housekeeping-type requests (towels, amenities, extra bed, cleaning, laundry) are kept in `hk_guest_requests` |
| Schedules | HR owns employee schedules | `hk_schedules` holds housekeeping shift and area assignments only |
| Requirement codes | Class HK-001 to HK-011 | See `REQUIREMENTS-MAPPING.md` |

## Merge checklist for the project manager

1. Copy the Housekeeping-owned paths listed above into the class repository.
2. Keep the class repository's root React application and render
   `HousekeepingApp` with the shell's `session` and `onLogout`.
3. Mount the Housekeeping router at `/api/housekeeping`. Keep one global JSON
   parser, CORS setup (`CORS_ORIGIN`), error handler, server listener, and
   PostgreSQL pool.
4. Reuse the class-wide login if its JWT contains `userId`, `role` and
   `position`. Otherwise keep `backend/src/modules/auth/` until login is
   unified.
5. Load the SQL schemas in numerical order. Never load
   `database/standalone/00-shared-tables.sql` there. Load the Housekeeping seed
   only in a development or demo database: it resets all `hk_` tables.
6. Keep the `hk_` table prefix and the `/api/housekeeping` route prefix.
7. Install `jspdf`, `jspdf-autotable` and `write-excel-file` in the combined
   frontend.
8. Run `npm run lint` and `npm run build` in `frontend/`, and `npm test` in
   `backend/` against a test database.
9. Test with Front Office (checkout and room-ready notices) and Engineering
   (incoming requests and REPAIRED) together.

## Environment variables

```env
PORT=5000
DATABASE_URL=postgres://postgres:<password>@localhost:5432/hosis
JWT_SECRET=<a long private secret, at least 16 characters>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
DB_TIME_ZONE=Asia/Manila
```

The backend refuses to start without `DATABASE_URL` or with an empty, short or
example `JWT_SECRET`. Only one `.env` file and one database connection should
be used by the combined backend.
