"""Deterministic fake provider for CI — no Gemini calls."""

from __future__ import annotations

import re
from typing import Any

from cv_generation.models.canonical_cv import (
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
)
from cv_generation.models.candidate_evidence import CandidateEvidence
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.providers.base import DraftingProvider


class FakeProvider(DraftingProvider):
    """Synthesize a CanonicalCV from extracted evidence only (never invents JD skills)."""

    def __init__(self, model_id: str = "fake-cv-v1") -> None:
        self._model_id = model_id

    @property
    def model_id(self) -> str:
        return self._model_id

    def interpret_base_cv(
        self,
        *,
        extracted_text: str,
        deterministic_hints: dict[str, Any],
    ) -> CandidateEvidence:
        """Use deterministic hints in tests; no model calls are made."""
        del extracted_text
        return CandidateEvidence.model_validate(deterministic_hints)

    def draft(
        self,
        *,
        evidence: dict[str, Any],
        jd_analysis: dict[str, Any],
        output_language: str,
    ) -> CanonicalCV:
        return self._build(evidence, jd_analysis, output_language)

    def revise(
        self,
        *,
        current: CanonicalCV,
        evidence: dict[str, Any],
        jd_analysis: dict[str, Any],
        validation_issues: list[str],
        output_language: str,
    ) -> CanonicalCV:
        # Re-derive from evidence; drop skills that aren't in evidence
        rebuilt = self._build(evidence, jd_analysis, output_language)
        # Preserve name/contact if current somehow better filled
        if not rebuilt.full_name and current.full_name:
            rebuilt.full_name = current.full_name
        return rebuilt

    def _build(
        self,
        evidence: dict[str, Any],
        jd_analysis: dict[str, Any],
        output_language: str,
    ) -> CanonicalCV:
        name = str(evidence.get("full_name") or "").strip()
        if not name:
            raise ServiceError(
                ErrorCode.GENERATION_VALIDATION_FAILED,
                "Candidate name is required",
            )
        contact_raw = evidence.get("contact") or {}
        if not (contact_raw.get("email") or contact_raw.get("phone")):
            raise ServiceError(
                ErrorCode.GENERATION_VALIDATION_FAILED,
                "At least one of email or phone is required",
            )
        contact = ContactInfo(
            email=contact_raw.get("email"),
            phone=contact_raw.get("phone"),
            linkedin=contact_raw.get("linkedin"),
            github=contact_raw.get("github"),
            portfolio=contact_raw.get("portfolio"),
            location=contact_raw.get("location"),
        )

        evidence_skills: list[str] = list(evidence.get("skills") or [])
        # Targeting: order skills by JD keyword overlap, never add new skills
        keywords = {k.lower() for k in (jd_analysis.get("keywords") or [])}
        ordered = sorted(
            evidence_skills,
            key=lambda s: (0 if s.lower() in keywords else 1, s.lower()),
        )

        experience = [
            ExperienceItem(
                company=str(item.get("company") or "").strip(),
                title=str(item.get("title") or "").strip() or "Role",
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                location=item.get("location"),
                bullets=list(item.get("bullets") or []),
            )
            for item in (evidence.get("experience") or [])
            if isinstance(item, dict) and str(item.get("company") or "").strip()
        ]

        education = [
            EducationItem(
                institution=str(item.get("institution") or "").strip(),
                degree=item.get("degree"),
                field=item.get("field"),
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                details=list(item.get("details") or []),
            )
            for item in (evidence.get("education") or [])
            if isinstance(item, dict) and str(item.get("institution") or "").strip()
        ]

        corpus = str(evidence.get("raw_text") or "").lower()
        skill_set = {s.lower() for s in evidence_skills}
        projects = []
        for item in evidence.get("projects") or []:
            if not isinstance(item, dict):
                continue
            techs = [
                t
                for t in (item.get("technologies") or [])
                if isinstance(t, str) and (t.lower() in skill_set or t.lower() in corpus)
            ]
            projects.append(
                ProjectItem(
                    name=str(item.get("name") or "Project"),
                    description=item.get("description"),
                    technologies=techs,
                    url=item.get("url"),
                    bullets=list(item.get("bullets") or []),
                )
            )

        summary = evidence.get("professional_summary")
        if not summary and experience:
            titles = ", ".join(e.title for e in experience[:2])
            summary = f"Professional with experience as {titles}."

        # Optionally emphasize JD title in summary without inventing facts
        target_title = jd_analysis.get("target_title")
        if summary and target_title and str(target_title).lower() not in summary.lower():
            # Only mention targeting if related skills exist
            if any(s.lower() in keywords for s in ordered[:5]):
                summary = f"{summary} Targeting roles related to {target_title}."

        return CanonicalCV(
            full_name=name,
            contact=contact,
            professional_summary=summary,
            skills=ordered,
            experience=experience,
            education=education,
            projects=projects,
            certifications=list(evidence.get("certifications") or []),
            languages=list(evidence.get("spoken_languages") or []),
            output_language=output_language,
        )


def extract_name_heuristic(text: str) -> str | None:
    """First non-empty line that doesn't look like email/url/section header."""
    section_headers = {
        "experience",
        "education",
        "skills",
        "summary",
        "projects",
        "contact",
        "work experience",
        "professional summary",
    }
    for line in text.splitlines():
        candidate = line.strip().lstrip("#").strip()
        if not candidate or len(candidate) > 80:
            continue
        lower = candidate.lower()
        if lower in section_headers:
            continue
        if "@" in candidate or candidate.lower().startswith("http"):
            continue
        if re.fullmatch(r"[\d\s+().-]+", candidate):
            continue
        # Prefer 2–4 word human names
        words = candidate.split()
        if 1 <= len(words) <= 5 and all(w[:1].isalpha() for w in words):
            return candidate
    return None
