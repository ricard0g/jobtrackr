"""DOCX renderer — single-column ATS-safe template."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

from cv_generation.models.canonical_cv import CanonicalCV, EducationItem, ExperienceItem

_BODY_FONT = "Arial"
_BODY_SIZE = Pt(11)
_MARGIN = Inches(1)
# Usable content width on US Letter with 1" margins (8.5 - 1 - 1).
_RIGHT_TAB = Inches(6.5)


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
        section.top_margin = _MARGIN
        section.bottom_margin = _MARGIN
        section.left_margin = _MARGIN
        section.right_margin = _MARGIN

    style = doc.styles["Normal"]
    style.font.name = _BODY_FONT
    style.font.size = _BODY_SIZE
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:ascii"), _BODY_FONT)
    rfonts.set(qn("w:hAnsi"), _BODY_FONT)
    rfonts.set(qn("w:eastAsia"), _BODY_FONT)
    rfonts.set(qn("w:cs"), _BODY_FONT)
    pf = style.paragraph_format
    pf.space_after = Pt(4)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE


def _add_centered_header(doc: Document, cv: CanonicalCV) -> None:
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(cv.full_name)
    run.bold = True

    c = cv.contact
    contact_bits = [v for v in (c.phone, c.email, c.location, c.linkedin, c.github) if v]
    if contact_bits:
        contact = doc.add_paragraph()
        contact.alignment = WD_ALIGN_PARAGRAPH.CENTER
        contact.add_run(" | ".join(contact_bits))

    if c.portfolio:
        portfolio = doc.add_paragraph()
        portfolio.alignment = WD_ALIGN_PARAGRAPH.CENTER
        portfolio.add_run(c.portfolio)


def _add_experience_header(doc: Document, exp: ExperienceItem) -> None:
    left = f"{exp.title}, {exp.company}"
    dates = " - ".join(filter(None, [exp.start_date, exp.end_date]))
    _add_dated_line(doc, left, dates)


def _add_education_block(doc: Document, edu: EducationItem) -> None:
    degree_bits = [bit for bit in (edu.degree, edu.field) if bit]
    left = ", ".join(degree_bits) if degree_bits else edu.institution
    dates = edu.end_date or edu.start_date or ""
    _add_dated_line(doc, left, dates)
    if degree_bits and edu.institution:
        doc.add_paragraph(edu.institution)
    for detail in edu.details:
        doc.add_paragraph(detail, style="List Bullet")


def _add_dated_line(doc: Document, left: str, dates: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.tab_stops.add_tab_stop(_RIGHT_TAB, WD_TAB_ALIGNMENT.RIGHT)
    left_run = p.add_run(left)
    left_run.bold = True
    left_run.italic = True
    if dates:
        p.add_run("\t")
        date_run = p.add_run(dates)
        date_run.bold = True
        date_run.italic = True


def _heading(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    r = p.add_run(text.upper())
    r.bold = True
