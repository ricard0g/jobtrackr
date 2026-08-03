"""Fixed Canonical CV pin for ATS Structure renderer tests."""

from __future__ import annotations

from cv_generation.models.canonical_cv import (
    AwardItem,
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ValuesAlignmentItem,
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


def ats_trailing_canonical_cv() -> CanonicalCV:
    """Core ATS CV plus every conditional trailing section populated."""
    cv = ats_core_canonical_cv()
    cv.awards = [
        AwardItem(title="Ada Lovelace Award", date="2022"),
        AwardItem(title="Volunteer tutor, Coding Club"),
    ]
    cv.projects = [
        ProjectItem(
            name="Difference Engine",
            description="Mechanical calculation prototype",
            bullets=["Designed punched-card programs"],
        )
    ]
    cv.certifications = ["AWS Certified Developer"]
    cv.languages = ["English", "French"]
    cv.values_alignment = [
        ValuesAlignmentItem(
            value="Curiosity",
            behaviour="Documented novel algorithms for the Analytical Engine",
        )
    ]
    return cv
