# Housekeeping Subsystem Integration Matrix

Ito ang hinihingi ng project leader: pangalan ng subsystem, aling subsystem ang kailangang ka-connect, anong feature/data ang pinapasa, at anong endpoint ang gagamitin.

| Our subsystem | Connected subsystem | Integration feature | Data exchanged | Housekeeping endpoint |
|---|---|---|---|---|
| Housekeeping | Front Office / Reservation | Guest checkout creates a cleaning task | Room ID, reservation reference, checkout notes | `POST /api/housekeeping/checkout` |
| Housekeeping | Front Office / Reservation | Booking-linked housekeeping guest request | Room, guest ID, reservation reference, request type, priority | `POST /api/housekeeping/front-office/guest-requests` |
| Housekeeping | Front Office / Reservation | Front Office tracks booking requests | Reservation reference and request status | `GET /api/housekeeping/front-office/guest-requests?reservationReference=...` |
| Housekeeping | Front Office | Room-ready and room-condition notification | Room, notice type, message, creation/read time | `GET /api/housekeeping/notifications`, `PATCH /api/housekeeping/notifications/:id/read` |
| Housekeeping | Engineering & Maintenance | Housekeeping reports defects; Engineering updates repair progress | Room, issue, priority, OUT_OF_ORDER flag, repair status | `GET /api/housekeeping/maintenance/incoming`, `PATCH /api/housekeeping/maintenance/:id/status` |
| Housekeeping | Human Resources | HR receives staff workload/performance totals | Staff ID/name/position, completed cleaning, inspections, completed requests, scheduled shifts | `GET /api/housekeeping/integrations/hr/staff-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Housekeeping | Finance & Accounting | Finance receives supply/linen usage and reorder information | Item, category, unit, current balance, quantity in/used/adjusted, reorder flag | `GET /api/housekeeping/integrations/finance/inventory-usage?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Housekeeping | HOSIS shared authentication | Shared account and role access | User ID, role, position, employment status | Shared `/api/auth`; Housekeeping re-checks the shared `users` table |
| Housekeeping | Public guest-facing HOSIS page | Permanent Lost & Found QR verification | Reference, item description, found location/date, current status only | `GET /api/public/lost-found/:publicCode` |

## Report and export requirement

The Housekeeping supervisor has a **Reports & Audit Trail** page with:

1. Weekly report (Monday through Sunday).
2. Monthly report (first day through the next month's first day).
3. Annual report (January 1 through the next January 1).
4. Filters for operational category, date period, and search text.
5. PDF, Excel (`.xlsx`), and CSV (`.csv`) export of the currently filtered rows.

Every authenticated Housekeeping staff member also has a **Staff Reports** page.
They may select themselves or another active Housekeeping coworker and download
the operational work record as PDF, Excel, or CSV. The coworker endpoint is
`GET /api/housekeeping/staff-records/:userId`; it excludes passwords, guest
contacts, claimant information, and other private data.

The shared `ExportMenu` now includes CSV, so every Housekeeping page already using the export control—Guest Requests, Inspections, Lost & Found, and the consolidated Reports & Audit Trail—can produce CSV in addition to PDF and Excel. Other operational pages are included in the consolidated audit report.

## Access ownership

- Front Office endpoints require a `FRONT_OFFICE` or `ADMIN` account.
- Engineering endpoints require an `ENGINEERING` or `ADMIN` account.
- HR summary requires an `HR` or `ADMIN` account.
- Finance inventory usage requires a `FINANCE` or `ADMIN` account.
- Housekeeping Reports & Audit requires a Housekeeping supervisor or `ADMIN`.
- The public QR endpoint requires no login but deliberately excludes personal and internal custody data.

## No direct connection required

Sales & Marketing does not currently need a direct operational Housekeeping endpoint. If management later requires room-readiness analytics for promotions, that should be approved as a separate read-only aggregate contract rather than exposing detailed room, guest, or staff records.
