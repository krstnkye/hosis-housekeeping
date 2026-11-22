# Housekeeping security and access controls

The API is the authority for access control. Hiding a button in React is only a
usability measure; every protected operation is independently checked by the
Express routes.

## RBAC summary

- **Housekeeper:** views operational boards, works only on assigned tasks and
  requests, records found items, manages photos/details for items they recorded,
  and reports room or maintenance conditions.
- **Inspector:** records inspections of another employee's completed work and
  cannot approve their own cleaning.
- **Supervisor:** assigns tasks and schedules, performs documented room-status
  corrections, controls stock receipts/counts, verifies lost-item claims and
  disposal, manages staff access, and releases repaired rooms.
- **Front Office and Engineering:** use scoped integration endpoints and cannot
  acquire unrestricted Housekeeping mutation access.

## Enforced safeguards

- Room readiness follows `DIRTY -> CLEAN -> INSPECTED -> AVAILABLE`; dedicated
  workflows cannot be bypassed with a manual status request.
- Only the assigned employee can start or complete a cleaning task.
- Passing an inspection requires every checklist item and a different inspector.
- Only supervisors may take rooms out of service, release repairs, receive or
  adjust stock, release lost items, or dispose of unclaimed items.
- JWTs are revalidated against active account, role, password state and required
  password replacement. Login attempts are throttled.
- SQL is parameterized and request IDs, enums, dates, quantities and text lengths
  are validated server-side.
- Uploaded image signatures must match JPEG/PNG/WebP declarations; record status,
  ownership, count and size limits also apply.
- Public QR records exclude claimant, guest, staff and internal-storage details.
- Spreadsheet exports neutralize formula-like user content.
- Responses disable framing and MIME sniffing and avoid exposing server stacks.

Do not expose the development server with demo passwords or real hotel data.
Use HTTPS, strong rotated credentials and synthetic data for public demos.
