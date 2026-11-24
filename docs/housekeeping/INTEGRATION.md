# Housekeeping integration guide

This subsystem uses the same programming languages, frameworks, and package
versions as the class-wide HOSIS repository. It can be merged as a module
without converting its source code.

## Current integration status

This checkout uses the integrated HOSIS layout: the Housekeeping frontend,
backend routes, database schema, and tests live beside the shared application
files. The main Express application mounts the router at `/api/housekeeping`,
and the module uses the shared database pool, authentication middleware,
users, rooms, and guests.

| Integration | Status in this repository |
| --- | --- |
| Shared application shell | Supported through `<HousekeepingApp session={{ token, user }} onLogout={logout} />` |
| Shared authentication | Compatible with the shared JWT when it contains `userId`, `role`, and `position` and uses the same `JWT_SECRET` |
| Shared users, rooms, and guests | Implemented through foreign keys and read-only lookups; Housekeeping does not duplicate these master tables |
| Front Office room turnover | Implemented: checkout, room-ready/condition notifications, booking-linked guest requests, reservation-reference tracking, and protected release/check-in verification utilities |
| Engineering maintenance | Implemented: incoming request queue and protected `IN_PROGRESS`/`REPAIRED` updates |
| HR/staff master data | Implemented: shared staff identity plus private Housekeeping leave submission and HR-only approve/reject decisions |
| Finance guest charges | Implemented: Housekeeping records evidence, Front Office validates the stay context, and Finance decides the final amount; Housekeeping cannot post a charge |
| Reservations/bookings | Linked by optional `reservationReference`; no foreign key is imposed because Front Office owns the reservation schema |
| Reports and audit | Implemented: supervisors can review a read-only consolidated trail and export the filtered records to PDF or Excel |

The deployment owner should still run the cross-module checks below whenever
Housekeeping is merged with newer work from another subsystem.

## Shared technology stack

| Layer | Language / technology | Class repository compatibility |
| --- | --- | --- |
| Frontend | JavaScript, JSX, React 19, Vite 8, CSS | Same versions (plus `jspdf`, `jspdf-autotable`, `write-excel-file` for report exports and `qrcode` for lost-and-found labels) |
| Backend | JavaScript, Node.js, CommonJS, Express 5 | Same versions |
| Database | PostgreSQL SQL through the `pg` driver | Same driver version |
| Authentication | JSON Web Token and bcrypt | Same versions |

## Files owned by Housekeeping

- `frontend/src/modules/housekeeping/`
- `backend/src/modules/housekeeping/`
- `database/schema/06-housekeeping.sql`
- `database/seed/06-housekeeping-seed.sql` (non-production development data only)
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
| Front Office | `GET /api/housekeeping/notifications?unread=1` | Notices from Housekeeping: `notice_type` ROOM_READY (room passed inspection) or ROOM_CONDITION (a staff member reported a room's condition: damage, missing items, smoking, ...) |
| Front Office | `PATCH /api/housekeeping/notifications/:id/read` | Mark a notice handled after releasing the room as AVAILABLE |
| Front Office | `POST /api/housekeeping/front-office/guest-requests` | Send a housekeeping-type request from an existing booking; accepts optional `guestId` and `reservationReference` |
| Front Office | `GET /api/housekeeping/front-office/guest-requests?reservationReference=...` | Read the current Housekeeping status of requests linked to a booking |
| Front Office (stand-in) | `GET /api/housekeeping/front-office/rooms` | Every room and its status (used by `npm run frontoffice`) |
| Front Office (stand-in) | `POST /api/housekeeping/front-office/release` `{ roomId }` | INSPECTED → AVAILABLE and the room's ROOM_READY notices marked read |
| Front Office (stand-in) | `POST /api/housekeeping/front-office/check-in` `{ roomId }` | AVAILABLE or RESERVED → OCCUPIED |
| Engineering | `GET /api/housekeeping/maintenance/incoming` | Open maintenance requests reported by Housekeeping |
| Engineering | `PATCH /api/housekeeping/maintenance/:id/status` `{ status }` | Record `IN_PROGRESS` or `REPAIRED` |
| Front Office | `GET /api/housekeeping/integrations/front-office/charge-findings` | Read charge findings awaiting Front Office validation |
| Front Office | `PATCH /api/housekeeping/integrations/front-office/charge-findings/:id` | Reject with a reason or forward a reservation-linked finding to Finance |
| Finance | `GET /api/housekeeping/integrations/finance/charge-findings` | Read findings validated by Front Office |
| Finance | `PATCH /api/housekeeping/integrations/finance/charge-findings/:id` | Approve with a final amount or reject; repeated decisions are refused |
| Human Resources | `GET /api/housekeeping/integrations/hr/leave-requests` | Read Housekeeping leave requests without exposing them to coworkers |
| Human Resources | `PATCH /api/housekeeping/integrations/hr/leave-requests/:id` | Approve or reject with reviewer identity and decision notes |

Housekeeping personnel use `GET/POST /api/housekeeping/leave-requests` and
`PATCH /api/housekeeping/leave-requests/:id/withdraw` for their own leave
records. They use `GET/POST /api/housekeeping/charge-findings` and
`PATCH /api/housekeeping/charge-findings/:id/withdraw` for operational
findings. Backend authorization and ownership checks apply even when a caller
manually invokes an endpoint outside the interface.

## Public Lost & Found QR lookup

`GET /api/public/lost-found/:publicCode` is the permanent destination printed
inside each item's QR label. A random code is assigned once when the record is
created; printing or downloading the label does not regenerate it. The route
does not require a login and returns only the reference, item description,
found location/date, and current status. It never returns guest, claimant,
staff, internal storage, claim-history, or credential data.

The three verification endpoints let an isolated installation complete the
room cycle. In the integrated repository, the Front Office module owns check-in
and room release and the shared room record remains the source of truth.

Front Office should read `notice_type` on each notice: `ROOM_READY` means the
room can be released as AVAILABLE; `ROOM_CONDITION` is a staff member's report
(damage, missing items, smoking, pests, safety hazard, excessive mess) that
Front Office may need to charge or follow up with the guest.

When Front Office calls `POST /checkout`, it may include
`reservationReference`. Housekeeping copies that reference to the generated
checkout cleaning task. The reference is intentionally not a foreign key:
Front Office owns the reservations table, while Housekeeping only preserves
the identifier needed for cross-module traceability. The same rule applies to
guest requests created through the Front Office integration endpoint.

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
| Linen and supply inventory | Not in the class requirements | `hk_inventory_items` and `hk_inventory_movements`, owned by Housekeeping. Guest requests can name a stock item (`inv_item_id`, `quantity_requested`, `stock_approved_at`); there is no Inventory page. Purchasing stays with Finance; Housekeeping only records stock on hand and use |
| Forgot password | Not settled (Users and Roles gives ADMIN user management) | Housekeeping supervisors set temporary passwords for active HOUSEKEEPING accounts only (`hk_password_resets`, `hk_password_must_change`); ADMIN keeps full user management |
| Login lockout | NFR-SEC-001 | Failed sign-ins in `hk_login_failures` (5 failures per account and address in 15 minutes). A shared login can replace it |

## Integration verification checklist

1. Copy the Housekeeping-owned paths listed above into the class repository.
2. Keep the class repository's root React application and render
   `HousekeepingApp` with the shell's `session` and `onLogout`.
3. Mount the Housekeeping router at `/api/housekeeping`. Keep one global JSON
   parser, CORS setup (`CORS_ORIGIN`), error handler, server listener, and
   PostgreSQL pool.
4. Reuse the class-wide login if its JWT contains `userId`, `role` and
   `position` and is signed with the same `JWT_SECRET`. Otherwise keep
   `backend/src/modules/auth/` until login is unified. Housekeeping's
   `authenticate` re-reads the account on every request (status, role,
   position, temporary password), so a deactivated account is signed out at
   once. Tokens from Housekeeping's own login also carry `pwv`, a short
   fingerprint of the password hash, so they stop working when the password
   changes; tokens without `pwv` are still accepted.
   The JSON body limit is 3 MB so one lost-and-found photo fits; keep it at
   least that large in the shared `express.json()`.
5. Load the SQL schemas in numerical order. Never load
   `database/standalone/00-shared-tables.sql` there. Load the Housekeeping seed
   only in a disposable development database: it resets all `hk_` tables.
6. Keep the `hk_` table prefix and the `/api/housekeeping` route prefix.
7. Install `jspdf`, `jspdf-autotable`, `write-excel-file` and `qrcode` in the
   combined frontend.
8. Run `npm run lint` and `npm run build` in `frontend/`, and `npm test` in
   `backend/` against a test database.
9. Test jointly with Front Office (checkout, room-ready and room-condition
   notices, booking-linked requests, room release, charge validation), Finance
   (final amount and single invoice linkage), Human Resources (private leave
   decision), and Engineering (incoming requests and REPAIRED).

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
