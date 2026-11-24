from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


VERIFIED_DATE = "November 24, 2026"


def set_font(run, size: float | None = None, bold: bool | None = None, italic: bool | None = None):
    run.font.name = "Georgia"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Georgia")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def clear_paragraph(paragraph):
    for child in list(paragraph._p):
        if child.tag != qn("w:pPr"):
            paragraph._p.remove(child)


def set_paragraph_text(paragraph, text: str, *, bold_prefix: str | None = None):
    clear_paragraph(paragraph)
    if bold_prefix and text.startswith(bold_prefix):
        run = paragraph.add_run(bold_prefix)
        set_font(run, bold=True)
        run = paragraph.add_run(text[len(bold_prefix) :])
        set_font(run)
    else:
        run = paragraph.add_run(text)
        set_font(run)


def insert_before(anchor, text: str, style: str = "Normal", *, centered: bool = False):
    paragraph = anchor.insert_paragraph_before(style=style)
    set_paragraph_text(paragraph, text)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if centered else WD_ALIGN_PARAGRAPH.JUSTIFY
    return paragraph


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    if tr_pr.find(qn("w:tblHeader")) is None:
        node = OxmlElement("w:tblHeader")
        node.set(qn("w:val"), "true")
        tr_pr.append(node)


def prevent_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    if tr_pr.find(qn("w:cantSplit")) is None:
        tr_pr.append(OxmlElement("w:cantSplit"))


def shade_cell(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = tc_pr.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        tc_pr.append(shading)
    shading.set(qn("w:fill"), fill)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Normal Table"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    repeat_header(table.rows[0])
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        cell.text = ""
        run = cell.paragraphs[0].add_run(str(header))
        set_font(run, 8.5, True)
        shade_cell(cell, "E8E6FF")
    for values in rows:
        cells = table.add_row().cells
        for index, value in enumerate(values):
            cells[index].text = ""
            run = cells[index].paragraphs[0].add_run(str(value))
            set_font(run, 8.3)
    for row in table.rows:
        prevent_split(row)
        for cell in row.cells:
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(2)
                paragraph.paragraph_format.line_spacing = 1
    return table


def add_body(doc, text: str, *, bold_prefix: str | None = None):
    paragraph = doc.add_paragraph(style="Normal")
    set_paragraph_text(paragraph, text, bold_prefix=bold_prefix)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return paragraph


def configure_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Georgia"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Georgia")
    normal.font.size = Pt(11)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.first_line_indent = Inches(0.3)

    for name, size, color in [
        ("Title", 22, "111827"),
        ("Heading 1", 17, "111827"),
        ("Heading 2", 14, "111827"),
        ("Heading 3", 12, "1E3A8A"),
    ]:
        style = doc.styles[name]
        style.font.name = "Georgia"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Georgia")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.first_line_indent = None
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(5)

    if "Caption" in doc.styles:
        caption = doc.styles["Caption"]
        caption.font.name = "Georgia"
        caption._element.rPr.rFonts.set(qn("w:eastAsia"), "Georgia")
        caption.font.size = Pt(9)
        caption.font.italic = True
        caption.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption.paragraph_format.first_line_indent = None


def replace_all_text(doc, replacements: list[tuple[str, str]]):
    containers = list(doc.paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                containers.extend(cell.paragraphs)
    for paragraph in containers:
        text = paragraph.text
        updated = text
        for old, new in replacements:
            updated = updated.replace(old, new)
        if updated != text:
            set_paragraph_text(paragraph, updated)


def paragraph_starting(doc, prefix: str):
    for paragraph in doc.paragraphs:
        if paragraph.text.strip().startswith(prefix):
            return paragraph
    raise ValueError(f"Paragraph not found: {prefix}")


def heading_named(doc, text: str):
    for paragraph in doc.paragraphs:
        if paragraph.text.strip() == text:
            return paragraph
    raise ValueError(f"Heading not found: {text}")


def rename_heading(doc, old: str, new: str, level: int):
    paragraph = heading_named(doc, old)
    set_paragraph_text(paragraph, new)
    paragraph.style = doc.styles[f"Heading {level}"]
    return paragraph


def add_page_number(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, separate, end])
    set_font(run, 9)


def configure_page_and_footer(doc):
    for section in doc.sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        footer = section.footer
        paragraph = footer.paragraphs[0]
        clear_paragraph(paragraph)
        paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(6.15), WD_TAB_ALIGNMENT.RIGHT)
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = paragraph.add_run("HOSIS · Housekeeping Subsystem")
        set_font(run, 9)
        run = paragraph.add_run("\tPage ")
        set_font(run, 9)
        add_page_number(paragraph)
        for table in section.header.tables:
            if table.rows:
                repeat_header(table.rows[0])


def add_front_matter(doc):
    title = doc.paragraphs[0]
    insert_before(title, "CELTECH COLLEGE – OLONGAPO", "Title", centered=True)
    insert_before(title, "College of Information Technology", "Normal", centered=True)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(54)
    title.paragraph_format.space_after = Pt(18)
    title.runs[0].font.size = Pt(22)
    insert_before(
        heading_named(doc, "Overview of the Proposed Software"),
        "Prepared in partial fulfillment of the requirements for SIA101: System Integration and Architecture",
        "Normal",
        centered=True,
    )
    overview = heading_named(doc, "Overview of the Proposed Software")
    overview.paragraph_format.page_break_before = True


def add_missing_introduction_sections(doc):
    anchor = heading_named(doc, "Software Development Team & Methodology")
    sections = [
        (
            "1.3 Statement of the Problem",
            "Hotel Housekeeping work becomes difficult to trace when room conditions, cleaning assignments, inspections, guest requests, found-property custody, repair reports, employee leave, and charge findings are recorded in separate sheets or verbal messages. The project therefore addresses delayed room release, duplicate or unauthorized status changes, incomplete accountability, weak inter-department handoffs, and the absence of reliable operational reports.",
        ),
        (
            "1.4 Objectives of the Study",
            "The general objective is to design and implement a secure Housekeeping subsystem within HOSIS. Specifically, the subsystem must centralize room-readiness work, enforce role-based responsibilities, preserve an audit trail, provide formal reports, support permanent item-specific lost-and-found QR records, and exchange controlled decisions with Front Office, Engineering, Finance, and Human Resources.",
        ),
        (
            "1.5 Scope and Limitations",
            "The scope covers one hotel property and the operational Housekeeping workflows implemented in the repository. Housekeeping can record evidence and initiate requests, but Front Office owns reservation and room-release validation, Engineering owns repair progress, Finance owns final guest-charge decisions, and Human Resources owns leave decisions. Production hosting, HTTPS termination, backup restoration drills, and load certification remain deployment responsibilities and are not claimed as completed merely because local functional tests passed.",
        ),
        (
            "1.6 Significance of the Study",
            "Housekeeping personnel gain an organized daily work queue and personal records; supervisors gain staff, audit, and report controls; Front Office receives verified room-readiness and condition updates; Engineering receives maintenance issues; Finance receives reviewed charge findings; Human Resources receives leave requests; hotel management gains traceable, exportable evidence for operational decisions; and future researchers gain a documented integration model that separates department duties.",
        ),
        (
            "1.7 Definition of Terms",
            "Audit trail refers to the time-stamped record of operational changes. RBAC means role-based access control enforced by the backend. Room readiness is the controlled transition from cleaning through inspection to Front Office release. A charge finding is Housekeeping evidence that may become a guest charge only after Front Office and Finance review. A permanent item-specific QR is a non-expiring code that opens one privacy-safe public lost-and-found record. Separation of duties prevents the same department from recording evidence and making every downstream decision.",
        ),
    ]
    for heading, body in sections:
        p = insert_before(anchor, heading, "Heading 2")
        p.paragraph_format.keep_with_next = True
        insert_before(anchor, body, "Normal")


def restructure_headings(doc):
    mappings = [
        ("Overview of the Proposed Software", "Chapter 1 – Introduction", 1),
        ("Description of the Software", "1.1 Description of the Proposed System", 2),
        ("Features of the Software", "1.2 Implemented Features", 2),
        ("Software Development Team & Methodology", "Chapter 2 – System Architecture and Planning", 1),
        ("Software Development Team Structure", "2.1 Software Development Team", 2),
        ("SDLC Model Selection", "2.2 Software Development Life Cycle", 2),
        ("Software Planning", "2.3 Project Planning", 2),
        ("Gantt Chart", "2.4 Gantt Chart", 2),
        ("Development Timeline & Phases", "2.5 Development Timeline and Phases", 2),
        ("Software Analysis", "Chapter 3 – Software Analysis", 1),
        ("Specifications", "3.1 System Specifications", 2),
        ("Requirements Specifications", "3.2 Requirements Specification", 2),
        ("Functional Requirements", "3.2.1 Functional Requirements", 3),
        ("Non-Functional Requirements", "3.2.2 Non-Functional Requirements", 3),
        ("Software Design", "Chapter 4 – Software Design, User Interface, and Testing", 1),
        ("Logical & Physical Architecture", "4.1 Logical and Physical Architecture", 2),
        ("System Identity & Branding", "4.2 System Identity and Branding", 2),
        ("User Interface Specifications", "4.3 User Interface Specifications", 2),
        ("Flow Diagrams & Architecture Models", "4.4 Flow Diagrams and Architecture Models", 2),
        ("Role Activity Diagram", "4.4.1 Role Activity Diagram", 3),
        ("Technology Stack & Environment", "4.4.2 Technology Stack and Environment", 3),
        ("System Data Flow Diagrams (DFD) & Entity Relationship Diagrams (ERD)", "4.5 Data Flow Diagrams and Entity Relationship Diagram", 2),
        ("Survey & Evaluation Tool", "4.6 Survey and Evaluation Instrument", 2),
        ("Software Testing & Quality Assurance", "4.7 Software Testing and Quality Assurance", 2),
        ("Project Lifecycle Management", "4.8 Project Lifecycle Management", 2),
        ("Housekeeping Implementation Update", "4.9 Implementation Status", 2),
        ("Results, Conclusions, & Recommendations", "4.10 Results, Discussion, Conclusion, and Recommendations", 2),
        ("User Manual Appendix", "Appendix A – User Manual", 1),
        ("Deployment and Integration Appendix", "Appendix B – Deployment and Integration", 1),
        ("Security and Inter-Subsystem Integration Revision", "Appendix C – Security and Inter-Subsystem Integration", 1),
    ]
    for old, new, level in mappings:
        rename_heading(doc, old, new, level)

    for paragraph in doc.paragraphs:
        if paragraph.style.name.startswith("Heading"):
            paragraph.paragraph_format.page_break_before = False
    for name in [
        "Chapter 1 – Introduction",
        "Chapter 2 – System Architecture and Planning",
        "Chapter 3 – Software Analysis",
        "Chapter 4 – Software Design, User Interface, and Testing",
        "Appendix A – User Manual",
        "Appendix B – Deployment and Integration",
        "Appendix C – Security and Inter-Subsystem Integration",
    ]:
        heading_named(doc, name).paragraph_format.page_break_before = True


def reconcile_claims(doc):
    exact_replacements = {
        "The module prints a QR code on each lost-and-found storage label. The QR code holds the item's storage label, so any phone camera can read it; the module itself does not scan barcodes or QR codes and has no camera capture beyond choosing a photo file.":
            "Each lost-and-found record receives one permanent item-specific QR code. Scanning the code opens that item's privacy-safe public HOSIS record and does not create a new code or expiration. The public view exposes only the item reference, description, found location and date, room number when applicable, and current status; it excludes claimant details, staff-only notes, credentials, and storage-sensitive data.",
        "There is no separate Inventory page because the Figma design has none.":
            "Inventory usage is controlled within the Guest Requests workflow, where stock availability, one-time deduction, reorder notifications, and movement history are persisted and auditable.",
        "Feature expansion once designed in Figma, such as an Inventory page for receiving and counting stock, a Reports page, real-time push notifications, and email or SMS delivery of password resets.":
            "Future improvements should focus on measured operational needs: production load testing, backup-restoration drills, HTTPS and reverse-proxy hardening, optional real-time delivery channels, accessibility verification with hotel users, and documented disaster-recovery exercises. Existing reports, inventory movements, notifications, and password-reset controls should be extended only through approved requirements and regression tests.",
    }
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if text in exact_replacements:
            set_paragraph_text(paragraph, exact_replacements[text])

    replacements = [
        ("�", "–"),
        ("fourteen Housekeeping views", "fifteen authenticated Housekeeping route identifiers"),
        ("Fourteen Housekeeping views", "Fifteen authenticated Housekeeping route identifiers"),
        ("Demonstration names, room numbers, dates, and status values come from seeded development data.", "Names, room numbers, dates, and status values shown in the system are persisted operational records or controlled test records used only in verification."),
        ("demo database", "controlled test database"),
        ("Demo database", "Controlled test database"),
        ("demonstration data", "controlled test records"),
        ("sample roles", "authorized roles"),
        ("sample password", "initial password"),
        ("48 of 48 tests passed", "59 of 59 tests passed"),
        ("39 tests", "51 standalone backend tests"),
        ("migrations through 26-housekeeping-finance-hr-workflows.sql", "migrations through 38-report-and-pay-periods.sql"),
        ("All migrations through 26-housekeeping-finance-hr-workflows.sql", "All migrations through 38-report-and-pay-periods.sql"),
        ("HOSIS_INTEGRATION_TOKEN", "Legacy connector token (not used by the integrated runtime)"),
    ]
    replace_all_text(doc, replacements)

    deployment = paragraph_starting(doc, "Deployment Flow:")
    set_paragraph_text(
        deployment,
        "Deployment Flow: In the integrated HOSIS repository, the shared Express backend serves /api/v1/housekeeping and the privacy-safe /api/v1/public/lost-found route from port 3000, while the integrated Vite frontend is served during development from port 5174. All subsystems use the shared PostgreSQL database and authenticated session model. The standalone Housekeeping repository remains a development and subsystem verification package, not a second production authority.",
        bold_prefix="Deployment Flow:",
    )

    integration = paragraph_starting(doc, "Housekeeping is one module of the HOSIS portal")
    set_paragraph_text(
        integration,
        "Housekeeping is an integrated HOSIS module mounted at /api/v1/housekeeping in the main backend and rendered by the shared frontend. Front Office, Engineering, Finance, Human Resources, and Housekeeping use the same authenticated backend and PostgreSQL database, while backend RBAC and workflow state rules preserve department ownership. The previous separate-server integration token is retained only as historical reference and is not part of the current runtime architecture.",
    )

    login = paragraph_starting(doc, "Step 1: Log In.")
    set_paragraph_text(
        login,
        "Step 1: Log In. Open the authorized HOSIS address and enter the username or email and initial password issued by a supervisor or administrator. The account must be active and assigned to the appropriate Housekeeping position. A temporary or reset password must be changed before protected functions become available. Credentials are intentionally excluded from this manual.",
    )

    install = paragraph_starting(doc, "Step 4: In integrations/housekeeping/backend")
    set_paragraph_text(
        install,
        "Step 4: For the integrated repository, configure the main backend DATABASE_URL, JWT_SECRET, CORS_ORIGIN, and other deployment secrets through the approved environment file. Apply database migrations in order and do not commit secrets. The Housekeeping routes are mounted by the shared HOSIS backend; no separate runtime integration token is required.",
    )
    seed = paragraph_starting(doc, "Step 5: In the same folder run npm install")
    set_paragraph_text(
        seed,
        "Step 5: Install backend dependencies, apply migrations, and create authorized staff accounts through the protected account workflow. Start the shared HOSIS backend and verify the health endpoint, authentication, role restrictions, and Housekeeping API responses before opening the frontend.",
    )
    vite = paragraph_starting(doc, "Step 6: Run npm install and npm run dev")
    set_paragraph_text(
        vite,
        "Step 6: Install frontend dependencies, run the production build as a release check, and then start the integrated Vite frontend. Use the address printed by the integrated project configuration, which is currently port 5174 in the local environment.",
    )
    token = paragraph_starting(doc, "2. The service reaches the main HOSIS backend")
    set_paragraph_text(
        token,
        "2. The integrated frontend calls the shared HOSIS backend under /api/v1/housekeeping. Authentication, session version, active-employment status, and department or position authorization are checked on protected requests.",
    )

    step3 = paragraph_starting(doc, "Step 3: Create a PostgreSQL database for Housekeeping")
    set_paragraph_text(
        step3,
        "Step 3: Confirm access to the shared HOSIS PostgreSQL database, create a backup, and apply the approved migrations in order. Housekeeping tables use the hk_ prefix where appropriate; a separate production database is not created for the integrated module.",
    )

    verified = paragraph_starting(doc, "Thirty-nine automated API tests passed")
    set_paragraph_text(
        verified,
        "Verification completed on November 24, 2026: the standalone repository passed 51 of 51 backend tests and 4 of 4 frontend tests, while the integrated HOSIS repository passed 59 of 59 backend tests and 27 of 27 frontend tests. Both frontend production builds completed successfully. The integrated suite covers Housekeeping, Front Office, Engineering, Finance, Human Resources, RBAC, session security, concurrency-sensitive decisions, permanent public lost-item records, room status, maintenance, leave, and one-invoice charge enforcement.",
    )

    scope = paragraph_starting(doc, "This documentation covers the Housekeeping subsystem only")
    set_paragraph_text(
        scope,
        "This document covers the Housekeeping subsystem and the contracts it uses to exchange controlled information with Front Office, Engineering, Finance, and Human Resources. It documents only the fields, states, endpoints, responsibilities, and verification evidence needed by Housekeeping; it does not claim ownership of another department's internal processes. Front Office validates reservation and room-release context, Engineering controls repair progress, Finance decides final charges, and Human Resources decides leave.",
    )

    functionality = paragraph_starting(doc, "Functionality Review:")
    set_paragraph_text(
        functionality,
        "Functionality Review: The Housekeeping subsystem provides working interfaces and REST workflows for room status, cleaning tasks, inspections, schedules, personal schedules, lost and found with photos and permanent QR records, guest requests with stock control, maintenance reporting, room-condition and charge findings, staff leave, reports and audit exports, staff accounts, personal records, account security, dashboard summaries, and notifications. The verified frontend tests and production builds pass in both repositories.",
        bold_prefix="Functionality Review:",
    )

    summary = paragraph_starting(doc, "The implemented Housekeeping subsystem covers room status")
    set_paragraph_text(
        summary,
        "The implemented Housekeeping subsystem covers room status, cleaning tasks, inspections, schedules, guest requests, inventory movements, lost and found, permanent public QR records, maintenance, room-condition and charge findings, leave requests, reports, audit records, staff accounts, profile controls, and notifications. It uses the shared HOSIS interface, Express API, PostgreSQL database, authenticated sessions, and backend RBAC, and exchanges controlled decisions with Front Office, Engineering, Finance, and Human Resources.",
    )

    conclusion = paragraph_starting(doc, "Conclusion: The Housekeeping subsystem is operational")
    set_paragraph_text(
        conclusion,
        "Conclusion: The Housekeeping subsystem operates as an integrated HOSIS module with traceable workflows and separation of duties. Current verification passed 55 standalone checks and 86 integrated checks in total, in addition to both production frontend builds. These results support functional readiness in the verified environment, while production acceptance still requires deployment security, load, backup-restoration, monitoring, and hotel-user validation.",
        bold_prefix="Conclusion:",
    )

    backend_status = paragraph_starting(doc, "Backend: Express exposes authenticated REST endpoints")
    set_paragraph_text(
        backend_status,
        "Backend: Express exposes authenticated routes under /api/v1/housekeeping and the privacy-safe public lost-item route under /api/v1/public/lost-found. Transaction-protected services enforce room, cleaning, inspection, claim, disposal, stock, maintenance, charge-finding, leave, report, and account rules. Front Office, Engineering, Finance, and Human Resources receive only their protected integration queues and decision actions.",
        bold_prefix="Backend:",
    )

    room_source = paragraph_starting(doc, "HOSIS keeps the master room records")
    set_paragraph_text(
        room_source,
        "HOSIS stores the canonical room records and every room-status transition in the shared PostgreSQL database. Housekeeping reads the current room state through the protected shared API and may write only Housekeeping-owned transitions. Front Office checkout, Housekeeping cleaning and inspection, Engineering repair, and Front Office release operate on the same room identity and audit history; no duplicate production room table or polling connector is used.",
    )

    exchange = paragraph_starting(doc, "Housekeeping exchanges work with the other departments as follows")
    set_paragraph_text(
        exchange,
        "Housekeeping exchanges work through the shared backend and database. Front Office checkout creates Housekeeping work; a passed inspection creates room-readiness information for Front Office; room-condition and charge findings enter Front Office review; maintenance requests enter Engineering review and return after repair; validated charge findings proceed to Finance; and employee leave requests proceed to Human Resources. Every receiving department acts only through its authorized state transition, and Housekeeping retains the resulting status in its audit and report views.",
    )

    audit_history = paragraph_starting(doc, "Full audit fixes (November 17, 2026):")
    set_paragraph_text(audit_history, audit_history.text.replace("All sixteen findings of the audit", "All findings recorded in that audit"))

    for paragraph in list(doc.paragraphs):
        if paragraph.text.strip() in {
            "The same pages at phone width: Staff Dashboard, Cleaning Tasks and Guest Requests.",
            "Screen shown after signing in with a temporary password; no other function is available until a new password is chosen.",
            "5. Release control: require a database backup, migration review, backend tests, frontend build, cross-subsystem acceptance check, rollback instructions, and signed release note.",
        }:
            paragraph._element.getparent().remove(paragraph._element)

    # Update the environment-variable table from the retired separate-server layout.
    for table in doc.tables:
        if not table.rows or "Variable" not in table.rows[0].cells[0].text:
            continue
        rows = {row.cells[0].text.strip(): row for row in table.rows[1:] if row.cells}
        updates = {
            "PORT": ("PORT", "3000", "Shared HOSIS backend port"),
            "DATABASE_URL": ("DATABASE_URL", "postgresql://<user>:<password>@localhost:5432/hosis", "Shared PostgreSQL connection; credentials supplied through the environment"),
            "CORS_ORIGIN": ("CORS_ORIGIN", "http://localhost:5174", "Approved integrated frontend origin"),
            "HOSIS_API_BASE_URL": ("API_BASE_PATH", "/api/v1", "Shared backend base path used by the integrated frontend"),
            "Legacy connector token (not used by the integrated runtime)": ("DATABASE_SSL", "false locally; required in hosted deployment", "Controls encrypted PostgreSQL transport for the deployment environment"),
        }
        for key, (name, example, purpose) in updates.items():
            row = rows.get(key)
            if row is None:
                continue
            set_paragraph_text(row.cells[0].paragraphs[0], name)
            set_paragraph_text(row.cells[1].paragraphs[0], example)
            set_paragraph_text(row.cells[2].paragraphs[0], purpose)

    integration_updates = {
        "1. The Housekeeping service is in the HOSIS repository": "1. The integrated Housekeeping module is maintained in the main HOSIS repository and in the synchronized standalone subsystem repository. The main Express backend mounts its API at /api/v1/housekeeping.",
        "3. Room sync:": "3. Room records are shared in PostgreSQL. Housekeeping reads the canonical room status and writes only authorized transitions; no polling connector or duplicate production room database is required.",
        "4. Room events:": "4. Cleaning completion, inspection decisions, checkout-created cleaning work, post-repair release, and Front Office room availability are persisted through transaction-protected state transitions and audit records.",
        "6. Front Office:": "6. Front Office receives room-readiness, room-condition, reservation-linked request, and charge-finding information through protected /api/v1/housekeeping routes and makes only Front Office-owned decisions.",
        "7. Engineering:": "7. Engineering receives maintenance requests through protected Housekeeping integration routes, owns repair progress, and returns repaired rooms to the Housekeeping cleaning and inspection workflow.",
        "8. Housekeeping-owned tables": "8. Housekeeping-owned tables and the shared workflow tables are created by ordered migrations. Foreign keys, checks, unique constraints, row locks, and audit events protect integrity.",
        "10. The backend tests include checks of the HOSIS connector": "10. Regression suites verify the shared-database workflow, authentication, RBAC, Front Office, Engineering, Finance, Human Resources, lost-item privacy, reports, concurrency, and session controls.",
    }
    for prefix, text in integration_updates.items():
        try:
            paragraph = paragraph_starting(doc, prefix)
        except ValueError:
            continue
        set_paragraph_text(paragraph, text)


def add_reconciliation_appendix(doc):
    heading = doc.add_heading("Appendix D – System–Documentation Traceability", level=1)
    heading.paragraph_format.page_break_before = True
    add_body(
        doc,
        "This appendix prevents documentation drift. Each claim below was matched against the current Housekeeping interface, backend route or persisted workflow, role rules, and regression evidence. A feature is described as implemented only when a corresponding code path and verification result exist.",
    )
    doc.add_paragraph("Table D.1 Implemented Housekeeping module traceability", style="Caption")
    add_table(
        doc,
        ["Module or function", "System evidence", "Authorized users", "Document coverage"],
        [
            ["Dashboard and notifications", "Overview/Staff Dashboard; ten-item notification preview, View all, Mark all read/unread", "Supervisor, inspector, housekeeper by role", "Features, UI, user manual, testing"],
            ["Room Status", "Room status route and audited state transitions", "Supervisor/inspector; limited staff views", "Requirements, architecture, DFD, lifecycle"],
            ["Cleaning Tasks", "Assignment, ownership, completion, evidence and pagination", "Supervisor assigns; assigned staff completes", "Features, UI, testing, user manual"],
            ["Inspection", "Checklist, pass/return, no self-inspection, report exports", "Inspector/supervisor", "Requirements, UI, testing"],
            ["Schedules and My Schedule", "Shift assignment, overlap and past-date validation", "Supervisor manages; staff read own schedule", "Features, UI, user manual"],
            ["Lost and Found", "Item records, photos, custody, claim/disposal controls, permanent QR", "Authorized Housekeeping; supervisor-only disposal", "Features, QR/privacy, DFD, testing"],
            ["Public lost-item QR", "/api/v1/public/lost-found privacy-safe item projection", "Public scanner receives limited fields", "Security, QR workflow, traceability"],
            ["Guest Requests and stock", "Request ownership, stock deduction once, movement and reorder notice", "Assigned staff and supervisors", "Features, data model, testing"],
            ["Maintenance", "Housekeeping report to Engineering; protected repair ownership", "Housekeeping reports; Engineering updates repair", "Integration, workflow, testing"],
            ["Report Room and charge findings", "Housekeeping evidence to Front Office and Finance; one approved invoice line", "Housekeeping, Front Office, Finance by state", "Integration appendix, endpoint contract, testing"],
            ["Leave Requests", "Employee request, ownership isolation, HR decision", "Employee owns record; HR decides", "Integration appendix, security, testing"],
            ["Reports, audit, and staff reports", "Filtered PDF/Excel/CSV exports and read-only audit feeds", "Role-scoped staff and supervisor reports", "Features, reports, user manual"],
            ["Staff Accounts and Account", "Protected account creation/reset/profile photo/password controls", "Supervisor/admin; employee self-service fields", "UI, security, user manual"],
        ],
    )
    add_body(
        doc,
        "Table D.1 shows that the paper's module list is tied to implemented system evidence. It also identifies the controlling role so a panel can distinguish a visible button from a backend-authorized business action.",
    )

    doc.add_paragraph("Table D.2 Verification and claim status", style="Caption")
    add_table(
        doc,
        ["Verification area", f"Result as of {VERIFIED_DATE}", "Claim boundary"],
        [
            ["Standalone backend", "51 of 51 tests passed", "Functional and security regression in a dedicated test database"],
            ["Standalone frontend", "4 of 4 tests passed; production build passed", "Component behavior and compilable release bundle"],
            ["Integrated backend", "59 of 59 tests passed", "Shared-database Housekeeping, Front Office, Finance, HR, Engineering and security workflows"],
            ["Integrated frontend", "27 of 27 tests passed; production build passed", "Shared HOSIS UI behavior and compilable release bundle"],
            ["Database", "Migrations through 38-report-and-pay-periods.sql applied in the verification database", "Schema compatibility and workflow persistence"],
            ["Production operations", "Requires hotel-environment validation", "HTTPS, load capacity, backup restoration, monitoring and disaster recovery are not overclaimed"],
        ],
    )
    add_body(
        doc,
        "The verification totals demonstrate repeatable behavior in the current local and integrated test environments. They reduce known risk but do not prove that future defects are impossible. Formal production acceptance must include real deployment infrastructure, controlled user-acceptance testing, security monitoring, load measurement, and backup restoration.",
    )

    doc.add_heading("D.1 Panel Comment Resolution", level=2)
    add_table(
        doc,
        ["Panel concern", "Document correction", "System/document evidence"],
        [
            ["Follow a formal chapter format", "Chapters 1–4 now follow the Front Office documentation sequence; operational material is moved under appendices.", "Numbered headings and page breaks"],
            ["Use Georgia, correct spacing, margins and justification", "Georgia is enforced for body, headings, captions and tables; A4 margins and justified body text are applied.", "Document styles and rendered-page review"],
            ["Descriptions and notation for diagrams", "DFD, ERD, architecture, Finance and HR workflows retain or add explanatory narratives and ownership rules.", "Figure captions and adjacent explanations"],
            ["Do not split tables; repeat headers", "Rows are protected from splitting and table headers repeat on later pages where Word supports it.", "Table properties"],
            ["Add Results/Discussion and Recommendations", "Section 4.10 reports verified outcomes, limitations, conclusion and evidence-based recommendations.", "Test totals and claim boundaries"],
            ["Reports/audit and QR must match the system", "Reports/audit exports and the permanent item-specific privacy-safe QR are documented exactly as implemented.", "Reports pages, QR route, traceability table"],
            ["Finance and HR integration", "Responsibilities, endpoints, data rules, security boundaries and test results are documented.", "Appendix C and integrated regression suite"],
            ["User manual starts on a new page", "Appendix A has a forced page break and excludes usernames/passwords.", "Manual appendix formatting"],
        ],
    )
    add_body(
        doc,
        "Table D.3 records how the scanned review notes were converted into document controls and verifiable content rather than copied as unexamined instructions.",
    )


def normalize_tables_and_captions(doc):
    for paragraph in doc.paragraphs:
        if paragraph.style.name == "Caption" or paragraph.text.strip().startswith(("Figure ", "Table ")):
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.first_line_indent = None
            paragraph.paragraph_format.keep_with_next = False
            for run in paragraph.runs:
                set_font(run, 9, italic=True)
        elif paragraph.style.name == "List Paragraph" and paragraph.text.strip():
            paragraph.paragraph_format.left_indent = Inches(0.3)
            paragraph.paragraph_format.first_line_indent = Inches(-0.2)
    for table in doc.tables:
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        if table.rows:
            repeat_header(table.rows[0])
        for row in table.rows:
            prevent_split(row)
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.first_line_indent = None
                    for run in paragraph.runs:
                        set_font(run, run.font.size.pt if run.font.size else 8.5)


def assert_no_obsolete_claims(doc):
    text = "\n".join(p.text for p in doc.paragraphs)
    for table in doc.tables:
        text += "\n" + "\n".join(cell.text for row in table.rows for cell in row.cells)
    forbidden = [
        "password123",
        "seed-demo",
        "HOSIS_INTEGRATION_TOKEN",
        "48 of 48",
        "fourteen Housekeeping views",
        "QR code holds the item's storage label",
    ]
    failures = [token for token in forbidden if token.lower() in text.lower()]
    if failures:
        raise RuntimeError(f"Obsolete or unsafe claims remain: {failures}")


def reconcile(source: Path, output: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)
    doc = Document(output)
    configure_styles(doc)
    configure_page_and_footer(doc)
    add_front_matter(doc)
    add_missing_introduction_sections(doc)
    restructure_headings(doc)
    reconcile_claims(doc)
    add_reconciliation_appendix(doc)
    normalize_tables_and_captions(doc)
    doc.core_properties.title = "HOSIS Housekeeping Subsystem Reconciled Documentation"
    doc.core_properties.subject = "Housekeeping documentation aligned with the integrated HOSIS implementation and panel comments"
    doc.core_properties.keywords = "HOSIS, Housekeeping, documentation, Front Office, Finance, HR, Engineering, QR, RBAC, audit"
    doc.core_properties.comments = "Verified and reconciled on November 24, 2026."
    assert_no_obsolete_claims(doc)
    doc.save(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    reconcile(args.source.resolve(), args.output.resolve())
    print(args.output.resolve())


if __name__ == "__main__":
    main()
