"""Deterministic fake provider for CI — no Gemini calls."""

from __future__ import annotations

import re
from typing import Any

from cv_generation.models.canonical_cv import (
    AwardItem,
    CanonicalCV,
    ContactInfo,
    EducationItem,
    ExperienceBulletGroup,
    ExperienceItem,
    ProjectItem,
    ValuesAlignmentItem,
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
        additional_information: str | None = None,
    ) -> CandidateEvidence:
        """Use deterministic hints in tests; no model calls are made."""
        del extracted_text, additional_information
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
        keyword_list = [str(k) for k in (jd_analysis.get("keywords") or []) if str(k).strip()]
        keywords = {k.lower() for k in keyword_list}
        expansions = list(jd_analysis.get("skill_expansions") or [])
        # Evidence-only: JD-order matches first; drop unrelated when any match exists.
        ordered = _order_skills_for_jd(evidence_skills, keyword_list, expansions)

        themes = [
            str(t).strip()
            for t in (jd_analysis.get("responsibility_themes") or [])
            if str(t).strip()
        ]
        target_title = jd_analysis.get("target_title")
        experience_items = []
        for item in evidence.get("experience") or []:
            if not isinstance(item, dict) or not str(item.get("company") or "").strip():
                continue
            raw = ExperienceItem(
                company=str(item.get("company") or "").strip(),
                title=str(item.get("title") or "").strip() or "Role",
                start_date=item.get("start_date"),
                end_date=item.get("end_date"),
                location=item.get("location"),
                bullets=list(item.get("bullets") or []),
                bullet_groups=list(item.get("bullet_groups") or []),
            )
            themed = _apply_experience_theme_groups(raw, themes)
            aligned_title = _align_experience_title(
                themed,
                target_title=target_title,
                keywords=keywords,
            )
            experience_items.append(
                themed.model_copy(update={"title": aligned_title})
            )
        experience = _densify_experience_for_one_page(
            experience_items,
            keywords=keywords,
            target_title=target_title,
        )

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

        awards = [
            AwardItem(
                title=str(item.get("title") or "").strip(),
                date=item.get("date"),
            )
            for item in (evidence.get("awards") or [])
            if isinstance(item, dict) and str(item.get("title") or "").strip()
        ]

        summary = _build_professional_summary(
            evidence_summary=evidence.get("professional_summary"),
            experience=experience,
            skills=ordered,
            target_title=jd_analysis.get("target_title"),
        )

        values_alignment = _build_values_alignment(
            evidence=evidence,
            experience=experience,
            value_statements=list(jd_analysis.get("value_statements") or []),
        )

        return CanonicalCV(
            full_name=name,
            contact=contact,
            professional_summary=summary,
            skills=ordered,
            experience=experience,
            education=education,
            awards=awards,
            projects=projects,
            certifications=list(evidence.get("certifications") or []),
            languages=list(evidence.get("spoken_languages") or []),
            values_alignment=values_alignment,
            output_language=output_language,
        )


def _build_professional_summary(
    *,
    evidence_summary: Any,
    experience: list[ExperienceItem],
    skills: list[str],
    target_title: Any,
) -> str | None:
    """Draft 2–3 grounded prose sentences targeted to the role."""
    evidenced_titles = [exp.title for exp in experience if exp.title]
    companies = [exp.company for exp in experience[:2] if exp.company]
    titles = evidenced_titles[:2]
    # Only adopt the JD title when an evidenced experience title clearly matches.
    jd_title = str(target_title or "").strip()
    role_label = next(
        (
            t
            for t in evidenced_titles
            if jd_title and jd_title.lower() in t.lower()
        ),
        titles[0] if titles else "Professional",
    )
    # `skills` is already JD-ordered / filtered by Grounded Tailoring.
    skill_highlights = list(skills[:4])

    sentences: list[str] = []
    if companies and titles:
        sentences.append(
            f"{role_label} with experience as {titles[0]} at {companies[0]}"
            + (
                f" and {titles[1]} at {companies[1]}"
                if len(companies) > 1 and len(titles) > 1
                else ""
            )
            + "."
        )
    elif evidence_summary and str(evidence_summary).strip():
        base = str(evidence_summary).strip()
        if not base.endswith((".", "!", "?")):
            base += "."
        sentences.append(base)
    else:
        sentences.append(f"{role_label} with grounded professional experience.")

    if skill_highlights and len(sentences) < 3:
        if len(skill_highlights) == 1:
            skill_phrase = skill_highlights[0]
        elif len(skill_highlights) == 2:
            skill_phrase = f"{skill_highlights[0]} and {skill_highlights[1]}"
        else:
            skill_phrase = (
                ", ".join(skill_highlights[:-1]) + f", and {skill_highlights[-1]}"
            )
        sentences.append(
            f"Strengths include {skill_phrase}, aligned to this role's requirements."
        )

    # Prefer a distinct evidenced summary sentence when we still need a third.
    if evidence_summary and len(sentences) < 3:
        base = str(evidence_summary).strip()
        if base:
            if not base.endswith((".", "!", "?")):
                base += "."
            if base.lower() not in " ".join(sentences).lower():
                sentences.append(base)

    if not sentences:
        return None
    summary = " ".join(sentences[:3])
    if len(summary) > 450:
        summary = summary[:447].rstrip() + "..."
    return summary


def _value_match_words(value: str) -> set[str]:
    stop = {
        "and",
        "or",
        "the",
        "a",
        "an",
        "to",
        "of",
        "in",
        "for",
        "with",
        "on",
        "at",
        "our",
        "we",
        "value",
        "values",
    }
    return {
        t
        for t in re.findall(r"[a-z0-9]+", value.lower())
        if len(t) > 2 and t not in stop
    }


def _value_stems(word: str) -> set[str]:
    """Light stems so Ownership↔Owned / Mentorship↔Mentored without Integrity↔interest."""
    stems = {word}
    for suf in ("ship", "tion", "sion", "ment", "ness", "ity", "ance", "ence"):
        if word.endswith(suf) and len(word) > len(suf) + 2:
            stems.add(word[: -len(suf)])
            break
    # ownership → own; leadership → lead (ership), without mangling mentorship→ment.
    if word.endswith("ership") and len(word) > 8:
        stems.add(word[: -len("ership")])
    return {s for s in stems if len(s) >= 3}


def _behaviour_matches_value(behaviour: str, value_words: set[str]) -> bool:
    """True when a behaviour clearly evidences the JD value (concrete, not slogans)."""
    if not value_words:
        return False
    low = behaviour.lower()
    tokens = set(re.findall(r"[a-z0-9]+", low))
    for word in value_words:
        if word in low:
            return True
        for stem in _value_stems(word):
            if stem in low:
                return True
            for token in tokens:
                if token.startswith(stem) or stem.startswith(token):
                    # Require enough overlap that Integrity ≠ interest.
                    if min(len(stem), len(token)) >= 5:
                        return True
                    if len(stem) >= 3 and token.startswith(stem):
                        return True
    return False


def _evidence_behaviour_pool(
    evidence: dict[str, Any],
    experience: list[ExperienceItem],
) -> list[str]:
    pool: list[str] = []
    seen: set[str] = set()

    def _add(text: Any) -> None:
        if not isinstance(text, str):
            return
        cleaned = text.strip()
        if not cleaned:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        pool.append(cleaned)

    for exp in experience:
        for bullet in _flatten_experience_bullets(exp):
            _add(bullet)
    for item in evidence.get("projects") or []:
        if isinstance(item, dict):
            for bullet in item.get("bullets") or []:
                _add(bullet)
            _add(item.get("description"))
    _add(evidence.get("professional_summary"))
    return pool


def _build_values_alignment(
    *,
    evidence: dict[str, Any],
    experience: list[ExperienceItem],
    value_statements: list[Any],
) -> list[ValuesAlignmentItem]:
    """Pair JD value labels with evidenced behaviours; omit when unsupported."""
    values = [str(v).strip() for v in value_statements if str(v).strip()]
    if not values:
        return []
    behaviours = _evidence_behaviour_pool(evidence, experience)
    if not behaviours:
        return []

    used_behaviours: set[int] = set()
    items: list[ValuesAlignmentItem] = []
    for value in values:
        words = _value_match_words(value)
        matched_index: int | None = None
        for index, behaviour in enumerate(behaviours):
            if index in used_behaviours:
                continue
            if _behaviour_matches_value(behaviour, words):
                matched_index = index
                break
        if matched_index is None:
            continue
        used_behaviours.add(matched_index)
        items.append(
            ValuesAlignmentItem(value=value, behaviour=behaviours[matched_index])
        )
        if len(items) >= 5:
            break
    return items


def _format_skill_expansion(full: str, acronym: str) -> str:
    return f"{full} ({acronym})"


def _expand_skill_label(skill: str, expansions: list[Any]) -> str:
    """Apply grounded Full Term (ACRONYM) naming when JD/evidence support it."""
    low = skill.lower().strip()
    for item in expansions:
        if not isinstance(item, dict):
            continue
        full = str(item.get("full") or "").strip()
        acronym = str(item.get("acronym") or "").strip()
        if not full or not acronym:
            continue
        if low in {full.lower(), acronym.lower(), _format_skill_expansion(full, acronym).lower()}:
            return _format_skill_expansion(full, acronym)
    return skill


def _skill_jd_rank(skill: str, keyword_rank: dict[str, int], expansions: list[Any]) -> int | None:
    candidates = {skill.lower()}
    for item in expansions:
        if not isinstance(item, dict):
            continue
        full = str(item.get("full") or "").strip()
        acronym = str(item.get("acronym") or "").strip()
        if not full or not acronym:
            continue
        expanded = _format_skill_expansion(full, acronym)
        if skill.lower() in {full.lower(), acronym.lower(), expanded.lower()}:
            candidates.update({full.lower(), acronym.lower(), expanded.lower()})
    ranks = [keyword_rank[c] for c in candidates if c in keyword_rank]
    return min(ranks) if ranks else None


def _order_skills_for_jd(
    evidence_skills: list[str],
    keyword_list: list[str],
    expansions: list[Any] | None = None,
) -> list[str]:
    """Keep evidence skills only; JD matches first; drop unrelated when matches exist."""
    if not evidence_skills:
        return []
    expansion_list = expansions or []
    keyword_rank = {k.lower(): i for i, k in enumerate(keyword_list)}
    matched: list[tuple[int, int, str]] = []
    for index, skill in enumerate(evidence_skills):
        rank = _skill_jd_rank(skill, keyword_rank, expansion_list)
        if rank is not None:
            matched.append((rank, index, _expand_skill_label(skill, expansion_list)))
    if not matched:
        # No JD overlap → keep evidence skills (cannot judge "unrelated").
        return [_expand_skill_label(skill, expansion_list) for skill in evidence_skills]
    matched.sort(key=lambda item: (item[0], item[1]))
    # Deduplicate labels after expansion while preserving order.
    seen: set[str] = set()
    ordered: list[str] = []
    for _, _, label in matched:
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(label)
    return ordered


_ROLE_FAMILIES: tuple[frozenset[str], ...] = (
    frozenset({"engineer", "developer", "programmer", "swe", "sre"}),
    frozenset({"analyst", "scientist", "researcher"}),
    frozenset({"manager", "lead", "director", "head"}),
    frozenset({"designer", "ux", "ui"}),
    frozenset({"consultant", "specialist", "architect"}),
    frozenset({"baker", "barista", "chef", "cook"}),
)


def _title_tokens(title: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", title.lower()) if t}


def _role_family(title: str) -> int | None:
    tokens = _title_tokens(title)
    for index, family in enumerate(_ROLE_FAMILIES):
        if tokens & family:
            return index
    return None


def _experience_haystack(exp: ExperienceItem) -> str:
    return " ".join(
        [
            exp.title or "",
            exp.company or "",
            *exp.bullets,
            *(group.heading for group in exp.bullet_groups),
            *(bullet for group in exp.bullet_groups for bullet in group.bullets),
        ]
    ).lower()


def _duties_clearly_match(
    exp: ExperienceItem,
    *,
    target_title: str,
    keywords: set[str],
) -> bool:
    """True when evidenced duties clearly support adopting the JD title."""
    evidenced = (exp.title or "").strip()
    if not evidenced:
        return False
    jd = target_title.strip()
    jd_low = jd.lower()
    ev_low = evidenced.lower()
    if jd_low in ev_low or ev_low in jd_low:
        return True

    haystack = _experience_haystack(exp)
    keyword_hits = sum(1 for key in keywords if key and key in haystack)
    jd_family = _role_family(jd)
    ev_family = _role_family(evidenced)
    # Same role family plus clear duty overlap (not a single weak keyword hit).
    if jd_family is not None and jd_family == ev_family and keyword_hits >= 2:
        return True
    # Strong duty overlap with a JD role word appearing in the role text.
    jd_role_words = _title_tokens(jd) & {
        token for family in _ROLE_FAMILIES for token in family
    }
    if keyword_hits >= 2 and jd_role_words and any(w in haystack for w in jd_role_words):
        return True
    return False


def _align_experience_title(
    exp: ExperienceItem,
    *,
    target_title: Any,
    keywords: set[str],
) -> str:
    jd_title = str(target_title or "").strip()
    if not jd_title:
        return exp.title
    if _duties_clearly_match(exp, target_title=jd_title, keywords=keywords):
        return jd_title
    return exp.title


def _theme_match_words(theme: str) -> set[str]:
    stop = {
        "and",
        "or",
        "the",
        "a",
        "an",
        "to",
        "of",
        "in",
        "for",
        "with",
        "on",
        "at",
        "team",
        "work",
        "working",
    }
    return {
        t
        for t in re.findall(r"[a-z0-9]+", theme.lower())
        if len(t) > 2 and t not in stop
    }


def _bullet_matches_theme(bullet: str, theme_words: set[str]) -> bool:
    if not theme_words:
        return False
    low = bullet.lower()
    tokens = set(re.findall(r"[a-z0-9]+", low))
    for word in theme_words:
        if word in low:
            return True
        # Light stemming so Collaboration ↔ Collaborated, Develop ↔ Development.
        for token in tokens:
            if len(word) >= 5 and len(token) >= 5 and (
                token.startswith(word[:5]) or word.startswith(token[:5])
            ):
                return True
    return False


def _flatten_experience_bullets(exp: ExperienceItem) -> list[str]:
    pool: list[str] = []
    seen: set[str] = set()
    for bullet in [*exp.bullets, *(b for g in exp.bullet_groups for b in g.bullets)]:
        key = bullet.strip().lower()
        if not bullet.strip() or key in seen:
            continue
        seen.add(key)
        pool.append(bullet)
    return pool


def _apply_experience_theme_groups(
    exp: ExperienceItem,
    themes: list[str],
) -> ExperienceItem:
    """Group bullets under JD themes when evidence supports them; else flat bullets."""
    pool = _flatten_experience_bullets(exp)
    if not themes:
        return exp.model_copy(update={"bullets": pool, "bullet_groups": []})

    used: set[int] = set()
    groups: list[ExperienceBulletGroup] = []
    for theme in themes:
        words = _theme_match_words(theme)
        matched: list[str] = []
        for index, bullet in enumerate(pool):
            if index in used:
                continue
            if _bullet_matches_theme(bullet, words):
                matched.append(bullet)
                used.add(index)
        if matched:
            groups.append(ExperienceBulletGroup(heading=theme, bullets=matched))

    if not groups:
        return exp.model_copy(update={"bullets": pool, "bullet_groups": []})

    leftovers = [bullet for index, bullet in enumerate(pool) if index not in used]
    return exp.model_copy(update={"bullets": leftovers, "bullet_groups": groups})


def _experience_relevance(
    exp: ExperienceItem,
    *,
    keywords: set[str],
    target_title: str | None,
) -> tuple[int, int]:
    """Higher tuples are more JD-relevant (title match, then keyword hits)."""
    title_hit = 0
    if target_title and str(target_title).strip():
        if str(target_title).strip().lower() in (exp.title or "").lower():
            title_hit = 1
    haystack = _experience_haystack(exp)
    keyword_hits = sum(1 for key in keywords if key and key in haystack)
    return (title_hit, keyword_hits)


def _role_bullet_cap(relevance: tuple[int, int], *, is_top_relevant: bool) -> int:
    """Prefer ~3–4 on strongest JD-fit roles; thin low-signal keepers."""
    if is_top_relevant or relevance[0] or relevance[1] >= 2:
        return 4
    if relevance[1] >= 1:
        return 2
    return 1


def _densify_experience_for_one_page(
    items: list[ExperienceItem],
    *,
    keywords: set[str] | None = None,
    target_title: str | None = None,
) -> list[ExperienceItem]:
    """Keep FakeProvider drafts inside the deterministic one-page bullet budget.

    Prefers ~3–4 bullets on the most JD-relevant roles, allocates the shared
    bullet pool by relevance first, thins low-signal keepers, and drops surplus
    roles by JD relevance while preserving evidence order among keepers.
    """
    max_roles = 4
    max_total = 12
    keyword_set = keywords or set()

    scored = [
        (
            index,
            exp,
            _experience_relevance(
                exp,
                keywords=keyword_set,
                target_title=target_title,
            ),
        )
        for index, exp in enumerate(items)
    ]
    ranked = sorted(scored, key=lambda row: (row[2], row[0]), reverse=True)
    keep_indices = {index for index, _, _ in ranked[:max_roles]}
    top_relevant_index = ranked[0][0] if ranked else None

    # Allocate bullets in relevance order so JD-fit roles densify first.
    trimmed_by_index: dict[int, ExperienceItem] = {}
    remaining_total = max_total
    for index, exp, rel in ranked:
        if index not in keep_indices:
            continue
        role_cap = _role_bullet_cap(
            rel,
            is_top_relevant=index == top_relevant_index,
        )
        role_budget = min(role_cap, remaining_total)
        # Prefer theme-group bullets when present, then flat leftovers.
        groups: list[ExperienceBulletGroup] = []
        used = 0
        for group in exp.bullet_groups:
            left = role_budget - used
            if left <= 0:
                break
            bullets = list(group.bullets)[:left]
            if not bullets:
                continue
            used += len(bullets)
            groups.append(group.model_copy(update={"bullets": bullets}))
        flat = list(exp.bullets)[: max(0, role_budget - used)]
        used += len(flat)
        remaining_total -= used
        trimmed_by_index[index] = exp.model_copy(
            update={"bullets": flat, "bullet_groups": groups}
        )

    return [
        trimmed_by_index[index]
        for index, exp in enumerate(items)
        if index in trimmed_by_index
    ]


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
