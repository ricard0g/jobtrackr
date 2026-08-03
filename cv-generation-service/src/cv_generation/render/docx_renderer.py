"""DOCX renderer — single-column ATS-safe template."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from docx.text.run import Run

from cv_generation.models.canonical_cv import CanonicalCV, EducationItem, ExperienceItem

# Public ATS presentation constants (also used by renderer tests).
ATS_BODY_FONT = "Arial"
ATS_BODY_SIZE = Pt(11)
ATS_MARGIN = Inches(1)
# Usable content width on US Letter with 1" margins (8.5 - 1 - 1).
ATS_RIGHT_TAB = Inches(6.5)


def render_docx(cv: CanonicalCV) -> bytes:
    doc = Document()
    _apply_page_and_font_defaults(doc)

    _add_centered_header(doc, cv)

    if cv.professional_summary:
        _heading(doc, "Professional Summary")
        doc.add_paragraph(cv.professional_summary)

    if cv.experience:
        _heading(doc, "Experience")
        for exp in cv.experience:
            _add_experience_header(doc, exp)
            if exp.location:
                doc.add_paragraph(exp.location)
            for bullet in exp.bullets:
                doc.add_paragraph(bullet, style="List Bullet")

    if cv.education:
        _heading(doc, "Education")
        for edu in cv.education:
            _add_education_block(doc, edu)

    if cv.skills:
        _heading(doc, "Skills")
        doc.add_paragraph(", ".join(cv.skills))

    if cv.projects:
        _heading(doc, "Projects")
        for proj in cv.projects:
            p = doc.add_paragraph()
            r = p.add_run(proj.name)
            r.bold = True
            if proj.description:
                doc.add_paragraph(proj.description)
            for bullet in proj.bullets:
                doc.add_paragraph(bullet, style="List Bullet")

    if cv.certifications:
        _heading(doc, "Certifications")
        for cert in cv.certifications:
            doc.add_paragraph(cert, style="List Bullet")

    if cv.languages:
        _heading(doc, "Languages")
        doc.add_paragraph(", ".join(cv.languages))

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _apply_page_and_font_defaults(doc: Document) -> None:
    for section in doc.sections:
        section.top_margin = ATS_MARGIN
        section.bottom_margin = ATS_MARGIN
        section.left_margin = ATS_MARGIN
        section.right_margin = ATS_MARGIN

    style = doc.styles["Normal"]
    style.font.name = ATS_BODY_FONT
    style.font.size = ATS_BODY_SIZE
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:ascii"), ATS_BODY_FONT)
    rfonts.set(qn("w:hAnsi"), ATS_BODY_FONT)
    rfonts.set(qn("w:eastAsia"), ATS_BODY_FONT)
    rfonts.set(qn("w:cs"), ATS_BODY_FONT)
    pf = style.paragraph_format
    pf.space_after = Pt(4)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE


def _add_centered_header(doc: Document, cv: CanonicalCV) -> None:
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _apply_ats_run(title.add_run(cv.full_name), bold=True)

    c = cv.contact
    contact_bits = [v for v in (c.phone, c.email, c.location, c.linkedin, c.github) if v]
    if contact_bits:
        contact = doc.add_paragraph()
        contact.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _apply_ats_run(contact.add_run(" | ".join(contact_bits)))

    if c.portfolio:
        portfolio = doc.add_paragraph()
        portfolio.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _apply_ats_run(portfolio.add_run(c.portfolio))


def _add_experience_header(doc: Document, exp: ExperienceItem) -> None:
    label = f"{exp.title}, {exp.company}"
    dates = " - ".join(filter(None, [exp.start_date, exp.end_date]))
    _add_dated_line(doc, label=label, dates=dates)


def _add_education_block(doc: Document, edu: EducationItem) -> None:
    degree_bits = [bit for bit in (edu.degree, edu.field) if bit]
    label = ", ".join(degree_bits) if degree_bits else edu.institution
    # ATS template uses Month/Year of Completion — never a start-date fallback.
    completion = edu.end_date or ""
    _add_dated_line(doc, label=label, dates=completion)
    if degree_bits and edu.institution:
        doc.add_paragraph(edu.institution)
    for detail in edu.details:
        doc.add_paragraph(detail, style="List Bullet")


def _add_dated_line(doc: Document, *, label: str, dates: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.tab_stops.add_tab_stop(ATS_RIGHT_TAB, WD_TAB_ALIGNMENT.RIGHT)
    _apply_ats_run(p.add_run(label), bold=True, italic=True)
    if dates:
        p.add_run("\t")
        _apply_ats_run(p.add_run(dates), bold=True, italic=True)


def _heading(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    _apply_ats_run(p.add_run(text.upper()), bold=True)


def _apply_ats_run(run: Run, *, bold: bool = False, italic: bool = False) -> None:
    """Pin run typography to the ATS template (Arial 11pt)."""
    run.bold = bold
    run.italic = italic
    run.font.name = ATS_BODY_FONT
    run.font.size = ATS_BODY_SIZE
