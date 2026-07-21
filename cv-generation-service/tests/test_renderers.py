"""Renderer golden-ish tests."""

from __future__ import annotations

import io

from docx import Document

from cv_generation.models.canonical_cv import CanonicalCV, ContactInfo, ExperienceItem
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
        ),
        professional_summary="Software engineer with Python experience.",
        skills=["Python", "FastAPI", "PostgreSQL"],
        experience=[
            ExperienceItem(
                company="Analytical Engines",
                title="Software Engineer",
                bullets=["Built calculation engines in Python"],
            )
        ],
        output_language="en",
    )


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
