"""Graph workflow tests with fake provider."""

from __future__ import annotations

import pytest

from cv_generation.graph.nodes import node_analyze_jd, node_merge_user_evidence, node_normalize_evidence
from cv_generation.graph.state import GraphState
from cv_generation.graph.validation import validate_canonical_cv
from cv_generation.graph.workflow import run_generation
from cv_generation.models.canonical_cv import CanonicalCV, ContactInfo
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
    assert "no experience, education, or projects" in exc.value.message


class _InterpretingFakeProvider(FakeProvider):
    def interpret_base_cv(
        self,
        *,
        extracted_text: str,
        deterministic_hints: dict,
    ) -> CandidateEvidence:
        del deterministic_hints
        return CandidateEvidence.model_validate(
            {
                "full_name": "Ricardo Guzman",
                "contact": {"email": "ricardo@example.com"},
                "skills": ["Python"],
                "experience": [
                    {
                        "company": "Example Company",
                        "title": "Software Engineer",
                        "bullets": ["Built Python services"],
                    }
                ],
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
