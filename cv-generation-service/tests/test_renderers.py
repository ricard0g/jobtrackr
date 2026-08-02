"""Renderer golden-ish tests."""

from __future__ import annotations

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.shared import Pt

from cv_generation.models.canonical_cv import (
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceItem,
)
from cv_generation.render.docx_renderer import render_docx
from cv_generation.render.markdown import render_markdown


def _sample_cv() -> CanonicalCV:
    return CanonicalCV(
        full_name="Ada Lovelace",
        contact=ContactInfo(
            email="ada@example.com",
            phone="+1-555-0100",
            linkedin="https://linkedin.com/in/ada-lovelace",
            github="https://github.com/ada",
            portfolio="https://ada.dev",
            location="London, UK",
        ),
        professional_summary="Software engineer with Python experience.",
        skills=["Python", "FastAPI", "PostgreSQL"],
        experience=[
            ExperienceItem(
                company="Analytical Engines",
                title="Software Engineer",
                start_date="2020-01",
                end_date="Present",
                bullets=["Built calculation engines in Python"],
            )
        ],
        education=[
            EducationItem(
                institution="University of London",
                degree="BSc",
                field="Mathematics",
                end_date="2019-06",
            )
        ],
        output_language="en",
    )


def _docx_from_sample() -> Document:
    return Document(io.BytesIO(render_docx(_sample_cv())))


def test_markdown_contains_name_and_email():
    data = render_markdown(_sample_cv())
    text = data.decode("utf-8")
    assert "Ada Lovelace" in text
    assert "ada@example.com" in text
    assert "Analytical Engines" in text


def test_docx_reopen_finds_name_and_email():
    data = render_docx(_sample_cv())
    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Ada Lovelace" in text
    assert "ada@example.com" in text
    assert "Python" in text


def test_docx_core_section_order_is_ats_structure():
    texts = [p.text.strip() for p in _docx_from_sample().paragraphs]
    summary = texts.index("PROFESSIONAL SUMMARY")
    experience = texts.index("EXPERIENCE")
    education = texts.index("EDUCATION")
    skills = texts.index("SKILLS")
    assert summary < experience < education < skills


def test_docx_header_is_centered_with_optional_portfolio_line():
    doc = _docx_from_sample()
    paragraphs = doc.paragraphs
    assert paragraphs[0].text.strip() == "Ada Lovelace"
    assert paragraphs[0].alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert paragraphs[0].runs[0].bold is True

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
    doc = _docx_from_sample()
    by_text = {p.text: p for p in doc.paragraphs}

    experience = by_text["Software Engineer, Analytical Engines\t2020-01 - Present"]
    education = by_text["BSc, Mathematics\t2019-06"]

    for para in (experience, education):
        tabs = list(para.paragraph_format.tab_stops)
        assert len(tabs) == 1
        assert tabs[0].alignment == WD_TAB_ALIGNMENT.RIGHT
        assert abs(tabs[0].position.inches - 6.5) < 0.05
        content_runs = [r for r in para.runs if r.text and r.text != "\t"]
        assert content_runs
        assert all(r.bold and r.italic for r in content_runs)

    assert "University of London" in [p.text for p in doc.paragraphs]


def test_docx_uses_arial_one_inch_margins_and_no_tables_or_chrome():
    doc = _docx_from_sample()
    normal = doc.styles["Normal"]
    assert normal.font.name == "Arial"
    assert normal.font.size == Pt(11)

    section = doc.sections[0]
    for margin in (
        section.left_margin,
        section.right_margin,
        section.top_margin,
        section.bottom_margin,
    ):
        assert abs(margin.inches - 1.0) < 0.01

    assert doc.tables == []
    assert all(not p.text.strip() for p in section.header.paragraphs)
    assert all(not p.text.strip() for p in section.footer.paragraphs)
