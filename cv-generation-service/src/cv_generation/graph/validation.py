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

_SENSITIVE_RE = re.compile(
    r"\b(?:age|birth\s*date|date\s*of\s*birth|dob|marital\s*status|nationality|"
    r"religion|gender|sexual\s*orientation|ssn|social\s*security)\b\s*[:\-]?\s*\S+",
    re.IGNORECASE,
)


def _phrase_in_corpus(phrase: str, corpus: str) -> bool:
    """Require whole-phrase match, not an accidental substring of another token."""
    normalized = phrase.strip().lower()
    if not normalized:
        return False
    pattern = re.compile(rf"(?<![a-z0-9]){re.escape(normalized)}(?![a-z0-9])", re.IGNORECASE)
    return bool(pattern.search(corpus))


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
    evidence_name = str(evidence.get("full_name") or "").strip().lower()

    if not cv.full_name or not cv.full_name.strip():
        issues.append("full_name is required")
    elif evidence_name and cv.full_name.strip().lower() != evidence_name:
        if not _phrase_in_corpus(cv.full_name, corpus):
            issues.append("full_name not grounded in evidence")
    elif not evidence_name and not _phrase_in_corpus(cv.full_name, corpus):
        issues.append("full_name not grounded in evidence")

    if not cv.has_contact_channel():
        issues.append("at least one of email or phone is required")
    else:
        contact = evidence.get("contact") or {}
        email = (cv.contact.email or "").strip().lower()
        phone = (cv.contact.phone or "").strip()
        if email and email not in corpus and email != str(contact.get("email") or "").lower():
            issues.append("email not grounded in evidence")
        if phone:
            phone_digits = re.sub(r"\D", "", phone)
            corpus_digits = re.sub(r"\D", "", corpus)
            evidence_phone_digits = re.sub(r"\D", "", str(contact.get("phone") or ""))
            if phone_digits and phone_digits not in corpus_digits and phone_digits != evidence_phone_digits:
                issues.append("phone not grounded in evidence")

    # Skills must be grounded in structured evidence or as whole phrases in corpus
    for skill in cv.skills:
        if skill.lower() not in evidence_skills and not _phrase_in_corpus(skill, corpus):
            issues.append(f"skill not in evidence: {skill}")

    # Employers must appear in evidence
    companies = {
        str(e.get("company") or "").lower()
        for e in (evidence.get("experience") or [])
        if isinstance(e, dict)
    }
    for exp in cv.experience:
        if exp.company.lower() not in companies and not _phrase_in_corpus(exp.company, corpus):
            issues.append(f"employer not in evidence: {exp.company}")

    # Reject numeric ATS scores if somehow present in summary
    if cv.professional_summary and re.search(
        r"\bATS\s*(score|match)?\s*[:\-]?\s*\d+", cv.professional_summary, re.I
    ):
        issues.append("numeric ATS scores are forbidden")

    for field in (cv.professional_summary or "", *[b for exp in cv.experience for b in exp.bullets]):
        if _SENSITIVE_RE.search(field):
            issues.append("sensitive personal attributes must be omitted")
            break

    # Fabricated metrics: numbers in bullets that aren't in corpus
    for exp in cv.experience:
        for bullet in exp.bullets:
            if _METRIC_RE.search(bullet):
                nums = re.findall(r"\d+(?:\.\d+)?%?", bullet)
                if nums and not any(n in corpus for n in nums):
                    issues.append(f"metric not grounded in evidence: {bullet[:80]}")

    # JD skills must not be injected if absent from evidence
    if jd_analysis:
        jd_skills = {s.lower() for s in (jd_analysis.get("keywords") or [])}
        for skill in cv.skills:
            if (
                skill.lower() in jd_skills
                and skill.lower() not in evidence_skills
                and not _phrase_in_corpus(skill, corpus)
            ):
                issues.append(f"JD skill fabricated into CV: {skill}")

    # Supported professional links present in evidence should survive
    contact = evidence.get("contact") or {}
    for key, value in (
        ("linkedin", cv.contact.linkedin),
        ("github", cv.contact.github),
        ("portfolio", cv.contact.portfolio),
    ):
        evidence_link = str(contact.get(key) or "").strip()
        if evidence_link and not value:
            issues.append(f"{key} link missing from output")

    if not cv.output_language:
        issues.append("output_language is required")

    return issues
