"""Graph workflow tests with fake provider."""

from __future__ import annotations

import re

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


def test_skills_jd_ordered_and_unrelated_evidence_skills_dropped(sample_cv_md, sample_jd):
    """Grounded Tailoring: evidence-only skills, JD matches first, unrelated dropped."""
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=sample_cv_md,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000010",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    skills = result.canonical_cv.skills
    # Sample evidence includes Linux/Git; JD does not ask for them.
    assert "Linux" not in skills
    assert "Git" not in skills
    assert "Kubernetes" not in skills
    # JD mentions Python/FastAPI before PostgreSQL/Docker — keep that priority.
    assert skills == ["Python", "FastAPI", "PostgreSQL", "Docker"]


def test_skills_expand_grounded_acronym_when_jd_names_full_term():
    """Full Term (ACRONYM) only when evidence supports the skill and naming is grounded."""
    base_cv = (
        b"# Jane Doe\n"
        b"jane@example.com\n\n"
        b"## Skills\n"
        b"CRM, Python, Baking\n\n"
        b"## Experience\n"
        b"### Engineer - Acme\n"
        b"- Built CRM workflows in Python\n\n"
        b"## Education\n"
        b"### BS, Example University\n"
    )
    jd = (
        "Software Engineer\n\n"
        "Requirements:\n"
        "- Customer Relationship Management (CRM)\n"
        "- Python experience\n"
        "- Kubernetes preferred\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000011",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    skills = result.canonical_cv.skills
    assert "Customer Relationship Management (CRM)" in skills
    assert "Baking" not in skills
    assert "Kubernetes" not in skills
    assert "Python" in skills


def _sentence_count(text: str) -> int:
    parts = [p.strip() for p in re.split(r"[.!?]+", text) if p.strip()]
    return len(parts)


def test_professional_summary_is_two_to_three_grounded_role_targeted_sentences(
    sample_cv_md, sample_jd
):
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=sample_cv_md,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000012",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    summary = (result.canonical_cv.professional_summary or "").strip()
    assert summary
    assert 2 <= _sentence_count(summary) <= 3
    # Role-targeted using JD title / evidenced skills — no invented keywords.
    assert "Software Engineer" in summary or "software engineer" in summary.lower()
    assert "Python" in summary
    assert "Kubernetes" not in summary
    # No fabricated metrics or ATS scores in the summary.
    assert not re.search(r"\b\d{1,3}\s?%", summary)
    assert not re.search(r"\bATS\s*(score|match)?\s*[:\-]?\s*\d+", summary, re.I)
    # Metrics must stay evidence-only across the whole Generated CV at this seam.
    blob = result.content.decode("utf-8")
    assert "40%" not in blob
    assert not re.search(r"\bATS\s*(score|match)?\s*[:\-]?\s*\d+", blob, re.I)


def test_jd_boilerplate_first_line_is_not_used_as_target_title():
    """JD intros like 'About the Job...' must not become targeting title."""
    jd = (
        "About the Job you are considering:\n\n"
        "Business Data Analyst is responsible for collecting data.\n\n"
        "Your Role:\n"
        "- Gather requirements\n"
    )
    analysis = node_analyze_jd(
        {"job_description": jd, "additional_information": None}
    )["jd_analysis"]
    assert analysis["target_title"] == "Business Data Analyst"


def test_jd_marketing_lines_are_not_used_as_target_title():
    jd = (
        "Join our team!\n"
        "Remote | Full-time\n\n"
        "Senior Software Engineer\n\n"
        "Requirements:\n"
        "- Python experience\n"
    )
    analysis = node_analyze_jd(
        {"job_description": jd, "additional_information": None}
    )["jd_analysis"]
    assert analysis["target_title"] == "Senior Software Engineer"


def test_experience_parser_skips_location_and_date_meta_lines():
    from cv_generation.graph.nodes import _extract_experience

    text = (
        "## Experience\n"
        "Software Engineer\n"
        "Analytical Engines\n"
        "London, UK\n"
        "Jan 2020 - Present\n"
        "- Built calculation engines in Python\n"
        "Research Assistant — Royal Society\n"
        "2020 - 2021\n"
        "- Documented experimental results\n"
    )
    roles = _extract_experience(text)
    assert len(roles) == 2
    assert roles[0]["company"] == "Analytical Engines"
    assert roles[0]["title"] == "Software Engineer"
    assert roles[0]["bullets"] == ["Built calculation engines in Python"]
    assert roles[1]["company"] == "Royal Society"
    assert roles[1]["title"] == "Research Assistant"
    assert "London" not in {r["company"] for r in roles}
    assert "Present" not in {r["company"] for r in roles}
    assert not any(r["title"] == "Role" and "London" in r["company"] for r in roles)


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


def test_validation_rejects_invented_full_term_around_evidenced_acronym():
    evidence = {
        "raw_text": "Jane Doe jane@example.com Skills: Python",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Invented Platform (Python)"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
    )
    issues = validate_canonical_cv(cv, evidence, jd_analysis={"keywords": ["Python"]})
    assert any("skill not in evidence" in i for i in issues)


def test_validation_accepts_jd_named_expansion_for_evidenced_acronym():
    evidence = {
        "raw_text": "Jane Doe jane@example.com Skills: CRM, Python",
        "skills": ["CRM", "Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Customer Relationship Management (CRM)", "Python"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
    )
    issues = validate_canonical_cv(
        cv,
        evidence,
        jd_analysis={
            "keywords": ["CRM", "Python"],
            "skill_expansions": [
                {"full": "Customer Relationship Management", "acronym": "CRM"}
            ],
        },
    )
    assert not any("skill not in evidence" in i for i in issues)


def test_validation_rejects_invented_metrics_in_summary():
    evidence = {
        "raw_text": "Jane Doe jane@example.com worked at Acme with Python.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        professional_summary="Engineer who increased throughput by 40%.",
        experience=[ExperienceItem(company="Acme", title="Engineer")],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert any("metric not grounded" in i for i in issues)


def test_validation_accepts_metrics_grounded_in_evidence_summary():
    evidence = {
        "raw_text": (
            "Jane Doe jane@example.com worked at Acme with Python. "
            "Increased throughput by 40%."
        ),
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        professional_summary="Engineer who increased throughput by 40%.",
        experience=[ExperienceItem(company="Acme", title="Engineer")],
    )
    issues = validate_canonical_cv(cv, evidence)
    assert not any("metric not grounded" in i for i in issues)


def test_fake_provider_does_not_invent_metrics_absent_from_evidence():
    provider = FakeProvider()
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "professional_summary": "Software engineer with Python experience.",
            "experience": [
                {
                    "company": "Acme",
                    "title": "Engineer",
                    "bullets": ["Built APIs"],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Acme Python Built APIs",
        },
        jd_analysis={
            "keywords": ["Python", "Engineer"],
            "target_title": "Software Engineer",
            "skill_expansions": [],
        },
        output_language="en",
    )
    blob = " ".join(
        [
            cv.professional_summary or "",
            *cv.skills,
            *(b for exp in cv.experience for b in exp.bullets),
        ]
    )
    assert not re.search(r"\b\d{1,3}\s?%", blob)
    assert "40%" not in blob
    issues = validate_canonical_cv(
        cv,
        {
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [{"company": "Acme", "title": "Engineer"}],
            "raw_text": "Jane Doe jane@example.com Acme Python Built APIs",
        },
        jd_analysis={"keywords": ["Python", "Engineer"]},
    )
    assert not any("metric not grounded" in i for i in issues)


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


def _experience_bullet_count(exp: ExperienceItem) -> int:
    return len(exp.bullets) + sum(len(group.bullets) for group in exp.bullet_groups)


def test_experience_title_aligns_to_jd_only_when_duties_match():
    """Align Experience title toward the posting when duties clearly match; else keep."""
    provider = FakeProvider()
    matching = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Backend Developer",
                    "bullets": [
                        "Built Python APIs for billing",
                        "Shipped FastAPI services to production",
                        "Improved PostgreSQL query latency",
                    ],
                }
            ],
            "raw_text": (
                "Jane Doe jane@example.com Acme Backend Developer "
                "Built Python APIs FastAPI PostgreSQL"
            ),
        },
        jd_analysis={
            "keywords": ["Python", "FastAPI", "PostgreSQL"],
            "target_title": "Software Engineer",
        },
        output_language="en",
    )
    assert matching.experience[0].title == "Software Engineer"
    assert matching.experience[0].company == "Acme"
    # No professional headline under the name — title lives on the experience line only.
    assert matching.full_name == "Jane Doe"
    assert matching.professional_summary
    assert not matching.professional_summary.startswith("Software Engineer\n")

    mismatched = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Baking", "Python"],
            "experience": [
                {
                    "company": "Bakery",
                    "title": "Baker",
                    "bullets": [
                        "Baked sourdough daily",
                        "Managed oven schedules",
                    ],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Bakery Baker sourdough oven Python",
        },
        jd_analysis={
            "keywords": ["Python", "FastAPI"],
            "target_title": "Software Engineer",
        },
        output_language="en",
    )
    assert mismatched.experience[0].title == "Baker"
    assert mismatched.experience[0].company == "Bakery"


def test_run_generation_experience_title_alignment_and_no_name_headline(
    sample_cv_md, sample_jd
):
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=sample_cv_md,
        filename="cv.md",
        content_type="text/markdown",
        job_description=sample_jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000048",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    titles = [e.title for e in result.canonical_cv.experience]
    assert "Software Engineer" in titles
    text = result.content.decode("utf-8")
    # Name then contact — no detached professional headline under the name.
    name_idx = text.index("Ada Lovelace")
    summary_idx = text.index("PROFESSIONAL SUMMARY")
    between = text[name_idx:summary_idx]
    assert "Software Engineer" not in between.split("\n")[1:3]


def test_run_generation_densifies_jd_relevant_experience_depth():
    """Most JD-relevant roles prefer ~3–4 bullets; low-signal roles are thinner."""
    base_cv = (
        "# Jane Doe\n"
        "jane@example.com\n\n"
        "## Skills\n"
        "Python, FastAPI, Baking\n\n"
        "## Experience\n"
        "### Software Engineer — Analytical Engines\n"
        "- Built Python services for billing\n"
        "- Designed FastAPI endpoints\n"
        "- Tuned PostgreSQL queries\n"
        "- Wrote Docker compose stacks\n"
        "- Mentored juniors on code review\n"
        "- Presented architecture talks\n\n"
        "### Baker — Neighborhood Bakery\n"
        "- Baked bread daily\n"
        "- Opened the shop\n"
        "- Cleaned ovens\n"
        "- Ordered flour\n\n"
        "## Education\n"
        "### BS, Example University\n"
    ).encode("utf-8")
    jd = (
        "Software Engineer\n\n"
        "Requirements:\n"
        "- Python and FastAPI\n"
        "- PostgreSQL and Docker\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-00000000004a",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    by_company = {e.company: e for e in result.canonical_cv.experience}
    assert "Analytical Engines" in by_company
    relevant = _experience_bullet_count(by_company["Analytical Engines"])
    assert 3 <= relevant <= 4
    if "Neighborhood Bakery" in by_company:
        assert _experience_bullet_count(by_company["Neighborhood Bakery"]) < relevant
    text = result.content.decode("utf-8")
    assert "Analytical Engines" in text
    assert "Kubernetes" not in text


def test_experience_theme_groups_when_jd_themes_and_evidence_support():
    provider = FakeProvider()
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Software Engineer",
                    "bullets": [
                        "Built REST APIs in Python",
                        "Collaborated with product on roadmap",
                        "Tuned PostgreSQL indexes",
                    ],
                }
            ],
            "raw_text": (
                "Jane Doe jane@example.com Acme Software Engineer "
                "Built REST APIs Collaborated PostgreSQL"
            ),
        },
        jd_analysis={
            "keywords": ["Python", "API", "PostgreSQL"],
            "target_title": "Software Engineer",
            "responsibility_themes": ["API Development", "Collaboration"],
        },
        output_language="en",
    )
    assert len(cv.experience) == 1
    groups = cv.experience[0].bullet_groups
    headings = [g.heading for g in groups]
    assert headings == ["API Development", "Collaboration"]
    assert any("REST APIs" in b for g in groups for b in g.bullets)
    assert any("Collaborated" in b for g in groups for b in g.bullets)
    # Theme-supported bullets leave the flat list (or only unmatched leftovers).
    assert not any("REST APIs" in b for b in cv.experience[0].bullets)
    assert not any("Collaborated" in b for b in cv.experience[0].bullets)


def test_experience_flat_bullets_when_themes_absent_or_unsupported():
    provider = FakeProvider()
    no_themes = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Engineer",
                    "bullets": ["Built APIs", "Owned releases"],
                    "bullet_groups": [
                        {"heading": "Delivery", "bullets": ["Shipped trains"]}
                    ],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Acme Python Built APIs Owned releases",
        },
        jd_analysis={"keywords": ["Python"], "responsibility_themes": []},
        output_language="en",
    )
    assert no_themes.experience[0].bullet_groups == []
    flat = no_themes.experience[0].bullets
    assert "Built APIs" in flat
    assert "Owned releases" in flat
    assert "Shipped trains" in flat

    unsupported = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Engineer",
                    "bullets": ["Built APIs", "Owned releases"],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Acme Python Built APIs Owned releases",
        },
        jd_analysis={
            "keywords": ["Python"],
            "responsibility_themes": ["People Leadership", "Sales Strategy"],
        },
        output_language="en",
    )
    assert unsupported.experience[0].bullet_groups == []
    assert unsupported.experience[0].bullets == ["Built APIs", "Owned releases"]


def test_run_generation_theme_groups_from_jd_responsibility_themes():
    base_cv = (
        "# Jane Doe\n"
        "jane@example.com\n\n"
        "## Skills\n"
        "Python, FastAPI\n\n"
        "## Experience\n"
        "### Software Engineer — Acme\n"
        "- Built REST APIs in Python\n"
        "- Collaborated with designers on UX\n"
        "- Tuned database queries\n\n"
        "## Education\n"
        "### BS, Example University\n"
    ).encode("utf-8")
    jd = (
        "Software Engineer\n\n"
        "Responsibilities:\n"
        "API Development\n"
        "- Design and build service APIs\n"
        "Collaboration\n"
        "- Partner with cross-functional teams\n\n"
        "Requirements:\n"
        "- Python and FastAPI experience\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000049",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    assert result.canonical_cv.experience
    groups = result.canonical_cv.experience[0].bullet_groups
    assert [g.heading for g in groups] == ["API Development", "Collaboration"]
    text = result.content.decode("utf-8")
    assert "API Development" in text
    assert "Collaboration" in text
    assert "Built REST APIs" in text


def test_jd_relevant_roles_prefer_three_to_four_bullets_low_signal_thinned():
    provider = FakeProvider()
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Analytical Engines",
                    "title": "Software Engineer",
                    "bullets": [
                        "Built Python services",
                        "Designed FastAPI endpoints",
                        "Tuned PostgreSQL queries",
                        "Wrote Docker compose stacks",
                        "Mentored juniors on code review",
                        "Presented architecture talks",
                    ],
                },
                {
                    "company": "Bakery",
                    "title": "Baker",
                    "bullets": [
                        "Baked bread daily",
                        "Opened the shop",
                        "Cleaned ovens",
                        "Ordered flour",
                        "Scheduled shifts",
                        "Balanced register",
                    ],
                },
            ],
            "raw_text": (
                "Jane Doe jane@example.com Analytical Engines Software Engineer "
                "Python FastAPI PostgreSQL Docker Bakery Baker bread"
            ),
        },
        jd_analysis={
            "keywords": ["Python", "FastAPI", "PostgreSQL", "Docker"],
            "target_title": "Software Engineer",
        },
        output_language="en",
    )
    by_company = {e.company: e for e in cv.experience}
    assert "Analytical Engines" in by_company
    relevant_count = _experience_bullet_count(by_company["Analytical Engines"])
    assert 3 <= relevant_count <= 4
    if "Bakery" in by_company:
        assert _experience_bullet_count(by_company["Bakery"]) < relevant_count
    # Never invent employers or duties.
    assert all(e.company in {"Analytical Engines", "Bakery"} for e in cv.experience)
    blob = " ".join(
        b for e in cv.experience for b in e.bullets
    ) + " ".join(b for e in cv.experience for g in e.bullet_groups for b in g.bullets)
    assert "Kubernetes" not in blob
    assert "Invented" not in blob


def test_fake_provider_densify_respects_per_role_bullet_cap_with_groups():
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
                    "bullets": [f"Delivery outcome {i}" for i in range(4)]
                    + [f"Platform outcome {i}" for i in range(4)],
                }
            ],
            "raw_text": "Jane Doe jane@example.com Acme Python "
            + " ".join(f"Delivery outcome {i}" for i in range(4))
            + " "
            + " ".join(f"Platform outcome {i}" for i in range(4)),
        },
        jd_analysis={
            "keywords": ["Python"],
            "responsibility_themes": ["Delivery", "Platform"],
        },
        output_language="en",
    )
    assert len(cv.experience) == 1
    assert _experience_bullet_count(cv.experience[0]) <= 4
    assert cv.experience[0].bullet_groups
    issues = validate_canonical_cv(
        cv,
        {
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "raw_text": "Jane Doe jane@example.com Acme Python "
            + " ".join(f"Delivery outcome {i}" for i in range(4))
            + " "
            + " ".join(f"Platform outcome {i}" for i in range(4)),
            "experience": [{"company": "Acme", "title": "Engineer"}],
        },
    )
    assert not any("bullets per role" in i for i in issues)


def test_fake_provider_densify_keeps_later_roles_within_role_cap():
    provider = FakeProvider()
    experience = [
        {
            "company": f"Company{i}",
            "title": "Engineer",
            "bullets": [f"Company{i} bullet {j}" for j in range(4)],
        }
        for i in range(4)
    ]
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": experience,
            "raw_text": "Jane Doe jane@example.com Python "
            + " ".join(f"Company{i}" for i in range(4)),
        },
        jd_analysis={"keywords": ["Python"]},
        output_language="en",
    )
    assert [e.company for e in cv.experience] == [f"Company{i}" for i in range(4)]
    assert sum(_experience_bullet_count(e) for e in cv.experience) <= 12
    assert all(_experience_bullet_count(e) <= 4 for e in cv.experience)


def test_fake_provider_densify_prefers_jd_relevant_roles_when_dropping():
    provider = FakeProvider()
    cv = provider.draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python", "Baking"],
            "experience": [
                {
                    "company": "Bakery",
                    "title": "Baker",
                    "bullets": ["Baked sourdough daily"],
                },
                {
                    "company": "Cafe",
                    "title": "Barista",
                    "bullets": ["Made coffee"],
                },
                {
                    "company": "Retail",
                    "title": "Clerk",
                    "bullets": ["Stocked shelves"],
                },
                {
                    "company": "Park",
                    "title": "Guide",
                    "bullets": ["Led tours"],
                },
                {
                    "company": "Analytical Engines",
                    "title": "Software Engineer",
                    "bullets": ["Built Python APIs"],
                },
            ],
            "raw_text": (
                "Jane Doe jane@example.com Bakery Cafe Retail Park "
                "Analytical Engines Software Engineer Python Baking"
            ),
        },
        jd_analysis={
            "keywords": ["Python", "Software"],
            "target_title": "Software Engineer",
        },
        output_language="en",
    )
    companies = [e.company for e in cv.experience]
    assert "Analytical Engines" in companies
    assert len(companies) == 4
    # Lowest-signal early roles should be the ones dropped first among ties.
    assert sum(
        companies.count(name) for name in ("Bakery", "Cafe", "Retail", "Park")
    ) == 3


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
    assert out["jd_analysis"]["skill_phrases"] == out["jd_analysis"]["keywords"]
    # Flat requirements JD has no clear responsibility theme headers.
    assert out["jd_analysis"]["responsibility_themes"] == []
    assert out["jd_analysis"]["value_statements"] == []


def test_jd_analysis_extracts_responsibility_themes():
    state: GraphState = {
        "job_description": (
            "Software Engineer\n\n"
            "Responsibilities:\n"
            "API Development\n"
            "- Design service APIs\n"
            "Collaboration\n"
            "- Partner with product\n\n"
            "Requirements:\n"
            "- Python experience\n"
        ),
        "additional_information": None,
    }
    out = node_analyze_jd(state)
    assert out["jd_analysis"]["note"] == "targeting_only"
    assert out["jd_analysis"]["responsibility_themes"] == [
        "API Development",
        "Collaboration",
    ]


def test_jd_analysis_ignores_marketing_section_headers_as_themes():
    """Real JDs often use 'Your Role' then later 'Your Skills' / employer blurbs."""
    state: GraphState = {
        "job_description": (
            "About the Job you are considering:\n\n"
            "Business Data Analyst is responsible for collecting data.\n\n"
            "Hybrid working:\n\n"
            "Blend of offices and home.\n\n"
            "Your Role:\n\n"
            "    Gather requirements through workshops.\n"
            "    Data Lineage Management.\n"
            "    Document end-to-end lineage from source systems.\n\n"
            "Your Skills:\n\n"
            "    Support Data Governance frameworks.\n"
            "    Data Quality Controls.\n\n"
            "We are a Disability Confident Employer:\n\n"
            "Capgemini is proud to be a Disability Confident Employer.\n\n"
            "Why you should consider Capgemini:\n\n"
            "Join a thriving company.\n\n"
            "About Capgemini:\n\n"
            "Global business and technology transformation partner.\n"
        ),
        "additional_information": None,
    }
    out = node_analyze_jd(state)
    themes = out["jd_analysis"]["responsibility_themes"]
    joined = " | ".join(themes).lower()
    assert "your skills" not in joined
    assert "disability" not in joined
    assert "capgemini" not in joined
    assert "why you" not in joined
    assert "about " not in joined
    assert out["jd_analysis"]["target_title"] == "Business Data Analyst"


def test_language_override_in_additional():
    state: GraphState = {
        "job_description": "Software Engineer. Requirements and experience needed.",
        "additional_information": "language: es",
    }
    out = node_analyze_jd(state)
    assert out["output_language"] == "es"


def test_jd_analysis_exposes_targeting_aids_including_value_statements():
    """JD targeting aids feed Grounded Tailoring; never candidate facts."""
    state: GraphState = {
        "job_description": (
            "Software Engineer\n\n"
            "Responsibilities:\n"
            "API Development\n"
            "- Design service APIs\n\n"
            "Requirements:\n"
            "- Python and FastAPI experience\n"
            "- Customer Relationship Management (CRM)\n\n"
            "Our Values:\n"
            "- Integrity\n"
            "- Collaboration\n"
            "- Ownership\n"
        ),
        "additional_information": None,
    }
    out = node_analyze_jd(state)
    analysis = out["jd_analysis"]
    assert analysis["note"] == "targeting_only"
    assert analysis["source"] == "job_description"
    assert analysis["target_title"] == "Software Engineer"
    assert analysis["responsibility_themes"] == ["API Development"]
    assert analysis["value_statements"] == ["Integrity", "Collaboration", "Ownership"]
    # Skill phrases stay targeting aids (keywords / expansions), not evidence.
    skill_phrases = [s.lower() for s in analysis["skill_phrases"]]
    assert "python" in skill_phrases
    assert "fastapi" in skill_phrases
    assert {"full": "Customer Relationship Management", "acronym": "CRM"} in analysis[
        "skill_expansions"
    ]


def test_jd_analysis_omits_value_statements_when_jd_has_none(sample_jd):
    out = node_analyze_jd(
        {"job_description": sample_jd, "additional_information": None}
    )
    assert out["jd_analysis"]["value_statements"] == []
    assert out["jd_analysis"]["note"] == "targeting_only"


def test_run_generation_includes_values_alignment_when_jd_and_evidence_support():
    base_cv = (
        "# Jane Doe\n"
        "jane@example.com\n\n"
        "## Skills\n"
        "Python, Mentoring\n\n"
        "## Experience\n"
        "### Software Engineer — Acme\n"
        "- Collaborated with product on roadmap planning\n"
        "- Mentored juniors through weekly code reviews\n"
        "- Owned release quality for the payments service\n\n"
        "## Education\n"
        "### BS, Example University\n\n"
        "## Languages\n"
        "English, Spanish\n"
    ).encode("utf-8")
    jd = (
        "Software Engineer\n\n"
        "Requirements:\n"
        "- Python experience\n\n"
        "Our Values:\n"
        "- Collaboration\n"
        "- Mentorship\n"
        "- Ownership\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000060",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    items = result.canonical_cv.values_alignment
    assert items
    by_value = {item.value: item.behaviour for item in items}
    assert "Collaboration" in by_value
    assert "collaborated" in by_value["Collaboration"].lower()
    assert "Mentorship" in by_value
    assert "mentored" in by_value["Mentorship"].lower()
    assert "Ownership" in by_value
    assert "owned" in by_value["Ownership"].lower()
    # Targeting aids must not fabricate skills from value labels.
    skills_lower = [s.lower() for s in result.canonical_cv.skills]
    assert "collaboration" not in skills_lower
    assert "ownership" not in skills_lower
    assert "integrity" not in skills_lower
    text = result.content.decode("utf-8")
    assert "## VALUES ALIGNMENT" in text
    # Locked trailing position: after core Skills (Languages omitted when unsupported).
    assert text.index("## SKILLS") < text.index("## VALUES ALIGNMENT")
    assert "Collaboration" in text
    assert "Mentorship" in text
    assert "Ownership" in text


def test_run_generation_omits_values_alignment_when_jd_has_no_values(sample_cv_md):
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=sample_cv_md,
        filename="cv.md",
        content_type="text/markdown",
        job_description=(
            "Software Engineer\n\n"
            "Requirements:\n"
            "- Experience with Python and FastAPI\n"
        ),
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000061",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    assert result.canonical_cv.values_alignment == []
    assert "VALUES ALIGNMENT" not in result.content.decode("utf-8")


def test_run_generation_omits_values_alignment_when_evidence_lacks_behaviours():
    base_cv = (
        "# Jane Doe\n"
        "jane@example.com\n\n"
        "## Skills\n"
        "Python\n\n"
        "## Experience\n"
        "### Software Engineer — Acme\n"
        "- Built calculation engines in Python\n"
        "- Tuned PostgreSQL queries\n\n"
        "## Education\n"
        "### BS, Example University\n"
    ).encode("utf-8")
    jd = (
        "Software Engineer\n\n"
        "Requirements:\n"
        "- Python experience\n\n"
        "Our Values:\n"
        "- Integrity\n"
        "- Empathy\n"
    )
    result = run_generation(
        provider=FakeProvider(),
        base_cv_bytes=base_cv,
        filename="cv.md",
        content_type="text/markdown",
        job_description=jd,
        additional_information=None,
        output_format=OutputFormat.MARKDOWN,
        correlation_id="00000000-0000-0000-0000-000000000062",
        workflow_version="cv-graph-v2",
    )
    assert result.canonical_cv is not None
    assert result.canonical_cv.values_alignment == []
    assert "VALUES ALIGNMENT" not in result.content.decode("utf-8")
    # Value labels remain targeting-only — never injected as skills.
    assert "Integrity" not in result.canonical_cv.skills
    assert "Empathy" not in result.canonical_cv.skills


def test_validation_rejects_values_alignment_without_jd_value_statements():
    evidence = {
        "raw_text": "Jane Doe jane@example.com Mentored juniors weekly at Acme.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
        values_alignment=[
            ValuesAlignmentItem(
                value="Mentorship",
                behaviour="Mentored juniors weekly",
            )
        ],
    )
    issues = validate_canonical_cv(
        cv,
        evidence,
        jd_analysis={"keywords": ["Python"], "value_statements": []},
    )
    assert any("values alignment requires JD value statements" in i for i in issues)


def test_validation_rejects_values_alignment_value_not_in_jd():
    evidence = {
        "raw_text": "Jane Doe jane@example.com Mentored juniors weekly at Acme.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
        values_alignment=[
            ValuesAlignmentItem(
                value="Invented Virtue",
                behaviour="Mentored juniors weekly",
            )
        ],
    )
    issues = validate_canonical_cv(
        cv,
        evidence,
        jd_analysis={
            "keywords": ["Python"],
            "value_statements": ["Collaboration", "Mentorship"],
        },
    )
    assert any("values alignment value not in JD" in i for i in issues)


def test_validation_rejects_values_alignment_when_jd_analysis_omits_value_key():
    """Deterministic JD gate applies whenever jd_analysis is supplied."""
    evidence = {
        "raw_text": "Jane Doe jane@example.com Mentored juniors weekly at Acme.",
        "skills": ["Python"],
        "experience": [{"company": "Acme", "title": "Engineer"}],
        "full_name": "Jane Doe",
        "contact": {"email": "jane@example.com"},
    }
    cv = CanonicalCV(
        full_name="Jane Doe",
        contact=ContactInfo(email="jane@example.com"),
        skills=["Python"],
        experience=[ExperienceItem(company="Acme", title="Engineer")],
        values_alignment=[
            ValuesAlignmentItem(
                value="Mentorship",
                behaviour="Mentored juniors weekly",
            )
        ],
    )
    issues = validate_canonical_cv(
        cv,
        evidence,
        jd_analysis={"keywords": ["Python"]},
    )
    assert any("values alignment requires JD value statements" in i for i in issues)


def test_fake_provider_values_alignment_after_languages_in_markdown():
    """Trailing ATS order: Languages then Values Alignment when both present."""
    from cv_generation.render.markdown import render_markdown

    cv = FakeProvider().draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "spoken_languages": ["English", "Spanish"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Software Engineer",
                    "bullets": [
                        "Collaborated with product on roadmap planning",
                        "Built Python services",
                    ],
                }
            ],
            "education": [{"institution": "Example University", "degree": "BS"}],
            "raw_text": (
                "Jane Doe jane@example.com Collaborated with product on roadmap planning"
            ),
        },
        jd_analysis={
            "keywords": ["Python"],
            "value_statements": ["Collaboration"],
            "note": "targeting_only",
        },
        output_language="en",
    )
    assert cv.languages == ["English", "Spanish"]
    assert cv.values_alignment
    text = render_markdown(cv).decode("utf-8")
    assert "## LANGUAGES" in text
    assert "## VALUES ALIGNMENT" in text
    assert text.index("## LANGUAGES") < text.index("## VALUES ALIGNMENT")


def test_fake_provider_rejects_loose_value_behaviour_stem_noise():
    """Integrity must not match unrelated 'interest' bullets."""
    cv = FakeProvider().draft(
        evidence={
            "full_name": "Jane Doe",
            "contact": {"email": "jane@example.com"},
            "skills": ["Python"],
            "experience": [
                {
                    "company": "Acme",
                    "title": "Engineer",
                    "bullets": ["Expressed interest in databases"],
                }
            ],
            "education": [{"institution": "Example University"}],
            "raw_text": "Jane Doe Expressed interest in databases",
        },
        jd_analysis={
            "keywords": ["Python"],
            "value_statements": ["Integrity"],
            "note": "targeting_only",
        },
        output_language="en",
    )
    assert cv.values_alignment == []
