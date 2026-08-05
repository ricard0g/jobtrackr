"""Deterministic one-page densification for Generated CVs.

Heuristic char/bullet budgets are a revise hint; this module enforces the
hard ATS one-page contract by shrinking content until a PDF render fits
(or the CV cannot shrink further without losing all history).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from cv_generation.models.canonical_cv import CanonicalCV, ExperienceItem
from cv_generation.graph.validation import (
    _MAX_BULLETS_PER_ROLE,
    _MAX_EXPERIENCE_ROLES,
    _MAX_TOTAL_EXPERIENCE_BULLETS,
)

logger = logging.getLogger(__name__)

_SUMMARY_SOFT_CAP = 320


def pdf_page_count_for_cv(cv: CanonicalCV) -> int | None:
    try:
        from cv_generation.render.pdf_renderer import render_pdf
        from cv_generation.render.verify import pdf_page_count
    except Exception:  # noqa: BLE001
        return None
    try:
        return pdf_page_count(render_pdf(cv))
    except Exception:  # noqa: BLE001
        return None


def fits_one_page(cv: CanonicalCV) -> bool:
    pages = pdf_page_count_for_cv(cv)
    return pages is None or pages <= 1


def fit_canonical_cv_to_one_page(
    cv: CanonicalCV,
    *,
    jd_analysis: dict[str, Any] | None = None,
) -> CanonicalCV:
    """Shrink grounded content until the PDF proxy is one page (or irreducible)."""
    if fits_one_page(cv):
        return cv

    keywords = {
        str(k).lower()
        for k in ((jd_analysis or {}).get("keywords") or [])
        if str(k).strip()
    }
    target_title = str((jd_analysis or {}).get("target_title") or "").strip() or None

    current = cv.model_copy(deep=True)
    # First satisfy heuristic budgets so revise/validation stay consistent with PDF fit.
    current = _enforce_bullet_role_budgets(
        current,
        keywords=keywords,
        target_title=target_title,
    )
    steps = (
        lambda c: _trim_summary(c, _SUMMARY_SOFT_CAP),
        _drop_values_alignment,
        _drop_languages,
        _drop_certifications,
        _drop_projects,
        _drop_awards,
        lambda c: _cap_role_bullets(c, 3),
        lambda c: _cap_role_bullets(c, 2),
        lambda c: _drop_lowest_signal_role(c, keywords=keywords, target_title=target_title),
        lambda c: _cap_role_bullets(c, 1),
        lambda c: _trim_summary(c, 220),
        _trim_skills_line,
    )

    for step in steps:
        # Some steps may need repeating (e.g. drop multiple low-signal roles).
        for _ in range(4):
            if fits_one_page(current):
                logger.info("Fitted Generated CV to one page via deterministic densify")
                return current
            nxt = step(current)
            if nxt.model_dump() == current.model_dump():
                break
            current = nxt

    if fits_one_page(current):
        logger.info("Fitted Generated CV to one page via deterministic densify")
    else:
        logger.warning("Generated CV still exceeds one page after densify")
    return current


def _enforce_bullet_role_budgets(
    cv: CanonicalCV,
    *,
    keywords: set[str],
    target_title: str | None,
) -> CanonicalCV:
    current = _cap_role_bullets(cv, _MAX_BULLETS_PER_ROLE)
    while len(current.experience) > _MAX_EXPERIENCE_ROLES:
        nxt = _drop_lowest_signal_role(
            current, keywords=keywords, target_title=target_title
        )
        if nxt.model_dump() == current.model_dump():
            break
        current = nxt
    total = sum(_experience_bullet_count(exp) for exp in current.experience)
    while total > _MAX_TOTAL_EXPERIENCE_BULLETS and current.experience:
        # Peel one bullet from the lowest-signal role that still has bullets.
        ranked = sorted(
            enumerate(current.experience),
            key=lambda pair: (
                _role_relevance(pair[1], keywords=keywords, target_title=target_title),
                _experience_bullet_count(pair[1]),
                -pair[0],
            ),
        )
        index, exp = ranked[0]
        if _experience_bullet_count(exp) <= 0:
            break
        if exp.bullets:
            new_exp = exp.model_copy(update={"bullets": list(exp.bullets)[:-1]})
        elif exp.bullet_groups:
            groups = list(exp.bullet_groups)
            last = groups[-1]
            if len(last.bullets) <= 1:
                groups = groups[:-1]
            else:
                groups[-1] = last.model_copy(update={"bullets": list(last.bullets)[:-1]})
            new_exp = exp.model_copy(update={"bullet_groups": groups})
        else:
            break
        experience = list(current.experience)
        experience[index] = new_exp
        current = current.model_copy(update={"experience": experience})
        total = sum(_experience_bullet_count(exp) for exp in current.experience)
    return current


def _trim_summary(cv: CanonicalCV, max_chars: int) -> CanonicalCV:
    summary = (cv.professional_summary or "").strip()
    if not summary or len(summary) <= max_chars:
        return cv
    # Prefer whole sentences when possible.
    parts = re.split(r"(?<=[.!?])\s+", summary)
    kept: list[str] = []
    for part in parts:
        candidate = " ".join([*kept, part]).strip()
        if kept and len(candidate) > max_chars:
            break
        kept.append(part)
        if len(candidate) >= max_chars:
            break
    trimmed = " ".join(kept).strip() or summary[: max_chars - 3].rstrip() + "..."
    if len(trimmed) > max_chars:
        trimmed = trimmed[: max_chars - 3].rstrip() + "..."
    return cv.model_copy(update={"professional_summary": trimmed})


def _drop_values_alignment(cv: CanonicalCV) -> CanonicalCV:
    if not cv.values_alignment:
        return cv
    return cv.model_copy(update={"values_alignment": []})


def _drop_languages(cv: CanonicalCV) -> CanonicalCV:
    if not cv.languages:
        return cv
    return cv.model_copy(update={"languages": []})


def _drop_certifications(cv: CanonicalCV) -> CanonicalCV:
    if not cv.certifications:
        return cv
    return cv.model_copy(update={"certifications": []})


def _drop_projects(cv: CanonicalCV) -> CanonicalCV:
    if not cv.projects:
        return cv
    return cv.model_copy(update={"projects": []})


def _drop_awards(cv: CanonicalCV) -> CanonicalCV:
    if not cv.awards:
        return cv
    return cv.model_copy(update={"awards": []})


def _trim_skills_line(cv: CanonicalCV) -> CanonicalCV:
    if len(cv.skills) <= 6:
        return cv
    return cv.model_copy(update={"skills": list(cv.skills[:6])})


def _experience_bullet_count(exp: ExperienceItem) -> int:
    return len(exp.bullets) + sum(len(group.bullets) for group in exp.bullet_groups)


def _cap_role_bullets(cv: CanonicalCV, max_per_role: int) -> CanonicalCV:
    changed = False
    experience: list[ExperienceItem] = []
    for exp in cv.experience:
        if _experience_bullet_count(exp) <= max_per_role:
            experience.append(exp)
            continue
        changed = True
        used = 0
        groups = []
        for group in exp.bullet_groups:
            left = max_per_role - used
            if left <= 0:
                break
            bullets = list(group.bullets)[:left]
            if not bullets:
                continue
            used += len(bullets)
            groups.append(group.model_copy(update={"bullets": bullets}))
        flat = list(exp.bullets)[: max(0, max_per_role - used)]
        experience.append(exp.model_copy(update={"bullets": flat, "bullet_groups": groups}))
    if not changed:
        return cv
    return cv.model_copy(update={"experience": experience})


def _role_relevance(
    exp: ExperienceItem,
    *,
    keywords: set[str],
    target_title: str | None,
) -> tuple[int, int]:
    title_hit = 0
    if target_title and target_title.lower() in (exp.title or "").lower():
        title_hit = 1
    haystack = " ".join(
        [
            exp.title or "",
            exp.company or "",
            *exp.bullets,
            *(group.heading for group in exp.bullet_groups),
            *(bullet for group in exp.bullet_groups for bullet in group.bullets),
        ]
    ).lower()
    keyword_hits = sum(1 for key in keywords if key and key in haystack)
    return (title_hit, keyword_hits)


def _drop_lowest_signal_role(
    cv: CanonicalCV,
    *,
    keywords: set[str],
    target_title: str | None,
) -> CanonicalCV:
    if len(cv.experience) <= 1:
        return cv
    ranked = sorted(
        enumerate(cv.experience),
        key=lambda pair: (
            _role_relevance(pair[1], keywords=keywords, target_title=target_title),
            -pair[0],  # prefer dropping later roles on ties
        ),
    )
    drop_index = ranked[0][0]
    experience = [exp for index, exp in enumerate(cv.experience) if index != drop_index]
    return cv.model_copy(update={"experience": experience})
