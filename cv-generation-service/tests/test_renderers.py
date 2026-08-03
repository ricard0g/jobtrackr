"""Renderer golden-ish tests."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.shared import Pt

from cv_generation.models.canonical_cv import CanonicalCV, ContactInfo, EducationItem
from cv_generation.render.docx_renderer import (
    ATS_BODY_FONT,
    ATS_BODY_SIZE,
    ATS_MARGIN,
    ATS_RIGHT_TAB,
    render_docx,
)
from cv_generation.render.markdown import render_markdown
from fixtures.ats_canonical_cv import ats_core_canonical_cv


def _docx_from_cv(cv: CanonicalCV | None = None) -> Document:
    return Document(io.BytesIO(render_docx(cv or ats_core_canonical_cv())))


def _paragraph_starting_with(doc: Document, prefix: str):
    for para in doc.paragraphs:
        if para.text.startswith(prefix):
            return para
    raise AssertionError(f"no paragraph starting with {prefix!r}")


def test_markdown_contains_name_and_email():
    data = render_markdown(ats_core_canonical_cv())
    text = data.decode("utf-8")
    assert "Ada Lovelace" in text
    assert "ada@example.com" in text
    assert "Analytical Engines" in text


def test_docx_reopen_finds_name_and_email():
    doc = _docx_from_cv()
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Ada Lovelace" in text
    assert "ada@example.com" in text
    assert "Python" in text


def test_docx_core_section_order_is_ats_structure():
    doc = _docx_from_cv()
    headings = {
        p.text.strip(): p
        for p in doc.paragraphs
        if p.text.strip()
        in {"PROFESSIONAL SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"}
    }
    assert list(headings) == [
        "PROFESSIONAL SUMMARY",
        "EXPERIENCE",
        "EDUCATION",
        "SKILLS",
    ]
    for para in headings.values():
        run = para.runs[0]
        assert run.bold is True
        assert run.font.name == ATS_BODY_FONT
        assert run.font.size == ATS_BODY_SIZE


def test_docx_header_is_centered_with_optional_portfolio_line():
    doc = _docx_from_cv()
    paragraphs = doc.paragraphs
    assert paragraphs[0].text.strip() == "Ada Lovelace"
    assert paragraphs[0].alignment == WD_ALIGN_PARAGRAPH.CENTER
    name_run = paragraphs[0].runs[0]
    assert name_run.bold is True
    assert name_run.font.name == ATS_BODY_FONT
    assert name_run.font.size == ATS_BODY_SIZE

    contact = paragraphs[1]
    assert contact.alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert "+1-555-0100" in contact.text
    assert "ada@example.com" in contact.text
    assert "London, UK" in contact.text
    assert "https://ada.dev" not in contact.text

    portfolio = paragraphs[2]
    assert portfolio.alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert portfolio.text.strip() == "https://ada.dev"


def test_docx_experience_and_education_use_bold_italic_right_tab_dates():
    doc = _docx_from_cv()
    experience = _paragraph_starting_with(doc, "Software Engineer, Analytical Engines")
    education = _paragraph_starting_with(doc, "BSc, Mathematics")

    assert "2020-01 - Present" in experience.text
    assert "\t" in experience.text
    assert "2019-06" in education.text
    assert "\t" in education.text
    assert "2016-09" not in education.text

    for para in (experience, education):
        tabs = list(para.paragraph_format.tab_stops)
        assert len(tabs) == 1
        assert tabs[0].alignment == WD_TAB_ALIGNMENT.RIGHT
        assert tabs[0].position == ATS_RIGHT_TAB
        content_runs = [r for r in para.runs if r.text and r.text != "\t"]
        assert content_runs
        assert all(r.bold and r.italic for r in content_runs)
        assert all(r.font.name == ATS_BODY_FONT for r in content_runs)
        assert all(r.font.size == ATS_BODY_SIZE for r in content_runs)

    assert "University of London" in [p.text for p in doc.paragraphs]


def test_docx_education_uses_completion_date_only():
    cv = ats_core_canonical_cv()
    cv.education = [
        EducationItem(
            institution="University of London",
            degree="BSc",
            field="Mathematics",
            start_date="2016-09",
            end_date=None,
        )
    ]
    doc = _docx_from_cv(cv)
    education = _paragraph_starting_with(doc, "BSc, Mathematics")
    assert "2016-09" not in education.text
    assert "\t" not in education.text


def test_docx_uses_arial_one_inch_margins_and_no_tables_or_chrome():
    doc = _docx_from_cv()
    normal = doc.styles["Normal"]
    assert normal.font.name == ATS_BODY_FONT
    assert normal.font.size == ATS_BODY_SIZE
    assert ATS_BODY_SIZE == Pt(11)
    assert ATS_MARGIN.inches == 1.0

    assert len(doc.sections) == 1
    section = doc.sections[0]
    for margin in (
        section.left_margin,
        section.right_margin,
        section.top_margin,
        section.bottom_margin,
    ):
        assert margin == ATS_MARGIN

    cols = section._sectPr.find(qn("w:cols"))
    if cols is not None and cols.get(qn("w:num")) is not None:
        assert cols.get(qn("w:num")) == "1"

    assert doc.tables == []
    assert list(doc.inline_shapes) == []
    assert doc.part.element.findall(".//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}wsp") == []
    assert all(not p.text.strip() for p in section.header.paragraphs)
    assert all(not p.text.strip() for p in section.footer.paragraphs)


def test_docx_omits_empty_core_sections_but_keeps_relative_order():
    cv = CanonicalCV(
        full_name="Ada Lovelace",
        contact=ContactInfo(email="ada@example.com"),
        professional_summary="Summary text.",
        skills=["Python"],
        experience=[],
        education=[],
        output_language="en",
    )
    texts = [p.text.strip() for p in _docx_from_cv(cv).paragraphs]
    assert "PROFESSIONAL SUMMARY" in texts
    assert "SKILLS" in texts
    assert "EXPERIENCE" not in texts
    assert "EDUCATION" not in texts
    assert texts.index("PROFESSIONAL SUMMARY") < texts.index("SKILLS")
