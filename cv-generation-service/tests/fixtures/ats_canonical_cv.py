"""Fixed Canonical CV pin for ATS Structure renderer tests."""

from __future__ import annotations

from cv_generation.models.canonical_cv import (
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceItem,
)


def ats_core_canonical_cv() -> CanonicalCV:
    """Stable Generated CV used to pin DOCX presentation against the ATS template."""
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
                start_date="2016-09",
                end_date="2019-06",
            )
        ],
        output_language="en",
    )
