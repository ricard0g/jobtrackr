"""Deterministic + semantic validation of CanonicalCV against evidence."""

from __future__ import annotations

import re
from typing import Any

from cv_generation.models.canonical_cv import CanonicalCV

# Phrases that look like fabricated metrics when not in evidence
_METRIC_RE = re.compile(
    r"\b\d{1,3}\s?%|\b(?:increased|decreased|reduced|grew|saved)\b.{0,40}\b\d+",
    re.IGNORECASE,
)


def validate_canonical_cv(
    cv: CanonicalCV,
    evidence: dict[str, Any],
    *,
    jd_analysis: dict[str, Any] | None = None,
) -> list[str]:
    """Return list of validation issue strings (empty = pass)."""
    issues: list[str] = []
    corpus = str(evidence.get("raw_text") or "").lower()
    evidence_skills = {s.lower() for s in (evidence.get("skills") or [])}

    if not cv.full_name or not cv.full_name.strip():
        issues.append("full_name is required")
    if not cv.has_contact_channel():
        issues.append("at least one of email or phone is required")

    # Skills must be grounded in evidence
    for skill in cv.skills:
        if skill.lower() not in evidence_skills and skill.lower() not in corpus:
            issues.append(f"skill not in evidence: {skill}")

    # Employers must appear in evidence
    for exp in cv.experience:
        if exp.company.lower() not in corpus and exp.company not in (
            e.get("company") for e in (evidence.get("experience") or []) if isinstance(e, dict)
        ):
            # Allow if exact match in structured evidence
            companies = {
                str(e.get("company") or "").lower()
                for e in (evidence.get("experience") or [])
                if isinstance(e, dict)
            }
            if exp.company.lower() not in companies:
                issues.append(f"employer not in evidence: {exp.company}")

    # Reject numeric ATS scores if somehow present in summary
    if cv.professional_summary and re.search(r"\bATS\s*(score|match)?\s*[:\-]?\s*\d+", cv.professional_summary, re.I):
        issues.append("numeric ATS scores are forbidden")

    # Fabricated metrics: numbers in bullets that aren't in corpus
    for exp in cv.experience:
        for bullet in exp.bullets:
            if _METRIC_RE.search(bullet):
                # Allow if the numeric fragment appears in evidence
                nums = re.findall(r"\d+(?:\.\d+)?%?", bullet)
                if nums and not any(n in corpus for n in nums):
                    issues.append(f"metric not grounded in evidence: {bullet[:80]}")

    # JD skills must not be injected if absent from evidence
    if jd_analysis:
        jd_skills = {s.lower() for s in (jd_analysis.get("keywords") or [])}
        for skill in cv.skills:
            if skill.lower() in jd_skills and skill.lower() not in evidence_skills and skill.lower() not in corpus:
                issues.append(f"JD skill fabricated into CV: {skill}")

    if not cv.output_language:
        issues.append("output_language is required")

    return issues
