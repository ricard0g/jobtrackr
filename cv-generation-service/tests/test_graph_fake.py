"""Graph workflow tests with fake provider."""

from __future__ import annotations

import pytest

from cv_generation.graph.nodes import node_analyze_jd, node_merge_user_evidence, node_normalize_evidence
from cv_generation.graph.state import GraphState
from cv_generation.graph.validation import validate_canonical_cv
from cv_generation.graph.workflow import run_generation
from cv_generation.models.canonical_cv import (
    AwardItem,
    CanonicalCV,
    ContactInfo,
    ExperienceBulletGroup,
    ExperienceItem,
    ValuesAlignmentItem,
)
from cv_generation.models.candidate_evidence import CandidateEvidence
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import OutputFormat
from cv_generation.providers.fake import FakeProvider


def test_evidence_precedence_additional_info_over_base(sample_cv_md):
    text = sample_cv_md.decode("utf-8")
    state: GraphState = {
        "extracted_text": text,
        "additional_information": (
            "Name: Ada Override\n"
            "email: override@example.com\n"
            "Skills: Rust, Python\n"
        ),
    }
    norm = node_normalize_evidence(state, FakeProvider())
    state.update(norm)
    merged = node_merge_user_evidence(state)
    evidence = merged["evidence"]
    assert evidence["contact"]["email"] == "override@example.com"
    skills_lower = [s.lower() for s in evidence["skills"]]
    assert "rust" in skills_lower
    # Rust should appear before or among skills; additional skills merged in
    assert skills_lower.index("rust") < skills_lower.index("docker")


def test_no_fabrication_of_jd_skills(sample_cv_md, sample_jd):
    provider = FakeProvider()
    result = run_generation(
        provider=provider,
        base_cv_bytes=sample_cv_md,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000001",
        workflow_version="cv-graph-v2",
    )
    text = result.content.decode("utf-8")
    assert "Ada Lovelace" in text
    assert "Python" in text
    assert "Kubernetes" not in text
    assert result.canonical_cv is not None
    assert "Kubernetes" not in result.canonical_cv.skills
    assert result.canonical_cv.experience
    assert result.canonical_cv.education


def test_contact_only_base_cv_is_rejected(sample_jd):
    base_cv = (
        b"Ricardo Guzman\n"
        b"ricardo@example.com\n"
        b"https://www.example.com/\n"
        b"Contact details for employment opportunities.\n"
    )

    with pytest.raises(ServiceError) as exc:
        run_generation(
            provider=FakeProvider(),
            base_cv_bytes=base_cv,
            filename="cv.md",
            content_type="text/markdown",
            job_description=sample_jd,
            additional_information=None,
            output_format=OutputFormat.MARKDOWN,
            correlation_id="00000000-0000-0000-0000-000000000002",
            workflow_version="cv-graph-v2",
        )

    assert exc.value.code == ErrorCode.BASE_CV_NOT_EXTRACTABLE
    assert "no experience, education, or projects" in exc.value.message.lower()


class _InterpretingFakeProvider(FakeProvider):
    def interpret_base_cv(
        self,
        *,
        extracted_text: str,
        deterministic_hints: dict,
        additional_information: str | None = None,
    ) -> CandidateEvidence:
        del deterministic_hints
        experience = []
        if "Example Company" in extracted_text:
            experience.append(
                {
                    "company": "Example Company",
                    "title": "Software Engineer",
                    "bullets": ["Built Python services"],
                }
            )
        if additional_information and "Acme Corp" in additional_information:
            experience.append(
                {
                    "company": "Acme Corp",
                    "title": "Backend Engineer",
                    "bullets": ["Owned payment APIs"],
                }
            )
        return CandidateEvidence.model_validate(
            {
                "full_name": "Ricardo Guzman",
                "contact": {"email": "ricardo@example.com"},
                "skills": ["Python"],
                "experience": experience,
            }
        )


def test_provider_interpretation_supplies_structure_before_drafting(sample_jd):
    base_cv = (
        b"Ricardo Guzman\nricardo@example.com\n"
        b"Software Engineer, Example Company. Built Python services.\n"
    )
    result = run_generation(
        provider=_InterpretingFakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000003",
        workflow_version="cv-graph-v2",
    )

    assert result.canonical_cv is not None
    assert result.canonical_cv.experience[0].company == "Example Company"
    assert "Built Python services" in result.content.decode("utf-8")


def test_additional_information_can_supply_missing_history(sample_jd):
    """Free-form additions must be interpreted before evidence validation."""
    base_cv = (
        b"Ricardo Guzman\n"
        b"ricardo@example.com\n"
        b"Contact details for employment opportunities.\n"
    )
    additional = (
        "I worked at Acme Corp as a Backend Engineer. "
        "Owned payment APIs written in Python."
    )
    result = run_generation(
        provider=_InterpretingFakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=additional,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000004",
        workflow_version="cv-graph-v2",
    )

    assert result.canonical_cv is not None
    assert result.canonical_cv.experience[0].company == "Acme Corp"
    assert "Owned payment APIs" in result.content.decode("utf-8")


def test_section_structured_additional_information_passes_validation(sample_jd):
    base_cv = b"Ricardo Guzman\nricardo@example.com\n"
    additional = (
        "Experience\n"
        "Acme Corp — Software Engineer\n"
        "- Built APIs\n"
        "Education\n"
        "MIT, BS Computer Science\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=additional,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000005",
        workflow_version="cv-graph-v2",
    )

    assert result.canonical_cv is not None
    assert result.canonical_cv.experience[0].company == "Acme Corp"
    assert result.canonical_cv.education
    assert "MIT" in result.canonical_cv.education[0].institution


def test_validation_rejects_fabricated_skill():
    evidence = {
        "raw_text": "Jane Doe jane@example.com\nSkills: Python\n",
        "skills": ["Python"],
        "experience": [],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python", "Kubernetes"],
    )
    issues = validate_canonical_cv(
        cv,
        evidence,
        jd_analysis={"keywords": ["Kubernetes", "Python"]},
    )
    assert any("Kubernetes" in i for i in issues)


def test_validation_checks_metrics_and_sensitive_text_in_bullet_groups():
    evidence = {
        "raw_text": "Jane Doe jane@example.com worked at Acme.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[
            ExperienceItem(
                company="Acme",
                title="Engineer",
                bullets=[],
                bullet_groups=[
                    ExperienceBulletGroup(
                        heading="Delivery",
                        bullets=["Increased throughput by 40%", "Age: 29"],
                    )
                ],
            )
        ],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert any("metric not grounded" in i for i in issues)
    assert any("sensitive personal attributes" in i for i in issues)


def test_validation_covers_awards_values_and_theme_headings():
    evidence = {
        "raw_text": "Jane Doe jane@example.com worked at Acme mentoring juniors.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "awards": [{"title": "Acme Mentor Award", "date": "2023"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[
            ExperienceItem(
                company="Acme",
                title="Engineer",
                bullet_groups=[
                    ExperienceBulletGroup(
                        heading="Nationality: British",
                        bullets=["Mentored juniors"],
                    )
                ],
            )
        ],
        awards=[
            AwardItem(title="Invented Cloud Award"),
            AwardItem(title="Age: 42 volunteer"),
        ],
        values_alignment=[
            ValuesAlignmentItem(
                value="Integrity",
                behaviour="Increased retention by 25%",
            )
        ],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert any("award not in evidence" in i for i in issues)
    assert any("sensitive personal attributes" in i for i in issues)
    assert any("metric not grounded" in i for i in issues)
    assert any("values alignment behaviour not grounded" in i for i in issues)


def test_validation_accepts_grounded_awards_and_values_alignment():
    evidence = {
        "raw_text": (
            "Jane Doe jane@example.com worked at Acme. "
            "Received Acme Mentor Award in 2023. Mentored juniors weekly."
        ),
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "awards": [{"title": "Acme Mentor Award", "date": "2023"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
        awards=[AwardItem(title="Acme Mentor Award", date="2023")],
        values_alignment=[
            ValuesAlignmentItem(
                value="Mentorship",
                behaviour="Mentored juniors weekly",
            )
        ],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert not any("award not in evidence" in i for i in issues)
    assert not any("values alignment behaviour not grounded" in i for i in issues)
    assert not any("sensitive personal attributes" in i for i in issues)


def test_validation_flags_one_page_budget_overflow():
    evidence = {
        "raw_text": "Jane Doe jane@example.com " + " ".join(f"Company{i}" for i in range(6)),
        "skills": ["Python"],
        "experience": [{"company": f"Company{i}", "title": "Engineer"} for i in range(6)],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        professional_summary="x" * 500,
        experience=[
            ExperienceItem(
                company=f"Company{i}",
                title="Engineer",
                bullets=[f"Did substantial work item {j} with outcomes" for j in range(5)],
            )
            for i in range(6)
        ],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert any("one-page budget" in i for i in issues)


def test_fake_provider_preserves_experience_bullet_groups():
    provider = FakeProvider()
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Engineer",
                    "bullets": ["Shipped features"],
                    "bullet_groups": [
                        {
                            "heading": "Delivery",
                            "bullets": ["Owned release trains"],
                        }
                    ],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Acme Python",
        },
        jd_analysis={"keywords": ["Python"]},
        output_language="en",
    )
    assert len(cv.experience) == 1
    assert cv.experience[0].bullets == ["Shipped features"]
    assert len(cv.experience[0].bullet_groups) == 1
    assert cv.experience[0].bullet_groups[0].heading == "Delivery"
    assert cv.experience[0].bullet_groups[0].bullets == ["Owned release trains"]


def test_jd_analysis_targeting_only(sample_jd):
    state: GraphState = {
        "job_description": sample_jd,
        "additional_information": None,
    }
    out = node_analyze_jd(state)
    assert out["jd_analysis"]["note"] == "targeting_only"
    assert out["output_language"] == "en"
    assert "Python" in out["jd_analysis"]["keywords"] or "python" in [
        k.lower() for k in out["jd_analysis"]["keywords"]
    ]


def test_language_override_in_additional():
    state: GraphState = {
        "job_description": "Software Engineer. Requirements and experience needed.",
        "additional_information": "language: es",
    }
    out = node_analyze_jd(state)
    assert out["output_language"] == "es"
