# HOSIS Housekeeping Subsystem: documentation folder

This folder holds the Housekeeping group's documents. How to run the app, the
sample accounts, the feature map, the API, and the business rules are in the
repository's main [README](../../README.md).

| File | What it is |
| ---- | ---------- |
| [`documentation/HOSIS_Housekeeping_Subsystem_Complete_Documentation_2026_corrected.docx`](documentation/HOSIS_Housekeeping_Subsystem_Complete_Documentation_2026_corrected.docx) | Current project document (updated November 12, 2026). It keeps the professor's required format and covers the implemented ERD, DFD, flowchart, UI screens, data dictionary, tests and user manual. Older versions stay in the same folder for reference. |
| [`INTEGRATION.md`](INTEGRATION.md) | How to merge Housekeeping into the class HOSIS repository, endpoints for Front Office and Engineering, and decisions to confirm with the project manager |
| [`REQUIREMENTS-MAPPING.md`](REQUIREMENTS-MAPPING.md) | How the class HK-001 to HK-011 requirements map to our flowchart codes HK-001 to HK-015 and to the code |
| [`screenshots/`](screenshots/) | Screens taken from the running app with the sample data |

## UI revision (10/28/2026)

Changes asked for by the professor:

* Sidebar has a minimize button; collapsed, only the icons remain.
* Login asks for the staff email (e.g. `maria.santos@grandhorizon.ph`) and shows a red
  warning under an empty field.
* Every page shows its name as the title in the top bar, plus a notification
  bell. The top search bar is gone; lists keep their own search box.
* Dashboard: icons on the Occupied / Dirty / Clean / Inspected / Out of order
  boxes, bar chart on the left, donut on the right, no "Select function".
* Room Status: status filter chips instead of the status boxes.
* Room Inspection: Progress filter, Priority column, small progress badges,
  Recent activity, and an Export (PDF / Excel) report under the list.
* Schedules: calendar picker; housekeepers get a "My schedule" panel.
* Lost & Found and Guest Request: "Status" filter, Export dropdown at the top,
  rows darken on hover and open in a pop-up.
* Maintenance: Status filter, button renamed to "Submit & Notify".

The layout follows the Figma screens (HOSIS-UI-HOUSEKEEPING-UI): a sidebar
with the Housekeeping functions, the hotel photo and logo on the login page,
an Access Denied pop-up for unauthorized accounts, and an End session button
with a confirmation pop-up. The logo and photo in
`frontend/src/modules/housekeeping/assets/` were taken from the Figma design.

## Later additions

* November 3-4, 2026: staff dashboard for housekeepers, Account, Personal
  Record, Report Room, and phone layouts.
* November 12, 2026: the Figma's Inventory stock card on Guest Requests;
  Staff Accounts page; lost and found photos, QR labels, claim ID details and
  supervisor disposal; forgot password; stricter room, inspection, guest
  request and schedule rules. See "Added after the November 12, 2026 audit"
  in the main README.

Checked against the Figma file on November 12, 2026: it has no Inventory,
Reports or Staff Accounts screen, so the app has no Inventory or Reports
page (reports are the Generate Report boxes on Maintenance and Inspection).
Staff Accounts is kept, in the Figma style, because the Figma login's
"Forgot password?" link needs a place where a supervisor handles the request.
