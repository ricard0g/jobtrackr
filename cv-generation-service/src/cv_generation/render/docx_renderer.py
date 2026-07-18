"""DOCX renderer — single-column ATS-safe template."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_LINE_SPACING
from docx.shared import Pt

from cv_generation.models.canonical_cv import CanonicalCV


def render_docx(cv: CanonicalCV) -> bytes:
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    pf = style.paragraph_format
    pf.space_after = Pt(4)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE

    title = doc.add_paragraph()
    run = title.add_run(cv.full_name)
    run.bold = True
    run.font.size = Pt(18)

    contact_bits: list[str] = []
    c = cv.contact
    for value in (c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio):
        if value:
            contact_bits.append(value)
    if contact_bits:
        doc.add_paragraph(" | ".join(contact_bits))

    if cv.professional_summary:
        _heading(doc, "Summary")
        doc.add_paragraph(cv.professional_summary)

    if cv.skills:
        _heading(doc, "Skills")
        doc.add_paragraph(", ".join(cv.skills))

    if cv.experience:
        _heading(doc, "Experience")
        for exp in cv.experience:
            dates = " – ".join(filter(None, [exp.start_date, exp.end_date]))
            header = f"{exp.title} — {exp.company}"
            if dates:
                header = f"{header} ({dates})"
            p = doc.add_paragraph()
            r = p.add_run(header)
            r.bold = True
            if exp.location:
                doc.add_paragraph(exp.location)
            for bullet in exp.bullets:
                doc.add_paragraph(bullet, style="List Bullet")

    if cv.education:
        _heading(doc, "Education")
        for edu in cv.education:
            p = doc.add_paragraph()
            r = p.add_run(edu.degree or edu.institution)
            r.bold = True
            if edu.degree and edu.institution:
                doc.add_paragraph(edu.institution)
            if edu.field:
                doc.add_paragraph(edu.field)

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


def _heading(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    r = p.add_run(text.upper())
    r.bold = True
    r.font.size = Pt(12)
