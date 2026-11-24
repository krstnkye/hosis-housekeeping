from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


GROUP_MEMBERS = [
    "Danan, Kristine Kaye S.",
    "Tabuldo, Kurt Lestat M.",
    "Birtodan, Hamza",
    "Mejia, Justyn",
    "Salazar, Nicholas",
]


def set_cell_text(cell, text: str, *, bold: bool = False) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(str(text))
    run.bold = bold
    run.font.name = "Georgia"
    run.font.size = Pt(9)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def prevent_row_split(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Normal Table"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:color"), "B8C2D6")
        borders.append(element)
    tbl_pr.append(borders)
    set_repeat_table_header(table.rows[0])
    for idx, header in enumerate(headers):
        set_cell_text(table.rows[0].cells[idx], header, bold=True)
    for values in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(values):
            set_cell_text(cells[idx], value)
    for row in table.rows:
        prevent_row_split(row)
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(2)
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0
    return table


def add_body(doc, text: str, *, bold_prefix: str | None = None):
    paragraph = doc.add_paragraph(style="Normal")
    if bold_prefix and text.startswith(bold_prefix):
        first, rest = text[: len(bold_prefix)], text[len(bold_prefix) :]
        paragraph.add_run(first).bold = True
        paragraph.add_run(rest)
    else:
        paragraph.add_run(text)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return paragraph


def add_caption(doc, text: str):
    if doc.paragraphs and paragraph_has_image(doc.paragraphs[-1]):
        paragraph = doc.paragraphs[-1]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run()
        run.add_break()
        run.add_text(text)
        run.font.name = "Georgia"
        run.font.size = Pt(9)
        run.font.italic = True
        return paragraph
    paragraph = doc.add_paragraph(style="Caption")
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.add_run(text)
    return paragraph


def font(size: int, bold=False):
    candidates = [
        "C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def rounded_box(draw, xy, fill, outline, title, subtitle=None, width=3):
    draw.rounded_rectangle(xy, radius=18, fill=fill, outline=outline, width=width)
    x1, y1, x2, y2 = xy
    center_x = (x1 + x2) // 2
    title_font = font(27, True)
    subtitle_font = font(19)
    title_box = draw.textbbox((0, 0), title, font=title_font)
    draw.text((center_x - (title_box[2] - title_box[0]) / 2, y1 + 24), title, fill="#111827", font=title_font)
    if subtitle:
        lines = subtitle.split("\n")
        for i, line in enumerate(lines):
            box = draw.textbbox((0, 0), line, font=subtitle_font)
            draw.text((center_x - (box[2] - box[0]) / 2, y1 + 68 + i * 27), line, fill="#374151", font=subtitle_font)


def arrow(draw, start, end, label=None):
    draw.line([start, end], fill="#1d4ed8", width=5)
    x2, y2 = end
    x1, y1 = start
    import math

    angle = math.atan2(y2 - y1, x2 - x1)
    length = 18
    for offset in (2.55, -2.55):
        point = (x2 + length * math.cos(angle + offset), y2 + length * math.sin(angle + offset))
        draw.line([end, point], fill="#1d4ed8", width=5)
    if label:
        label_font = font(18, True)
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        box = draw.textbbox((0, 0), label, font=label_font)
        draw.rectangle((mx - (box[2] - box[0]) / 2 - 8, my - 19, mx + (box[2] - box[0]) / 2 + 8, my + 8), fill="white")
        draw.text((mx - (box[2] - box[0]) / 2, my - 17), label, fill="#1e3a8a", font=label_font)


def generate_workflow_diagrams(asset_dir: Path):
    asset_dir.mkdir(parents=True, exist_ok=True)

    finance = Image.new("RGB", (1600, 900), "white")
    d = ImageDraw.Draw(finance)
    d.text((55, 38), "Housekeeping Charge Finding Decision Flow", fill="#111827", font=font(40, True))
    rounded_box(d, (55, 170, 390, 365), "#eef2ff", "#4338ca", "Housekeeping", "Records room damage,\nlinen loss or applicable fee")
    rounded_box(d, (470, 170, 805, 365), "#eff6ff", "#2563eb", "Front Office", "Validates stay/room context\nand forwards or rejects")
    rounded_box(d, (885, 170, 1220, 365), "#ecfdf5", "#059669", "Finance", "Approves or rejects and\nsets the final charge")
    rounded_box(d, (1260, 170, 1545, 365), "#fffbeb", "#d97706", "Invoice", "One approved finding\ncreates one line item")
    arrow(d, (390, 267), (470, 267), "REPORTED")
    arrow(d, (805, 267), (885, 267), "FOR_FINANCE")
    arrow(d, (1220, 267), (1260, 267), "APPROVED")
    rounded_box(d, (470, 520, 805, 710), "#fef2f2", "#dc2626", "Rejected", "Required decision reason;\nvisible in the audit history")
    arrow(d, (637, 365), (637, 520), "FO reject")
    arrow(d, (1052, 365), (805, 615), "Finance reject")
    d.text((55, 805), "Controlled states: REPORTED → FOR_FINANCE → APPROVED or REJECTED. Withdrawals are allowed only before a decision.", fill="#374151", font=font(21))
    finance_path = asset_dir / "finance_charge_workflow.png"
    finance.save(finance_path, quality=95)

    leave = Image.new("RGB", (1600, 820), "white")
    d = ImageDraw.Draw(leave)
    d.text((55, 38), "Housekeeping Leave Request Decision Flow", fill="#111827", font=font(40, True))
    rounded_box(d, (65, 175, 430, 390), "#eef2ff", "#4338ca", "Housekeeping Staff", "Selects leave type and dates,\nthen supplies a reason")
    rounded_box(d, (615, 175, 980, 390), "#eff6ff", "#2563eb", "Human Resources", "Reviews only authorized\nHousekeeping leave requests")
    rounded_box(d, (1165, 90, 1530, 285), "#ecfdf5", "#059669", "Approved", "Decision date, reviewer and\nnotes are recorded")
    rounded_box(d, (1165, 455, 1530, 650), "#fef2f2", "#dc2626", "Rejected", "Reason is recorded and\nreturned to the employee")
    arrow(d, (430, 280), (615, 280), "PENDING")
    arrow(d, (980, 245), (1165, 190), "APPROVE")
    arrow(d, (980, 330), (1165, 545), "REJECT")
    d.text((65, 725), "Privacy control: staff see only their own requests; HR and administrators perform decisions. Overlapping active requests are refused.", fill="#374151", font=font(21))
    leave_path = asset_dir / "hr_leave_workflow.png"
    leave.save(leave_path, quality=95)
    return finance_path, leave_path


def clear_numbering(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    num_pr = p_pr.find(qn("w:numPr"))
    if num_pr is not None:
        p_pr.remove(num_pr)


def paragraph_has_image(paragraph) -> bool:
    return bool(paragraph._p.xpath(".//w:drawing | .//w:pict"))


def normalize_existing_content(doc):
    for paragraph in doc.paragraphs:
        for run in paragraph.runs:
            if "�" in run.text:
                run.text = run.text.replace("�", "–")
            if "demo database" in run.text.lower():
                run.text = run.text.replace("demo database", "non-production database").replace("Demo database", "Non-production database")

    replacements = {
        "Scope and Limitations:": (
            "Scope and Limitations: The implementation covers one hotel property and the Housekeeping workflows for room status, cleaning, inspection, schedules, guest requests, lost and found, maintenance, charge findings, staff leave requests, inventory usage, staff accounts, reports, and audit records. Front Office owns reservation verification, Finance owns final guest-charge decisions, Human Resources owns leave decisions, and Engineering owns repair progress. Housekeeping does not directly post charges, approve leave, alter reservations, or close Engineering work."
        ),
        "Maintenance Reporting –": (
            "Maintenance Reporting – Allows Housekeeping personnel to report defects to Engineering. Rooms that require protection may be placed OUT OF ORDER, while only Engineering can update repair progress. After repair, the room returns to Housekeeping for cleaning and inspection before Front Office can release it."
        ),
        "Report Room, My Record and Account –": (
            "Report Room, Charge Findings, My Record and Account – Lets personnel report room conditions to Front Office, create traceable damage or fee findings for Front Office and Finance review, view operational records, and maintain their own profile and password without changing protected employment fields."
        ),
    }
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        for prefix, replacement in replacements.items():
            if text.startswith(prefix):
                paragraph.text = replacement
                break

    # Correct the professor-identified figure-caption placement throughout the document.
    paragraphs = list(doc.paragraphs)
    for index, paragraph in enumerate(paragraphs):
        text = paragraph.text.strip()
        if not text.startswith("Figure "):
            continue
        clear_numbering(paragraph)
        paragraph.style = doc.styles["Caption"]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        image_paragraph = None
        for candidate in paragraphs[index + 1 : index + 4]:
            if paragraph_has_image(candidate):
                image_paragraph = candidate
                break
            if candidate.text.strip() and not candidate.text.strip().startswith("Narrative"):
                break
        if image_paragraph is not None:
            image_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption_run = image_paragraph.add_run()
            caption_run.add_break()
            caption_run.add_text(text)
            caption_run.font.name = "Georgia"
            caption_run.font.size = Pt(9)
            caption_run.font.italic = True
            paragraph._element.getparent().remove(paragraph._element)

    # The questionnaire is an ordered instrument, not an unstructured bullet list.
    in_questionnaire = False
    questionnaire_number = 0
    for paragraph in doc.paragraphs:
        if paragraph.text.strip() == "Questionnaire Template":
            in_questionnaire = True
            continue
        if in_questionnaire and paragraph.style.name == "Heading 1":
            in_questionnaire = False
        if in_questionnaire and paragraph.text.strip() and paragraph.style.name == "List Paragraph":
            questionnaire_number += 1
            paragraph.text = f"{questionnaire_number}. {paragraph.text.strip()}"
            paragraph.style = doc.styles["Normal"]
            clear_numbering(paragraph)

    # Current implementation status is formal prose; remove visual bullet clutter.
    in_status = False
    for paragraph in doc.paragraphs:
        if paragraph.text.strip() == "Current Implementation Status":
            in_status = True
            continue
        if in_status and paragraph.text.strip() == "Development History":
            in_status = False
        if in_status and paragraph.text.strip():
            clear_numbering(paragraph)
            paragraph.style = doc.styles["Normal"]

    lifecycle_updates = {
        "Problem identification:": "Problem identification: the team documented delays and errors caused by manual room-status tracking, verbal task assignment, disconnected inspection results, paper-based lost-and-found custody, and untraceable cross-department requests. The approved scope, actors, constraints, acceptance criteria, DFDs, ERD, interface hierarchy, and integration responsibilities were reviewed before construction.",
        "Project folder structure": "Construction used separated frontend, backend, database, and documentation layers. Each increment required input validation, authorization, parameterized SQL, an auditable state transition, and a regression test before it was accepted into the Housekeeping branch and then synchronized with the integrated HOSIS repository.",
        "Scope validation and progress tracking": "Monitoring and controlling compare completed behavior with the HK-001 to HK-015 requirement map and the added Finance and Human Resources contracts. Database migrations are additive, schedule and requirement changes are recorded, test failures block release, and shared interfaces are reviewed with the subsystem that owns the receiving decision.",
        "Unit testing, manual end-user test scenarios": "Testing combines unit validation, API workflow regression tests, PostgreSQL integration checks, frontend production builds, permission-negative tests, concurrency/state-transition checks, visual review, and cross-department user-acceptance scenarios. Defects are classified by severity and closed only after a repeatable verification.",
        "Corrective, adaptive, perfective, and preventive maintenance strategies": "Corrective maintenance records and reproduces defects before repair; adaptive maintenance reviews framework, browser, database, and HOSIS contract changes; perfective maintenance prioritizes measured hotel-user needs; preventive maintenance covers dependency updates, secret rotation, audit review, least-privilege grants, backup restoration, migration rollback, and scheduled cross-subsystem acceptance checks.",
    }
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        for prefix, replacement in lifecycle_updates.items():
            if text.startswith(prefix):
                paragraph.text = replacement
                paragraph.style = doc.styles["Normal"]
                clear_numbering(paragraph)
                break

    # Keep all table rows intact and repeat headings.
    for table in doc.tables:
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        if table.rows:
            set_repeat_table_header(table.rows[0])
        for row in table.rows:
            prevent_row_split(row)


def configure_styles(doc):
    if "Caption" not in [style.name for style in doc.styles]:
        doc.styles.add_style("Caption", WD_STYLE_TYPE.PARAGRAPH)
    normal = doc.styles["Normal"]
    normal.font.name = "Georgia"
    normal.font.size = Pt(11)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    for name, size, color in [
        ("Title", 26, "111827"),
        ("Heading 1", 18, "111827"),
        ("Heading 2", 15, "111827"),
        ("Heading 3", 12, "1E3A8A"),
    ]:
        style = doc.styles[name]
        style.font.name = "Georgia"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(5)

    caption = doc.styles["Caption"]
    caption.font.name = "Georgia"
    caption.font.size = Pt(9)
    caption.font.italic = True
    caption.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.keep_with_next = False
    caption.paragraph_format.space_before = Pt(3)
    caption.paragraph_format.space_after = Pt(8)

    for style_name in ("List Paragraph", "List Bullet"):
        if style_name in [style.name for style in doc.styles]:
            style = doc.styles[style_name]
            style.font.name = "Georgia"
            style.font.size = Pt(11)
            style.paragraph_format.space_after = Pt(4)


def add_accessible_image_descriptions(doc):
    for index, shape in enumerate(doc.inline_shapes, start=1):
        doc_pr = shape._inline.docPr
        if doc_pr.get("descr") or doc_pr.get("title"):
            continue
        node = shape._inline
        while node is not None and node.tag != qn("w:p"):
            node = node.getparent()
        text = ""
        if node is not None:
            text = " ".join("".join(node.xpath(".//w:t/text()")) .split())
        if not text:
            text = f"HOSIS Housekeeping system figure {index}"
        doc_pr.set("descr", text[:250])
        doc_pr.set("title", f"Housekeeping figure {index}")


def add_revision_chapter(doc, finance_diagram: Path, leave_diagram: Path):
    doc.add_page_break()
    doc.add_heading("Security and Inter-Subsystem Integration Revision", level=1)
    add_body(
        doc,
        "This revision incorporates the first-defense comments and the additional operational requirements identified on November 23, 2026. It documents only behavior implemented in the Housekeeping source code and verified against the integrated HOSIS database. The design preserves department ownership: Housekeeping records evidence, Front Office verifies the stay context, Finance decides guest charges, Human Resources decides leave, and Engineering controls repair progress.",
    )

    doc.add_heading("Implemented Integration Responsibilities", level=2)
    add_table(
        doc,
        ["Source", "Receiving subsystem", "Implemented responsibility", "Decision owner"],
        [
            ["Housekeeping", "Front Office", "Send room-readiness notices, room-condition reports, reservation-linked requests, and charge findings.", "Front Office validates reservation and room context."],
            ["Front Office", "Finance", "Forward a validated damage, missing-linen, deep-cleaning, smoking, or other applicable guest-fee finding.", "Finance approves or rejects and sets the final amount."],
            ["Housekeeping", "Human Resources", "Submit a dated leave request with leave type and reason; show the returned decision to the employee.", "Human Resources approves or rejects."],
            ["Housekeeping", "Engineering", "Send a maintenance issue and receive protected repair status updates.", "Engineering owns IN_PROGRESS and REPAIRED updates."],
        ],
    )
    add_body(
        doc,
        "The responsibility split prevents Housekeeping from charging a guest, approving its own leave, or declaring a repair complete. These separation-of-duty rules are enforced by backend role checks and by database state transitions, not only by hidden interface buttons.",
    )

    doc.add_heading("Finance Charge-Finding Workflow", level=2)
    doc.add_picture(str(finance_diagram), width=Inches(6.35))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_caption(doc, "Figure 6.1 Housekeeping, Front Office, and Finance charge-finding workflow")
    add_body(
        doc,
        "A Housekeeping staff member records the room, finding category, description, observed date, optional reservation reference, and estimated cost. Front Office reviews the finding against the guest stay and either rejects it with a reason or forwards it to Finance. Finance performs the final review, supplies a decision note, and—only when approving—sets the final amount. The integrated repository creates exactly one invoice line for an approved finding inside the same database transaction. Row locking, version fields, and unique invoice linkage prevent simultaneous or repeated decisions from producing duplicate charges.",
    )
    add_body(
        doc,
        "Privacy boundary: Housekeeping records operational evidence but the integration response excludes guest contact details and credentials. Finance receives only the room, reservation reference, finding facts, review history, and monetary values required for a billing decision.",
        bold_prefix="Privacy boundary:",
    )

    doc.add_heading("Human Resources Leave Workflow", level=2)
    doc.add_picture(str(leave_diagram), width=Inches(6.35))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_caption(doc, "Figure 6.2 Housekeeping staff leave-request and Human Resources decision workflow")
    add_body(
        doc,
        "An active Housekeeping employee selects a leave type, start date, end date, and reason. The API refuses past dates, reversed ranges, requests longer than sixty calendar days, and overlaps with another active request. Employees can read only their own leave history and may withdraw only a pending request. Human Resources and administrators can review Housekeeping requests, while the decision timestamp, reviewer, notes, and record version provide a traceable audit record.",
    )

    doc.add_heading("Integration Endpoint Contract", level=2)
    add_table(
        doc,
        ["Role", "Method and endpoint", "Purpose and protection"],
        [
            ["Housekeeping", "GET /api/housekeeping/charge-findings", "Read charge findings created within the Housekeeping workflow."],
            ["Housekeeping", "POST /api/housekeeping/charge-findings", "Create a validated finding; duplicate open findings for the same event are refused."],
            ["Housekeeping", "PATCH /api/housekeeping/charge-findings/:id/withdraw", "Withdraw only a finding that has not reached a department decision."],
            ["Front Office", "GET /api/housekeeping/integrations/front-office/charge-findings", "Read the Front Office review queue."],
            ["Front Office", "PATCH /api/housekeeping/integrations/front-office/charge-findings/:id", "Forward to Finance or reject with required notes."],
            ["Finance", "GET /api/housekeeping/integrations/finance/charge-findings", "Read only findings that passed Front Office review."],
            ["Finance", "PATCH /api/housekeeping/integrations/finance/charge-findings/:id", "Approve with a valid amount or reject; a second decision is refused."],
            ["Housekeeping", "GET /api/housekeeping/leave-requests", "Read the signed-in employee's leave requests only."],
            ["Housekeeping", "POST /api/housekeeping/leave-requests", "Submit a validated, non-overlapping leave request."],
            ["Housekeeping", "PATCH /api/housekeeping/leave-requests/:id/withdraw", "Withdraw the signed-in employee's pending request."],
            ["Human Resources", "GET /api/housekeeping/integrations/hr/leave-requests", "Read the Housekeeping leave queue."],
            ["Human Resources", "PATCH /api/housekeeping/integrations/hr/leave-requests/:id", "Approve or reject with reviewer identity and notes."],
        ],
    )

    doc.add_heading("Data Model Extension", level=2)
    add_body(
        doc,
        "The existing Housekeeping ERD is extended by two charge-finding entities and the shared Human Resources leave entity. Foreign keys link findings to rooms, the reporting user, department reviewers, and the resulting Finance invoice. Event records form an append-only custody history for each cross-department decision.",
    )
    add_table(
        doc,
        ["Entity", "Key fields", "Purpose and integrity rules"],
        [
            ["HK_CHARGE_FINDINGS", "finding_id (PK), room_id (FK), reported_by (FK), finance_invoice_id (unique FK)", "Stores the evidence, status, estimates, final amount, reviewers, timestamps, and optimistic version. Status is restricted to REPORTED, FOR_FINANCE, APPROVED, REJECTED, or WITHDRAWN."],
            ["HK_CHARGE_FINDING_EVENTS", "event_id (PK), finding_id (FK), actor_user_id (FK)", "Append-only transition history containing the action, originating department, notes, and event time."],
            ["HR_LEAVE_REQUESTS", "leave_request_id (PK), employee_id (FK), decided_by (FK)", "Stores leave type, inclusive date range, reason, status, submission and decision metadata, and version."],
        ],
    )

    doc.add_heading("Functional Requirements Added", level=2)
    add_table(
        doc,
        ["ID", "Requirement", "Acceptance evidence"],
        [
            ["HK-FIN-01", "Housekeeping shall record a room-related charge finding without directly charging the guest.", "POST charge finding returns a traceable reference and REPORTED status."],
            ["HK-FIN-02", "Front Office shall validate the reservation or room context before Finance receives the finding.", "Only FRONT_OFFICE or ADMIN can transition REPORTED to FOR_FINANCE."],
            ["HK-FIN-03", "Finance shall decide the final amount and shall not create duplicate invoice lines.", "Transactional approval, row lock, version check, and unique invoice linkage."],
            ["HK-HR-01", "Housekeeping personnel shall submit a leave type, date range, and reason.", "Validated POST leave request with inclusive day count."],
            ["HK-HR-02", "Human Resources shall return an approve or reject decision visible to the requesting employee.", "HR-only decision route records reviewer, time, notes, and updated status."],
            ["HK-SEC-01", "The backend shall enforce role and record ownership independent of the interface.", "Negative authorization and cross-user access tests return 403 or 404."],
        ],
    )

    doc.add_heading("Security Audit and Control Matrix", level=2)
    add_table(
        doc,
        ["Risk or panel question", "Implemented control", "Verification"],
        [
            ["Can a Housekeeper approve a charge or leave request?", "Server-side RBAC separates HOUSEKEEPING, FRONT_OFFICE, FINANCE, HR, ENGINEERING, and ADMIN actions.", "Role-ownership tests cover forbidden transitions."],
            ["Can one employee read another employee's leave reason?", "Leave listing is filtered by authenticated user ID; HR receives a separate protected queue.", "Cross-user access test receives no private record."],
            ["Can two reviewers approve the same charge at the same time?", "SELECT FOR UPDATE, current-state checks, optimistic versioning, and one transaction protect the decision.", "Repeated approval is rejected and one invoice linkage remains."],
            ["Can malformed or excessive input reach SQL?", "JSON-object validation, allowed-value checks, length limits, date rules, money precision checks, and parameterized SQL.", "Invalid input tests return controlled 400 responses."],
            ["Can deactivated users keep using an old token?", "Authentication re-reads employment status and session version for every protected request.", "Session deactivation regression test signs the account out."],
            ["Can uploaded content disguise an executable file as an image?", "Declared MIME type and file signature must match before image storage.", "Image content mismatch test is included in both repositories."],
            ["Can public QR access reveal claimants or storage locations?", "The public query uses a fixed privacy-safe projection and a random permanent code.", "Only item reference, description, found location/date, and status are returned."],
            ["Can audit records be changed from the interface?", "Audit and event feeds are read-only; workflow updates append events rather than overwriting history.", "Supervisor export and category filters read the same persisted records."],
        ],
    )

    doc.add_heading("Verification Results", level=2)
    add_table(
        doc,
        ["Verification activity", "Result on November 23, 2026"],
        [
            ["Standalone backend regression suite", "51 of 51 tests passed, including Finance/Front Office ownership, leave privacy, overlap checks, and image validation."],
            ["Integrated backend unit suite", "19 tests passed; two database-dependent suites remain explicitly separated from the unit run."],
            ["Integrated PostgreSQL workflow check", "Finding creation, Front Office forward, Finance approval/invoice creation, leave submission, HR approval, and employee decision retrieval completed successfully."],
            ["Frontend production builds", "Integrated and standalone Vite builds completed successfully after the new pages and views were added."],
            ["Database migration", "The additive workflow migration applied without replacing existing Front Office, Finance, HR, or Housekeeping records."],
        ],
    )
    add_body(
        doc,
        "Quality statement: testing reduces known risk but does not prove that any non-trivial software is incapable of future defects. Production acceptance should still include backup restoration, HTTPS termination, environment-specific secrets, concurrency testing at the expected hotel load, and a joint user-acceptance test by Housekeeping, Front Office, Finance, Human Resources, and Engineering.",
        bold_prefix="Quality statement:",
    )

    doc.add_heading("First-Defense Comment Resolution", level=2)
    add_table(
        doc,
        ["Professor comment", "Correction in this revision"],
        [
            ["Correct title-page spacing, names, course, font, and margins.", "A corrected separate title page uses the submitted group names, SIA101 course title, adviser name, Georgia font, and balanced margins."],
            ["Place figure captions at the bottom and center them; avoid caption bullets.", "Figure captions use the centered Word Caption style directly below each figure."],
            ["Add descriptions for software-design images, flowcharts, DFDs, and architecture.", "Existing narratives are retained and the new Finance and HR figures include explicit workflow, ownership, state, and privacy explanations."],
            ["Do not cut tables across pages.", "Table headers repeat and row splitting is disabled where Word permits; dense data is separated into focused tables."],
            ["Use numbers for questionnaire items rather than bullets.", "The questionnaire section uses the numbered-list style."],
            ["Expand lifecycle stages and maintenance planning.", "Planning, construction, monitoring, testing, maintenance, security, deployment, backup, and cross-department acceptance responsibilities are stated as implementable controls."],
            ["Document Finance and HR integration.", "The paper now contains responsibilities, endpoints, data entities, state transitions, security controls, and verification evidence for both integrations."],
        ],
    )

    doc.add_heading("Updated Maintenance and Operations Plan", level=2)
    for number, text in enumerate(
        [
            "Corrective maintenance: record reproducible defects, affected role and endpoint, database state, expected result, actual result, severity, owner, correction commit, regression test, and release date.",
            "Adaptive maintenance: review dependency, browser, operating-system, PostgreSQL, and HOSIS contract changes in a controlled branch before deployment.",
            "Preventive maintenance: apply security updates, rotate secrets, review failed-sign-in and audit records, verify least-privilege database grants, and test backup restoration on a schedule.",
            "Perfective maintenance: prioritize changes supported by hotel-user feedback and measured workflow delay rather than visual preference alone.",
            "Release control: require a database backup, migration review, backend tests, frontend build, cross-subsystem acceptance check, rollback instructions, and signed release note.",
        ],
        start=1,
    ):
        paragraph = doc.add_paragraph(style="Normal")
        paragraph.add_run(f"{number}. {text}")


def create_title_page(output_path: Path):
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    normal = doc.styles["Normal"]
    normal.font.name = "Georgia"
    normal.font.size = Pt(12)
    normal.paragraph_format.space_after = Pt(0)

    def centered(text="", size=12, bold=False, before=0, after=0, italic=False):
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(before)
        paragraph.paragraph_format.space_after = Pt(after)
        run = paragraph.add_run(text)
        run.font.name = "Georgia"
        run.font.size = Pt(size)
        run.bold = bold
        run.italic = italic
        return paragraph

    centered("HOSIS HOUSEKEEPING SUBSYSTEM", 16, True, before=42)
    centered("An SIA101: System Integration and Architecture Project", 13, False, after=56)
    centered("A Project Documentation", 13)
    centered("Presented to", 13)
    centered("The Faculty of Information Technology", 13)
    centered("CELTECH COLLEGE – OLONGAPO", 13, after=70)
    centered("In Partial Fulfillment", 13)
    centered("of the Requirements for the", 13)
    centered("Bachelor of Science in Information Technology", 13, after=56)
    centered("Submitted by:", 13, after=16)
    for member in GROUP_MEMBERS:
        centered(member, 12)
    centered("Submitted to:", 13, before=40, after=16)
    centered("Lacorte, Rewel A.", 12)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)


def update_document(source: Path, output: Path, asset_dir: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)
    doc = Document(output)
    configure_styles(doc)
    normalize_existing_content(doc)
    finance_diagram, leave_diagram = generate_workflow_diagrams(asset_dir)
    add_revision_chapter(doc, finance_diagram, leave_diagram)
    add_accessible_image_descriptions(doc)
    doc.core_properties.title = "HOSIS Housekeeping Subsystem Updated Documentation"
    doc.core_properties.subject = "Housekeeping integration, security, testing, and first-defense revisions"
    doc.core_properties.keywords = "HOSIS, Housekeeping, Front Office, Finance, HR, security, RBAC"
    doc.save(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    title_path = output_dir / "HOSIS_Housekeeping_Corrected_Title_Page_2026.docx"
    document_path = output_dir / "HOSIS_Housekeeping_Subsystem_Updated_Documentation_2026.docx"
    create_title_page(title_path)
    update_document(args.source.resolve(), document_path, output_dir / "assets")
    print(title_path)
    print(document_path)


if __name__ == "__main__":
    main()
