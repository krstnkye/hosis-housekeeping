# Requirement code mapping

Our documentation, flowchart and code use the Housekeeping flowchart codes
**HK-001 to HK-015**. The class HOSIS repository
(`docs/requirements/functional-requirements.md`) uses its own
**HK-001 to HK-011**, and the same number means different things in the two
lists (for example, class HK-002 is "create housekeeping tasks", while our
HK-002 is "Select Room"). This table links them, so both can be traced.

| Class HOSIS requirement | Meaning (class) | Housekeeping flowchart code(s) | Where it is implemented |
| --- | --- | --- | --- |
| HK-001 | View rooms requiring cleaning | HK-001 View Room Status | Room Status page, `GET /rooms` |
| HK-002 | Create housekeeping tasks | HK-004 Create or Update Task | Cleaning Tasks page, `POST /tasks` |
| HK-003 | Assign cleaning tasks to staff | HK-005 Assign Housekeeper | `POST /tasks`, `PATCH /tasks/:id` (`staffId`) |
| HK-004 | Staff view their assigned tasks | HK-006 Perform Cleaning | `GET /tasks?mine=1`, notification bell |
| HK-005 | Staff update cleaning task status | HK-006 Perform Cleaning, Cleaning Completed? | `POST /tasks/:id/start`, `POST /tasks/:id/complete` |
| HK-006 | Update room cleaning status | HK-003 Update Room Status | `PATCH /rooms/:id/status` (logged) |
| HK-007 | Inspect cleaned rooms | HK-007 Inspect Room | Inspection page, `GET /inspections/queue` |
| HK-008 | Record inspection results | HK-007, Inspection Passed?, Mark INSPECTED or Return for Re-cleaning | `POST /inspections` |
| HK-009 | Create lost and found records | HK-010 Record Found Item, Store and Label Item | `POST /lost-found` |
| HK-010 | Update and track lost and found records | HK-011 Search or View Records, HK-012 Release Item | `GET /lost-found`, `PATCH /lost-found/:id`, `POST /lost-found/:id/claims` |
| HK-011 | View guest and room information needed for cleaning | HK-002 Select Room | `GET /rooms/:id`, `GET /guests` (names only) |
| System scope 3.2 "Housekeeping schedules" | Housekeeping schedules | HK-008 View Staff Schedule, HK-009 Create or Update Schedule | Schedules and My Schedule pages, `/schedules` |
| System scope 3.2 "Housekeeping requests" | Housekeeping requests | HK-013 Record Request, HK-014 Complete Request | Guest Requests page, `/guest-requests` |
| ENG-001, section 9.4 | Report problems to Engineering | HK-015 Create Maintenance Request | Maintenance page, `POST /maintenance` |
| ENG-002, ENG-003 | Engineering views and updates maintenance requests | (Engineering side of HK-015) | `GET /maintenance/incoming`, `PATCH /maintenance/:id/status` |
| Section 9.1 | Checkout makes the room DIRTY and Housekeeping receives a task | (Front Office side) | `POST /checkout` |
| (beyond the class list) | Stock for a guest request (Figma Guest Request screen) | (added after the flowchart) | Guest Requests Inventory stock card, `/guest-requests/:id/approve-stock` |
| NFR-SEC-001, Users and Roles | Sign-in lockout, password change and reset | Log In, Authorized? | Login, Account and Staff Accounts pages, `/api/auth/login`, `/api/auth/password`, `/api/auth/forgot-password`, `/password-resets` |
| HK-010 | Update and track lost and found records (photos, labels, disposal) | HK-010 Store and Label Item, HK-011 Search or View Records | Lost & Found page, `/lost-found/:id/photos`, `/lost-found/:id/dispose` |
