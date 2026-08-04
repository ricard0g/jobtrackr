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

# Deterministic one-page content budget (feeds revise before render/verify).
_MAX_SUMMARY_CHARS = 450
_MAX_EXPERIENCE_ROLES = 4
_MAX_BULLETS_PER_ROLE = 4
_MAX_TOTAL_EXPERIENCE_BULLETS = 12
_MAX_DRAFT_BODY_CHARS = 3_500


def _phrase_in_corpus(phrase: str, corpus: str) -> bool:
    """Require whole-phrase match, not an accidental substring of another token."""
    normalized = phrase.strip().lower()
    if not normalized:
        return False
    pattern = re.compile(rf"(?<![a-z0-9]){re.escape(normalized)}(?![a-z0-9])", re.IGNORECASE)
    return bool(pattern.search(corpus))


_EXPANDED_SKILL_RE = re.compile(
    r"^(?P<full>.+?)\s*\((?P<acronym>[A-Za-z0-9+.#]{2,20})\)$"
)


def _skill_grounded(
    skill: str,
    evidence_skills: set[str],
    corpus: str,
    *,
    jd_analysis: dict[str, Any] | None = None,
) -> bool:
    """Accept exact evidence skills or grounded Full Term (ACRONYM) expansions."""
    low = skill.lower().strip()
    if low in evidence_skills or _phrase_in_corpus(skill, corpus):
        return True
    match = _EXPANDED_SKILL_RE.match(skill.strip())
    if not match:
        return False
    full = match.group("full").strip().lower()
    acronym = match.group("acronym").strip().lower()
    base_grounded = (
        full in evidence_skills
        or acronym in evidence_skills
        or _phrase_in_corpus(full, corpus)
        or _phrase_in_corpus(acronym, corpus)
    )
    if not base_grounded:
        return False
    # Both sides of the expansion must be supported (evidence/corpus), or the
    # JD must supply this exact naming for an already-evidenced skill.
    naming_in_evidence = (
        (full in evidence_skills or _phrase_in_corpus(full, corpus))
        and (acronym in evidence_skills or _phrase_in_corpus(acronym, corpus))
    )
    if naming_in_evidence:
        return True
    for item in (jd_analysis or {}).get("skill_expansions") or []:
        if not isinstance(item, dict):
            continue
        if (
            str(item.get("full") or "").strip().lower() == full
            and str(item.get("acronym") or "").strip().lower() == acronym
        ):
            return True
    return False


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
        if not _skill_grounded(skill, evidence_skills, corpus, jd_analysis=jd_analysis):
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

    visible_text_fields = [
        *(cv.professional_summary or "",),
        *(b for exp in cv.experience for b in exp.bullets),
        *(
            text
            for exp in cv.experience
            for group in exp.bullet_groups
            for text in (group.heading, *group.bullets)
        ),
        *(award.title for award in cv.awards),
        *(
            text
            for item in cv.values_alignment
            for text in (item.value, item.behaviour)
        ),
    ]
    for field in visible_text_fields:
        if _SENSITIVE_RE.search(field):
            issues.append("sensitive personal attributes must be omitted")
            break

    # Fabricated metrics: numbers in user-visible prose that aren't in corpus
    metric_fields = [
        *(cv.professional_summary or "",),
        *(b for exp in cv.experience for b in exp.bullets),
        *(
            text
            for exp in cv.experience
            for group in exp.bullet_groups
            for text in (group.heading, *group.bullets)
        ),
        *(award.title for award in cv.awards),
        *(item.behaviour for item in cv.values_alignment),
    ]
    for field in metric_fields:
        if _METRIC_RE.search(field):
            nums = re.findall(r"\d+(?:\.\d+)?%?", field)
            if nums and not any(n in corpus for n in nums):
                issues.append(f"metric not grounded in evidence: {field[:80]}")

    evidence_awards = {
        str(item.get("title") or "").strip().lower()
        for item in (evidence.get("awards") or [])
        if isinstance(item, dict) and str(item.get("title") or "").strip()
    }
    for award in cv.awards:
        title = award.title.strip()
        if title.lower() not in evidence_awards and not _phrase_in_corpus(title, corpus):
            issues.append(f"award not in evidence: {title}")

    for item in cv.values_alignment:
        if not _phrase_in_corpus(item.behaviour, corpus):
            issues.append(
                f"values alignment behaviour not grounded in evidence: {item.behaviour[:80]}"
            )

    # JD skills must not be injected if absent from evidence
    if jd_analysis:
        jd_skills = {s.lower() for s in (jd_analysis.get("keywords") or [])}
        for skill in cv.skills:
            if _skill_grounded(skill, evidence_skills, corpus, jd_analysis=jd_analysis):
                continue
            if skill.lower() in jd_skills:
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

    if not (cv.experience or cv.education or cv.projects):
        issues.append("CV must include at least one experience, education, or project entry")

    issues.extend(_one_page_budget_issues(cv))

    return issues


def draft_body_char_count(cv: CanonicalCV) -> int:
    """Approximate drafted body size excluding contact chrome."""
    parts: list[str] = [
        cv.professional_summary or "",
        ", ".join(cv.skills),
        ", ".join(cv.languages),
        ", ".join(cv.certifications),
    ]
    for exp in cv.experience:
        parts.extend(exp.bullets)
        for group in exp.bullet_groups:
            parts.append(group.heading)
            parts.extend(group.bullets)
    for edu in cv.education:
        parts.extend(edu.details)
        parts.extend(
            bit for bit in (edu.institution, edu.degree, edu.field, edu.end_date) if bit
        )
    for proj in cv.projects:
        parts.append(proj.name)
        if proj.description:
            parts.append(proj.description)
        parts.extend(proj.bullets)
    for award in cv.awards:
        parts.append(award.title)
    for item in cv.values_alignment:
        parts.extend((item.value, item.behaviour))
    return sum(len(part) for part in parts if part)


def _experience_bullet_count(exp) -> int:
    return len(exp.bullets) + sum(len(group.bullets) for group in exp.bullet_groups)


def _one_page_budget_issues(cv: CanonicalCV) -> list[str]:
    """Actionable densification issues so revise can shorten before render."""
    issues: list[str] = []
    summary = (cv.professional_summary or "").strip()
    if len(summary) > _MAX_SUMMARY_CHARS:
        issues.append(
            "one-page budget: professional summary must be 2-3 short sentences "
            f"(max {_MAX_SUMMARY_CHARS} characters)"
        )

    if len(cv.experience) > _MAX_EXPERIENCE_ROLES:
        issues.append(
            "one-page budget: keep at most "
            f"{_MAX_EXPERIENCE_ROLES} experience roles; omit lowest-signal roles"
        )

    total_bullets = 0
    for exp in cv.experience:
        count = _experience_bullet_count(exp)
        total_bullets += count
        if count > _MAX_BULLETS_PER_ROLE:
            issues.append(
                "one-page budget: use at most "
                f"{_MAX_BULLETS_PER_ROLE} bullets per role ({exp.company})"
            )

    if total_bullets > _MAX_TOTAL_EXPERIENCE_BULLETS:
        issues.append(
            "one-page budget: total experience bullets must be <= "
            f"{_MAX_TOTAL_EXPERIENCE_BULLETS}; keep strongest JD-relevant bullets only"
        )

    body_chars = draft_body_char_count(cv)
    if body_chars > _MAX_DRAFT_BODY_CHARS:
        issues.append(
            "one-page budget: drafted body exceeds "
            f"{_MAX_DRAFT_BODY_CHARS} characters ({body_chars}); "
            "shorten summary/bullets and drop low-signal trailing sections"
        )

    return issues
