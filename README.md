# HOSIS Housekeeping Subsystem (BSIT 3 - Alpha)

The Housekeeping module of HOSIS, built from the Housekeeping Department
Flowchart (`docs/Flowchart/housekeeping-department-flowchart.drawio`), the
Housekeeping ERD in our documentation, and the HOSIS Housekeeping UI Figma file.

- **Figma UI:** [HOSIS UI HOUSEKEEPING UI](https://www.figma.com/design/U9agEBllMDawm1r6kw5zjh/HOSIS-UI-HOUSEKEEPING-UI?node-id=0-1&t=0KxXxH3KA1KuYSKY-1)
- **Project documentation:** `docs/housekeeping/documentation/HOSIS_Housekeeping_Subsystem_Complete_Documentation_2026_corrected.docx` (current; older versions are kept in the same folder)
- **Class-project integration:** `docs/housekeeping/INTEGRATION.md`

| Layer    | Location                                         |
| -------- | ------------------------------------------------ |
| Database | `database/schema/06-housekeeping.sql`, `database/seed/06-housekeeping-seed.sql` |
| Backend  | `backend/src/modules/housekeeping/` (REST API under `/api/housekeeping`) |
| Login    | `backend/src/modules/auth/` (`POST /api/auth/login`, JWT) |
| Frontend | `frontend/src/modules/housekeeping/` |
| Tests    | `backend/test/housekeeping.test.js` |

## Running it locally

1. Create a PostgreSQL database and load the shared tables, the schema and the
   sample data (the seed resets all Housekeeping demo data each time it runs):

   ```bash
   createdb hosis
   psql hosis -f database/standalone/00-shared-tables.sql
   psql hosis -f database/schema/06-housekeeping.sql
   psql hosis -f database/seed/06-housekeeping-seed.sql
   ```

2. Start the backend:

   ```bash
   cd backend
   cp .env.example .env      # then set DATABASE_URL and a long JWT_SECRET
   npm install
   npm run dev               # http://localhost:5000
   ```

3. Start the frontend (it forwards `/api` to the backend):

   ```bash
   cd frontend
   npm install
   npm run dev               # http://localhost:5173
   ```

4. Run the API tests (they reload the seed, which resets Housekeeping data in
   the database in `DATABASE_URL`, so use a development or test database):

   ```bash
   cd backend
   npm test
   ```

### Sample accounts

All passwords are `password123`. Staff sign in with their email (the
username also works).

| Email / username | Position    | Can do                                              |
| ---------------- | ----------- | --------------------------------------------------- |
| `maria.santos@grandhorizon.ph` (`hk.supervisor`) | Supervisor  | Everything, incl. create/assign tasks and schedules, reports, inventory counts, disposing found items, and resetting staff passwords |
| `hk.inspector`  | Inspector   | Inspect rooms (not ones they cleaned), reports, plus general housekeeping functions |
| `hk.liza`, `hk.joy`, `hk.mark` | Housekeeper | Work on their own tasks and requests, lost & found, maintenance, room reports, stock in/out |
| `fo.desk`       | Front Office | Is denied at the Housekeeping login; uses the Front Office endpoints |
| `eng.tech`      | Engineering  | Is denied at the Housekeeping login; uses the Engineering endpoints |

The sample data also has one waiting "Forgot password" request (from
`hk.mark`) so the Staff Accounts page has something to show.

## Flowchart to feature map

| Flowchart step | Screen | API |
| -------------- | ------ | --- |
| Housekeeping Staff Log In / Authorized? / Access Denied | Login | `POST /api/auth/login` with `department: HOUSEKEEPING` |
| Housekeeping Dashboard / Select Function | Overview | `GET /dashboard` |
| Housekeeping Dashboard (housekeepers) | Staff Dashboard: own tasks with Start / Complete, own guest requests, today's shift, notifications | `GET /tasks?mine=1`, `GET /guest-requests`, `GET /schedules/mine`, `GET /alerts` |
| Staff account | Account | `GET /api/auth/account`, `POST /api/auth/password` |
| Staff personal record | My Record | `GET /me/record` |
| Report room condition to Front Office / Maintenance | Report Room | `POST /room-reports` (Front Office notice), `POST /maintenance`, `GET /me/reports` |
| Forgot password | Login (Forgot password?), Staff Accounts (supervisor), Choose a new password | `POST /api/auth/forgot-password`, `GET /password-resets`, `POST /password-resets/staff/:userId`, `POST /password-resets/:id/dismiss` |
| HK-001 View Room Status | Room Status | `GET /rooms` |
| HK-002 Select Room | Room Status (right panel) | `GET /rooms/:id` |
| HK-003 Update Room Status (logged) | Room Status | `PATCH /rooms/:id/status` |
| Notify Front Office of Room Availability | Room Status, Overview | `GET /notifications` (created automatically on INSPECTED) |
| HK-004 Create / Update Task | Cleaning Tasks | `POST /tasks`, `PATCH /tasks/:id` |
| HK-005 Assign Housekeeper | Cleaning Tasks | `PATCH /tasks/:id` (`staffId`) |
| HK-006 Perform Cleaning / Cleaning Completed? | Cleaning Tasks | `POST /tasks/:id/start`, `POST /tasks/:id/complete` |
| HK-007 Inspect Room / Inspection Passed? | Inspection | `GET /inspections/queue`, `POST /inspections` |
| Mark CLEAN / INSPECTED or Return for Re-cleaning | Inspection | result `PASSED` or `FAILED` |
| HK-008 View Staff Schedule | Schedules | `GET /schedules?date=` |
| HK-009 Create / Update Schedule, Assign Workload / Shift | Schedules | `POST /schedules`, `PATCH /schedules/:id` |
| HK-010 Record Found Item, Store / Label Item | Lost & Found | `POST /lost-found` (label `LF-0001`) |
| HK-011 Search / View Records | Lost & Found | `GET /lost-found?search=` |
| Valid Claim? / HK-012 Release Item | Lost & Found (ID type and number recorded) | `POST /lost-found/:id/claims` |
| Item photos, QR storage label | Lost & Found | `POST /lost-found/:id/photos`, `GET /lost-found/:id/photos/:photoId` (QR made in the browser) |
| Dispose of unclaimed item (supervisor) | Lost & Found | `POST /lost-found/:id/dispose` `{ reason }` |
| HK-013 Record Request, Assign / Process | Guest Requests | `POST /guest-requests`, `PATCH /guest-requests/:id` |
| HK-014 Complete Request | Guest Requests | `POST /guest-requests/:id/complete` |
| HK-015 Create Maintenance Request, Set Room OUT OF ORDER | Maintenance | `POST /maintenance` |
| Engineering Completes Repair | (Engineering) | `PATCH /maintenance/:id/status` (`status: REPAIRED`), ENGINEERING role |
| Update Status / Create Cleaning Task | Maintenance | `POST /maintenance/:id/release` |
| Linen, amenity and supply stock | Inventory | `GET /inventory`, `POST /inventory` (supervisor), `PATCH /inventory/:id` (supervisor), `POST /inventory/:id/movements`, `GET /inventory/movements` |
| Performance and history | Reports (supervisor, inspector) | `GET /reports/summary?from=&to=`, `GET /reports/history?type=` (`tasks`, `inspections` or `status`) |

All API paths above are under `/api/housekeeping` and need a JWT from a
HOUSEKEEPING (or ADMIN) account, except the Engineering and Front Office
endpoints listed below.

## Endpoints for other departments

| Department | Endpoint | Purpose |
| ---------- | -------- | ------- |
| Front Office | `POST /api/housekeeping/checkout` `{ roomId }` | Guest checked out: OCCUPIED → DIRTY and a CHECKOUT cleaning task is created |
| Front Office | `GET /api/housekeeping/notifications?unread=1` | Notices from Housekeeping: `notice_type` ROOM_READY (room passed inspection) or ROOM_CONDITION (a staff member's room condition report) |
| Front Office | `PATCH /api/housekeeping/notifications/:id/read` | Mark a notice handled after releasing the room as AVAILABLE |
| Front Office (stand-in) | `GET /api/housekeeping/front-office/rooms` | Every room and its status |
| Front Office (stand-in) | `POST /api/housekeeping/front-office/release` `{ roomId }` | INSPECTED → AVAILABLE; marks the room's "room ready" notices read |
| Front Office (stand-in) | `POST /api/housekeeping/front-office/check-in` `{ roomId }` | AVAILABLE or RESERVED → OCCUPIED |
| Engineering | `GET /api/housekeeping/maintenance/incoming` | Open maintenance requests reported by Housekeeping |
| Engineering | `PATCH /api/housekeeping/maintenance/:id/status` `{ status }` | Record `IN_PROGRESS` or `REPAIRED` (REPAIRED lets Housekeeping release the room) |

While the Engineering module does not exist yet, record a repair for a demo
with the seeded `eng.tech` account (backend running):

```bash
cd backend
npm run engineering -- list
npm run engineering -- 1 REPAIRED
```

The three "stand-in" Front Office endpoints exist only so the whole room cycle
can be shown before the Front Office module exists. The combined HOSIS app
should use the Front Office module's own check-in and room release instead.
To play Front Office in a demo with the seeded `fo.desk` account:

```bash
cd backend
npm run frontoffice -- rooms            # every room and its status
npm run frontoffice -- notices          # unread notices from Housekeeping
npm run frontoffice -- release 203      # INSPECTED -> AVAILABLE
npm run frontoffice -- checkin 203      # AVAILABLE -> OCCUPIED
npm run frontoffice -- checkout 203     # OCCUPIED -> DIRTY + cleaning task
```

## Business rules

* **Room status lifecycle.** By hand, Housekeeping can only mark a room
  DIRTY (from AVAILABLE, OCCUPIED, CLEAN or INSPECTED; see
  `MANUAL_TRANSITIONS` in `roomStatus.js`). CLEAN comes only from
  completing a cleaning task, so every cleaned room goes to inspection, INSPECTED only from a passed inspection, and OUT_OF_ORDER
  only from a maintenance request. Front Office owns AVAILABLE, RESERVED and
  OCCUPIED. A room leaves OUT_OF_ORDER only when its maintenance request is
  released, and no task can be started, completed or inspected while it is out
  of order. Every change is written to `hk_room_status_logs`.
* **Cleaning tasks** go PENDING → ASSIGNED → IN_PROGRESS → COMPLETED →
  INSPECTED. A failed inspection sets the task to RETURNED and the room back
  to DIRTY; the same housekeeper cleans it again. A room can only have one open
  task at a time.
* **Who can do what.** Only supervisors create and assign tasks and
  schedules. Only inspectors and supervisors record inspections, and nobody
  inspects a room they cleaned themselves. Only the assigned housekeeper (or a
  supervisor) starts and completes a task.
* **Guest requests.** A housekeeper may take an unassigned request for
  themselves and work on their own requests. Only supervisors and inspectors
  assign a request to someone else or update another person's request.
* **Schedules.** A staff member cannot have two shifts that overlap (a night
  shift that runs past midnight counts against the next morning), and a shift
  cannot be created on, or moved to, a date that has passed.
* **Lost & found.** An item is released only when the claimant's ID is
  verified and their description matches; otherwise the claim is saved as
  REJECTED and the item stays stored. A verified claim must record the ID type
  and number; only the last 4 characters of the number are saved. Only a
  supervisor can dispose of an item, and must give a reason, which is kept with
  their name and the date. An item can have up to 3 photos (JPEG, PNG or WebP,
  2 MB each; the browser shrinks them before upload).
* **Inventory.** Every stock change is a movement (IN, OUT or ADJUST) with the
  balance after it. Stock cannot go below zero. Any housekeeping staff member
  records stock in and out; only supervisors add items, change reorder levels
  and record stock counts (ADJUST, with a reason). Items at or below their
  reorder level appear in the supervisor's notifications.
* **Sign-in and passwords.** After 5 wrong passwords for the same account from
  the same address, sign-in is locked for 15 minutes; failures are stored in
  `hk_login_failures`, so a restart does not clear them. Each request re-checks
  the account, so a deactivated account or a changed password ends every
  session at once. "Forgot password?" sends a request to the supervisor (there
  is no email server); the supervisor sets a temporary password on Staff
  Accounts and gives it in person, and the staff member must choose a new
  password before doing anything else.
* **Input checks.** Text longer than its database column, invalid dates and
  times, and dates found in the future are refused with a clear message
  (HTTP 400) instead of a server error.
* **Pages refresh** quietly every 30 seconds while the tab is visible, so two
  people on the same list see each other's changes.
* **Maintenance.** Reporting can set the room OUT_OF_ORDER (not while it is
  OCCUPIED or RESERVED; Front Office moves the guest first). Only Engineering
  marks the repair REPAIRED. Housekeeping then releases it: the room becomes
  DIRTY and gets a high-priority cleaning task (a new POST_REPAIR task, or the
  task that was open when the room went out of order, reopened).

## Notes for the other HOSIS groups

* Housekeeping tables use the `hk_` prefix so they never clash with other
  departments' tables.
* `06-housekeeping.sql` only creates `hk_` tables. The minimal `users`,
  `rooms` and `guests` tables for running standalone are in
  `database/standalone/00-shared-tables.sql`, which must not be loaded in the
  combined HOSIS database.
* `backend/src/app.js` mounts each subsystem's router
  (`app.use('/api/<subsystem>', ...)`), so other groups can add theirs next to
  `/api/housekeeping`.
* The sidebar items for other departments are placeholders until their
  modules exist.

## Added after the November 12, 2026 audit

| Area | What changed |
| ---- | ------------ |
| Room Status | A dirty room can no longer be marked CLEAN by hand; it must be cleaned through its task and inspected |
| Inspection | The person who cleaned a room cannot inspect it |
| Guest Requests | Housekeepers cannot take over or close someone else's request |
| Schedules | No overlapping shifts; no shifts in the past |
| Lost & Found | Photos, printable QR storage label, ID type and number on claims, supervisor-only disposal with a reason |
| Inventory (new page) | Linen, amenities and cleaning supplies: stock in/out, stock counts, low-stock alerts, export |
| Reports (new page) | Totals, rooms cleaned per day, staff performance and history for any range up to 92 days, with PDF/Excel export |
| Staff Accounts (new page) | Forgot-password requests and temporary passwords (supervisors) |
| Account and My Record | Now also for supervisors and inspectors |
| Sign-in | Lockout survives a restart; sessions end when the password changes or the account is deactivated |
| Front Office demo | Stand-in endpoints and `npm run frontoffice` |
| Errors | Bad input gets a clear message instead of "Something went wrong" |

## Screenshots

`docs/housekeeping/screenshots/` has screenshots of every screen taken from the
running app with the sample data, plus the main flow
(assign → clean → fail inspection → re-clean → pass → Front Office notified,
item release, and maintenance release).

## About this repository

This repository holds only the Housekeeping subsystem of HOSIS, so the group
can clone and run it on any laptop. The class-wide hotel system repository is
https://github.com/mayonathaniel44-alt/HOSIS. As of October 27, 2026, its
latest Housekeeping contribution is the editable department flowchart on
`main`; this standalone repository contains the group's current implementation.
As of November 12, 2026, the Housekeeping changes in the class repository are
still reverted (October 28) and its `main` holds empty schema files, so this
repository remains the source for Housekeeping until the class project manager
agrees on when to merge it (see `docs/housekeeping/INTEGRATION.md`).
