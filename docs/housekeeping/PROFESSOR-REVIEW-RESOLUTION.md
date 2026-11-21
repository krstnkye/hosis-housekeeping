# First Defense Review Resolution

This register treats the annotations in `sir james .pdf`, `sir roy.pdf`, and `sir roy (2).pdf` as reviewer evidence. It records how each concern was resolved in the Housekeeping documentation or implemented system.

| Source | Professor concern | Resolution |
|---|---|---|
| Sir James, pp. 1-2 | Add reports/audit trails and QR support; correct font, bullets, spacing, margins, and captions. | Added a supervisor-only **Reports & Audit Trail** page with filters and PDF/Excel export. Existing lost-and-found storage labels retain QR codes. The paper now uses Georgia, consistent margins, paragraph spacing, and caption formatting. |
| Sir James, p. 3 | Clarify features and avoid claiming an in-app QR scanner. | The scope now states that the system prints QR storage labels readable by a phone camera; it does not claim a built-in camera scanner. |
| Sir James, pp. 4-5 | Start Functional and Non-Functional Requirements cleanly; correct the architecture. | Both sections begin on new pages. All separate-port/separate-database descriptions were replaced with the implemented single Express API and centralized PostgreSQL HOSIS database. |
| Sir James, p. 6 | Use actual software-design diagrams. | The paper retains the implemented workflow and physical-architecture figures and adds a narrative immediately after each diagram. |
| Sir James, pp. 8-10 | Make Implementation Coverage prominent and standardize entity/table captions. | Heading hierarchy and caption alignment were standardized; table rows are prevented from splitting across pages. |
| Sir James, pp. 11-13 | Correct bullets and begin Software Testing & QA on a new page. | Ordered material is presented as numbered text, captions are not list items, body paragraphs are justified, and Testing & QA starts on a new page. |
| Sir James, pp. 14-15 | Start Project Lifecycle Management and User Manual Appendix on new pages. | Both headings now force a page break. |
| Sir Roy, pp. 1-8 | Fix spacing, margins, Georgia 12, indentation, missing/poorly placed figures, captions, and large blank areas. | Applied Georgia 12 to body text, one-inch margins, justified body paragraphs, consistent first-line indentation, centered figure captions below images, and controlled page breaks. |
| Sir Roy, pp. 9-13 | Add descriptions for role activity, DFDs, and other diagrams; correct caption/list formatting. | Diagram narratives are retained directly after the corresponding figures; captions are centered and removed from bullet numbering. |
| Sir Roy, pp. 14-18 | Tables must not be cut; describe every table/figure. | Table rows use `cantSplit`, first rows repeat as headers, captions remain with their tables, and explanatory paragraphs remain with the related section. |
| Sir Roy, pp. 19-22 | Use numbers for ordered items and improve testing/lifecycle pagination. | Ordered workflow and installation material uses explicit numbered steps; major QA/lifecycle headings start on new pages. |
| Sir Roy, pp. 23-24 | Remove unwanted blank pages and bullets under Current Implementation Status. | Redundant manual breaks and list numbering were removed; Frontend, Backend, Database, and Security are plain labeled paragraphs. |
| System review | Paper described Housekeeping as a separate service with its own database, connector, and room synchronization. | Rewritten to match the repository: `/api/housekeeping` is mounted in the main backend on its configured port, `hk_` tables coexist in the shared database, and Front Office/Engineering call protected routes in the same application. |
| System review | No dedicated audit-trail screen despite the defense comment. | Added `GET /api/housekeeping/audit`, a supervisor-only Reports & Audit page, export controls, and an authorization test. |

## Verification status

- Frontend production build: passed on November 21, 2026.
- Frontend ESLint: passed on November 21, 2026.
- Backend JavaScript syntax check: passed on November 21, 2026.
- Backend integration suite: 47 cases cover the principal workflows, reporting periods, staff-report access, and cross-subsystem access controls.
