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
| `maria.santos@grandhorizon.ph` (`hk.supervisor`) | Supervisor  | Everything, incl. create/assign tasks and schedules |
| `hk.inspector`  | Inspector   | Inspect rooms, plus general housekeeping functions  |
| `hk.liza`, `hk.joy`, `hk.mark` | Housekeeper | Work on their own tasks, requests, lost & found, maintenance |
| `fo.desk`       | Front Office | Is denied at the Housekeeping login; uses the Front Office endpoints |
| `eng.tech`      | Engineering  | Is denied at the Housekeeping login; uses the Engineering endpoints |

## Flowchart to feature map

| Flowchart step | Screen | API |
| -------------- | ------ | --- |
| Housekeeping Staff Log In / Authorized? / Access Denied | Login | `POST /api/auth/login` with `department: HOUSEKEEPING` |
| Housekeeping Dashboard / Select Function | Overview | `GET /dashboard` |
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
| Valid Claim? / HK-012 Release Item | Lost & Found | `POST /lost-found/:id/claims` |
| HK-013 Record Request, Assign / Process | Guest Requests | `POST /guest-requests`, `PATCH /guest-requests/:id` |
| HK-014 Complete Request | Guest Requests | `POST /guest-requests/:id/complete` |
| HK-015 Create Maintenance Request, Set Room OUT OF ORDER | Maintenance | `POST /maintenance` |
| Engineering Completes Repair | (Engineering) | `PATCH /maintenance/:id/status` (`status: REPAIRED`), ENGINEERING role |
| Update Status / Create Cleaning Task | Maintenance | `POST /maintenance/:id/release` |

All API paths above are under `/api/housekeeping` and need a JWT from a
HOUSEKEEPING (or ADMIN) account, except the Engineering and Front Office
endpoints listed below.

## Endpoints for other departments

| Department | Endpoint | Purpose |
| ---------- | -------- | ------- |
| Front Office | `POST /api/housekeeping/checkout` `{ roomId }` | Guest checked out: OCCUPIED → DIRTY and a CHECKOUT cleaning task is created |
| Front Office | `GET /api/housekeeping/notifications?unread=1` | "Room ready" notices raised when a room passes inspection |
| Front Office | `PATCH /api/housekeeping/notifications/:id/read` | Mark a notice handled after releasing the room as AVAILABLE |
| Engineering | `GET /api/housekeeping/maintenance/incoming` | Open maintenance requests reported by Housekeeping |
| Engineering | `PATCH /api/housekeeping/maintenance/:id/status` `{ status }` | Record `IN_PROGRESS` or `REPAIRED` (REPAIRED lets Housekeeping release the room) |

While the Engineering module does not exist yet, record a repair for a demo
with the seeded `eng.tech` account (backend running):

```bash
cd backend
npm run engineering -- list
npm run engineering -- 1 REPAIRED
```

## Business rules

* **Room status lifecycle.** By hand, Housekeeping can only set DIRTY or
  CLEAN (see `MANUAL_TRANSITIONS` in `roomStatus.js`). CLEAN comes from
  completing a task, INSPECTED only from a passed inspection, and OUT_OF_ORDER
  only from a maintenance request. Front Office owns AVAILABLE, RESERVED and
  OCCUPIED. A room leaves OUT_OF_ORDER only when its maintenance request is
  released, and no task can be started, completed or inspected while it is out
  of order. Every change is written to `hk_room_status_logs`.
* **Cleaning tasks** go PENDING → ASSIGNED → IN_PROGRESS → COMPLETED →
  INSPECTED. A failed inspection sets the task to RETURNED and the room back
  to DIRTY; the same housekeeper cleans it again. A room can only have one open
  task at a time.
* **Who can do what.** Only supervisors create and assign tasks and
  schedules. Only inspectors and supervisors record inspections. Only the
  assigned housekeeper (or a supervisor) starts and completes a task.
* **Lost & found.** An item is released only when the claimant's ID is
  verified and their description matches; otherwise the claim is saved as
  REJECTED and the item stays stored.
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
