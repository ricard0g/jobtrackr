"""Tests for deterministic one-page densification."""

from __future__ import annotations

from cv_generation.graph.one_page import (
    fit_canonical_cv_to_one_page,
    fits_one_page,
    pdf_page_count_for_cv,
)
from cv_generation.graph.nodes import node_validate
from cv_generation.graph.state import GraphState
from cv_generation.models.canonical_cv import (
    AwardItem,
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ValuesAlignmentItem,
)


def _overflowing_cv() -> CanonicalCV:
    long_bullet = (
        "Delivered cross-functional analytical work spanning stakeholder workshops, "
        "source-to-target mapping reviews, reconciliation controls, and documented "
        "outcomes for governance forums with detailed operational commentary."
    )
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
        professional_summary=(
            "Business Data Analyst with extensive experience translating complex "
            "requirements into actionable insights across large programmes. "
            "Strengths include Python, SQL, stakeholder workshops, lineage documentation, "
            "and governance frameworks aligned to demanding enterprise environments. "
            "Proven collaborator with engineers, stewards, and business owners on delivery."
        ),
        skills=[
            "Python",
            "SQL",
            "Data Analysis",
            "Requirements Gathering",
            "Stakeholder Management",
            "Data Governance",
            "Jira",
            "Confluence",
            "Excel",
            "Power BI",
        ],
        experience=[
            ExperienceItem(
                company=f"Company {i}",
                title="Business Data Analyst" if i == 0 else f"Analyst {i}",
                start_date="2020-01",
                end_date="Present" if i == 0 else "2019-12",
                bullets=[f"{long_bullet} Variant {j}." for j in range(5)],
            )
            for i in range(5)
        ],
        education=[
            EducationItem(
                institution="University of London",
                degree="BSc",
                field="Mathematics",
                end_date="2019-06",
            )
        ],
        awards=[AwardItem(title=f"Recognition Award {i}", date="2022") for i in range(4)],
        projects=[
            ProjectItem(
                name=f"Platform {i}",
                description="Large internal analytical platform initiative with broad scope.",
                bullets=[long_bullet, long_bullet],
            )
            for i in range(3)
        ],
        certifications=["AWS Certified Developer", "Google Data Analytics"],
        languages=["English", "French", "German"],
        values_alignment=[
            ValuesAlignmentItem(
                value="Integrity",
                behaviour="Documented novel algorithms for the Analytical Engine",
            )
        ],
        output_language="en",
    )


def test_overflowing_cv_exceeds_one_page_before_fit():
    cv = _overflowing_cv()
    pages = pdf_page_count_for_cv(cv)
    assert pages is not None and pages > 1
    assert not fits_one_page(cv)


def test_fits_one_page_rejects_uncountable_pdf(monkeypatch):
    """Uncountable PDF must not be treated as a successful one-page fit."""
    from cv_generation.graph import one_page

    monkeypatch.setattr(one_page, "pdf_page_count_for_cv", lambda _cv: None)
    assert not fits_one_page(_overflowing_cv())


def test_fit_canonical_cv_to_one_page_shrinks_until_pdf_fits():
    cv = _overflowing_cv()
    fitted = fit_canonical_cv_to_one_page(
        cv,
        jd_analysis={
            "keywords": ["python", "analyst", "data", "governance"],
            "target_title": "Business Data Analyst",
        },
    )
    assert fits_one_page(fitted)
    assert fitted.experience  # never wipe all history
    assert fitted.full_name == "Ada Lovelace"
    # Trailing extras should be preferred drop targets.
    assert fitted.values_alignment == [] or len(fitted.experience) < len(cv.experience)


def test_node_validate_densifies_overflow_instead_of_failing():
    cv = _overflowing_cv()
    evidence = {
        "full_name": "Ada Lovelace",
        "contact": {
            "email": "ada@example.com",
            "phone": "+1-555-0100",
            "linkedin": "https://linkedin.com/in/ada-lovelace",
            "github": "https://github.com/ada",
            "portfolio": "https://ada.dev",
        },
        "skills": list(cv.skills),
        "experience": [
            {"company": exp.company, "title": exp.title, "bullets": list(exp.bullets)}
            for exp in cv.experience
        ],
        "education": [{"institution": "University of London", "degree": "BSc"}],
        "awards": [{"title": a.title, "date": a.date} for a in cv.awards],
        "projects": [{"name": p.name, "description": p.description, "bullets": p.bullets} for p in cv.projects],
        "certifications": list(cv.certifications),
        "spoken_languages": list(cv.languages),
        "raw_text": "ada lovelace ada@example.com "
        + " ".join(cv.skills)
        + " "
        + " ".join(exp.company for exp in cv.experience)
        + " "
        + " ".join(b for exp in cv.experience for b in exp.bullets)
        + " university of london documented novel algorithms for the analytical engine "
        + " ".join(a.title for a in cv.awards)
        + " "
        + " ".join(p.name for p in cv.projects),
    }
    state: GraphState = {
        "canonical_cv": cv,
        "evidence": evidence,
        "jd_analysis": {
            "keywords": ["python", "analyst", "data"],
            "target_title": "Business Data Analyst",
        },
        "revision_count": 2,
        "max_revisions": 2,
        "correlation_id": "one-page-fit-test",
    }
    out = node_validate(state)
    assert out["needs_revision"] is False
    assert out["validation_issues"] == []
    assert fits_one_page(out["canonical_cv"])
