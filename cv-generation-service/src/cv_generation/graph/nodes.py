"""LangGraph node implementations."""

from __future__ import annotations

import logging
import re
from typing import Any

from cv_generation.extraction.extract import (
    extract_base_cv,
    find_emails,
    find_phones,
    find_urls,
)
from cv_generation.graph.state import GraphState
from cv_generation.graph.validation import validate_canonical_cv
from cv_generation.models.canonical_cv import CanonicalCV
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.providers.base import DraftingProvider
from cv_generation.providers.fake import extract_name_heuristic
from cv_generation.render.docx_renderer import render_docx
from cv_generation.render.markdown import render_markdown
from cv_generation.render.pdf_renderer import render_pdf
from cv_generation.render.verify import verify_rendered
from cv_generation.models.specification import OutputFormat

logger = logging.getLogger(__name__)

_LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s)>\]]+", re.I)
_GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[^\s)>\]]+", re.I)

_LANG_HINTS: dict[str, tuple[str, ...]] = {
    "es": ("requisitos", "experiencia", "años", "puesto", "empresa", "habilidades", "se requiere"),
    "fr": ("expérience", "exigences", "poste", "compétences", "années", "société"),
    "de": ("anforderungen", "erfahrung", "stelle", "fähigkeiten", "unternehmen", "jahre"),
    "pt": ("requisitos", "experiência", "anos", "vaga", "empresa", "habilidades"),
    "en": ("requirements", "experience", "years", "responsibilities", "qualifications", "we are looking"),
}

_OVERRIDE_LANG_RE = re.compile(
    r"(?:language|idioma|langue|sprache)\s*[:=]\s*([a-z]{2}(?:-[A-Z]{2})?)",
    re.IGNORECASE,
)


def node_extract(state: GraphState) -> dict[str, Any]:
    result = extract_base_cv(
        state["base_cv_bytes"],
        filename=state.get("filename"),
        content_type=state.get("content_type"),
        max_chars=state.get("max_extracted_chars", 100_000),
    )
    return {
        "extracted_text": result.text,
        "source_format": result.source_format.value,
    }


def node_normalize_evidence(
    state: GraphState,
    provider: DraftingProvider,
) -> dict[str, Any]:
    text = state["extracted_text"]
    additional = state.get("additional_information")
    # Hints cover Base CV and user additions so FakeProvider / section parsers
    # see experience supplied only via additional_information.
    hint_corpus = text
    if additional:
        hint_corpus = f"{text}\n\n# Additional Information\n{additional}".strip()
    deterministic_hints = _parse_evidence_from_text(hint_corpus)
    if additional:
        deterministic_hints = _apply_kv_overrides(deterministic_hints, _parse_kv_overrides(additional))
    interpreted = provider.interpret_base_cv(
        extracted_text=text,
        deterministic_hints=deterministic_hints,
        additional_information=additional,
    )
    evidence = interpreted.model_dump()
    evidence["raw_text"] = text
    logger.info(
        "Candidate evidence structured correlation_id=%s skills=%d experience=%d education=%d projects=%d",
        state.get("correlation_id"),
        len(evidence.get("skills") or []),
        len(evidence.get("experience") or []),
        len(evidence.get("education") or []),
        len(evidence.get("projects") or []),
    )
    return {"evidence": evidence}


def node_merge_user_evidence(state: GraphState) -> dict[str, Any]:
    """additional_information is authoritative over base CV facts."""
    evidence = dict(state.get("evidence") or {})
    additional = state.get("additional_information")
    if not additional:
        return {"evidence": evidence}

    # Append additional text to corpus so grounding checks pass
    raw = str(evidence.get("raw_text") or "")
    if "# Additional Information" not in raw:
        evidence["raw_text"] = f"{raw}\n\n# Additional Information\n{additional}".strip()

    override = _parse_evidence_from_text(additional)
    kv = _parse_kv_overrides(additional)
    evidence = _apply_kv_overrides(evidence, kv)

    if not kv.get("full_name") and override.get("full_name"):
        evidence["full_name"] = override["full_name"]

    contact = dict(evidence.get("contact") or {})
    for key in ("email", "phone", "linkedin", "github", "portfolio", "location"):
        if kv.get(key):
            continue
        if override.get("contact", {}).get(key):
            contact[key] = override["contact"][key]
    # Emails/phones discovered via regex still apply
    if override.get("contact", {}).get("email") and not contact.get("email"):
        contact["email"] = override["contact"]["email"]
    if override.get("contact", {}).get("phone") and not contact.get("phone"):
        contact["phone"] = override["contact"]["phone"]
    evidence["contact"] = contact

    # Skills: union, additional first (authoritative ordering)
    base_skills = list(evidence.get("skills") or [])
    add_skills = list(kv.get("skills") or []) + list(override.get("skills") or [])
    seen: set[str] = set()
    merged_skills: list[str] = []
    for s in add_skills + base_skills:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            merged_skills.append(s)
    evidence["skills"] = merged_skills

    if override.get("experience"):
        add_exp = [e for e in override["experience"] if isinstance(e, dict)]
        add_companies = {str(e.get("company") or "").lower() for e in add_exp}
        base_exp = [
            e
            for e in (evidence.get("experience") or [])
            if isinstance(e, dict) and str(e.get("company") or "").lower() not in add_companies
        ]
        evidence["experience"] = add_exp + base_exp
    if override.get("education"):
        add_edu = [e for e in override["education"] if isinstance(e, dict)]
        add_institutions = {str(e.get("institution") or "").lower() for e in add_edu}
        base_edu = [
            e
            for e in (evidence.get("education") or [])
            if isinstance(e, dict)
            and str(e.get("institution") or "").lower() not in add_institutions
        ]
        evidence["education"] = add_edu + base_edu
    if override.get("projects"):
        add_projects = [p for p in override["projects"] if isinstance(p, dict)]
        add_names = {str(p.get("name") or "").lower() for p in add_projects}
        base_projects = [
            p
            for p in (evidence.get("projects") or [])
            if isinstance(p, dict) and str(p.get("name") or "").lower() not in add_names
        ]
        evidence["projects"] = add_projects + base_projects
    if override.get("professional_summary"):
        evidence["professional_summary"] = override["professional_summary"]
    if override.get("certifications"):
        evidence["certifications"] = list(
            dict.fromkeys(list(override["certifications"]) + list(evidence.get("certifications") or []))
        )

    evidence["additional_information"] = additional
    return {"evidence": evidence}


def node_analyze_jd(state: GraphState) -> dict[str, Any]:
    """JD analysis for targeting only — never candidate facts."""
    jd = state["job_description"]
    additional = state.get("additional_information") or ""

    language, uncertain = _resolve_output_language(jd, additional)
    if uncertain:
        raise ServiceError(
            ErrorCode.OUTPUT_LANGUAGE_REQUIRED,
            "Unable to determine output language from job description; "
            "specify language in additional_information (e.g. language: en)",
        )

    keywords = _extract_keywords(jd)
    target_title = _guess_title(jd)
    skill_expansions = _extract_skill_expansions(jd)
    responsibility_themes = _extract_responsibility_themes(jd)

    return {
        "jd_analysis": {
            "keywords": keywords,
            "target_title": target_title,
            "skill_expansions": skill_expansions,
            "responsibility_themes": responsibility_themes,
            "source": "job_description",
            "note": "targeting_only",
        },
        "output_language": language,
        "language_uncertain": False,
    }


def node_validate_evidence(state: GraphState) -> dict[str, Any]:
    """Reject structurally empty evidence before it can become a completed CV."""
    evidence = state.get("evidence") or {}
    history_counts = {
        "experience": len(evidence.get("experience") or []),
        "education": len(evidence.get("education") or []),
        "projects": len(evidence.get("projects") or []),
    }
    if not any(history_counts.values()):
        raise ServiceError(
            ErrorCode.BASE_CV_NOT_EXTRACTABLE,
            "No experience, education, or projects could be structured from the Base CV "
            "or additional_information",
            details={"structured_sections": history_counts},
        )
    return {}


def node_draft(state: GraphState, provider: DraftingProvider) -> dict[str, Any]:
    cv = provider.draft(
        evidence=state["evidence"],
        jd_analysis=state["jd_analysis"],
        output_language=state["output_language"],
    )
    return {
        "canonical_cv": cv,
        "revision_count": 0,
        "model_id": provider.model_id,
        "needs_revision": False,
        "validation_issues": [],
    }


def node_validate(state: GraphState) -> dict[str, Any]:
    cv = state.get("canonical_cv")
    if cv is None:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "No canonical CV to validate",
        )
    issues = validate_canonical_cv(cv, state["evidence"], jd_analysis=state.get("jd_analysis"))
    # Hard ATS one-page contract: densify deterministically before failing/revising.
    if _one_page_render_issues(cv):
        from cv_generation.graph.one_page import fit_canonical_cv_to_one_page

        fitted = fit_canonical_cv_to_one_page(cv, jd_analysis=state.get("jd_analysis"))
        if fitted.model_dump() != cv.model_dump():
            cv = fitted
            issues = validate_canonical_cv(
                cv, state["evidence"], jd_analysis=state.get("jd_analysis")
            )
    issues.extend(_one_page_render_issues(cv))
    revision_count = int(state.get("revision_count") or 0)
    max_revisions = int(state.get("max_revisions") or 2)
    needs = bool(issues) and revision_count < max_revisions
    if issues:
        logger.warning(
            "Canonical CV validation issues correlation_id=%s revision=%s/%s needs_revision=%s issues=%s",
            state.get("correlation_id"),
            revision_count,
            max_revisions,
            needs,
            issues[:12],
        )
    if issues and not needs:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "; ".join(issues[:5]),
            details={"issues": issues},
        )
    return {
        "canonical_cv": cv,
        "validation_issues": issues,
        "needs_revision": needs,
    }


def _one_page_render_issues(cv: CanonicalCV) -> list[str]:
    """PDF layout proxy for one-page fit (available in the service image)."""
    from cv_generation.graph.one_page import pdf_page_count_for_cv

    pages = pdf_page_count_for_cv(cv)
    if pages is None:
        return [
            "one-page budget: rendered CV page count could not be verified; "
            "retry generation or shorten the CV"
        ]
    if pages <= 1:
        return []
    return [
        "one-page budget: rendered CV exceeds one page; "
        "shorten summary/bullets and omit low-signal roles or trailing sections"
    ]


def node_revise(state: GraphState, provider: DraftingProvider) -> dict[str, Any]:
    cv = state["canonical_cv"]
    assert cv is not None
    revised = provider.revise(
        current=cv,
        evidence=state["evidence"],
        jd_analysis=state["jd_analysis"],
        validation_issues=list(state.get("validation_issues") or []),
        output_language=state["output_language"],
    )
    return {
        "canonical_cv": revised,
        "revision_count": int(state.get("revision_count") or 0) + 1,
        "needs_revision": False,
        "model_id": provider.model_id,
    }


def node_render(state: GraphState) -> dict[str, Any]:
    cv = state.get("canonical_cv")
    if cv is None:
        raise ServiceError(ErrorCode.INTERNAL_ERROR, "Missing canonical CV for render")

    fmt = state["output_format"]
    if isinstance(fmt, str):
        fmt = OutputFormat(fmt)

    safe_name = re.sub(r"[^\w\-]+", "_", cv.full_name).strip("_") or "cv"
    if fmt == OutputFormat.MARKDOWN:
        data = render_markdown(cv)
        return {
            "rendered_bytes": data,
            "content_type_out": "text/markdown; charset=utf-8",
            "filename_out": f"{safe_name}.md",
        }
    if fmt == OutputFormat.DOCX:
        data = render_docx(cv)
        return {
            "rendered_bytes": data,
            "content_type_out": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "filename_out": f"{safe_name}.docx",
        }
    if fmt == OutputFormat.PDF:
        data = render_pdf(cv)
        return {
            "rendered_bytes": data,
            "content_type_out": "application/pdf",
            "filename_out": f"{safe_name}.pdf",
        }
    raise ServiceError(
        ErrorCode.INVALID_GENERATION_FORMAT,
        f"Unsupported output format: {fmt}",
    )


def node_verify(state: GraphState) -> dict[str, Any]:
    cv = state.get("canonical_cv")
    assert cv is not None
    fmt = state["output_format"]
    if isinstance(fmt, str):
        fmt = OutputFormat(fmt)
    verify_rendered(
        state["rendered_bytes"],
        fmt,
        expected_name=cv.full_name,
        expected_email=cv.contact.email,
    )
    # DOCX/Markdown use the PDF renderer as the ATS one-page layout proxy.
    if fmt != OutputFormat.PDF:
        from cv_generation.graph.one_page import pdf_page_count_for_cv
        from cv_generation.render.verify import verify_one_page_layout

        verify_one_page_layout(pdf_page_count_for_cv(cv))
    return {}


def _parse_kv_overrides(text: str) -> dict[str, Any]:
    """Parse simple key: value lines from additional_information."""
    out: dict[str, Any] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key_n = key.strip().lower()
        value = value.strip()
        if not value:
            continue
        if key_n in {"name", "full_name", "full name"}:
            out["full_name"] = value
        elif key_n in {"email", "e-mail"}:
            out["email"] = value
        elif key_n in {"phone", "tel", "telephone"}:
            out["phone"] = value
        elif key_n == "linkedin":
            out["linkedin"] = value
        elif key_n == "github":
            out["github"] = value
        elif key_n == "portfolio":
            out["portfolio"] = value
        elif key_n in {"location", "city"}:
            out["location"] = value
        elif key_n in {"skills", "skill"}:
            out["skills"] = [s.strip() for s in re.split(r"[,;|]", value) if s.strip()]
    return out


def _apply_kv_overrides(evidence: dict[str, Any], kv: dict[str, Any]) -> dict[str, Any]:
    """Apply key:value overrides from additional_information onto evidence."""
    if not kv:
        return evidence
    out = dict(evidence)
    if kv.get("full_name"):
        out["full_name"] = kv["full_name"]
    contact = dict(out.get("contact") or {})
    for key in ("email", "phone", "linkedin", "github", "portfolio", "location"):
        if kv.get(key):
            contact[key] = kv[key]
    out["contact"] = contact
    if kv.get("skills"):
        base_skills = list(out.get("skills") or [])
        seen: set[str] = set()
        merged: list[str] = []
        for skill in list(kv["skills"]) + base_skills:
            key = skill.lower()
            if key not in seen:
                seen.add(key)
                merged.append(skill)
        out["skills"] = merged
    return out


def _parse_evidence_from_text(text: str) -> dict[str, Any]:
    emails = find_emails(text)
    phones = find_phones(text)
    urls = find_urls(text)

    linkedin = next((u for u in urls if _LINKEDIN_RE.search(u)), None)
    if not linkedin:
        m = _LINKEDIN_RE.search(text)
        linkedin = m.group(0) if m else None

    github = next((u for u in urls if _GITHUB_RE.search(u)), None)
    if not github:
        m = _GITHUB_RE.search(text)
        github = m.group(0) if m else None

    portfolio = None
    for u in urls:
        low = u.lower()
        if "linkedin" in low or "github" in low:
            continue
        portfolio = u
        break

    name = extract_name_heuristic(text)
    skills = _extract_skills_section(text)
    experience = _extract_experience(text)
    education = _extract_education(text)
    projects = _extract_projects(text)
    summary = _extract_summary(text)

    return {
        "full_name": name,
        "contact": {
            "email": emails[0] if emails else None,
            "phone": phones[0] if phones else None,
            "linkedin": linkedin,
            "github": github,
            "portfolio": portfolio,
        },
        "skills": skills,
        "experience": experience,
        "education": education,
        "professional_summary": summary,
        "projects": projects,
        "certifications": [],
        "spoken_languages": [],
    }


def _section_body(text: str, headers: tuple[str, ...]) -> str | None:
    pattern = re.compile(
        rf"^(?:#+\s*)?(?:{'|'.join(headers)})\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        return None
    start = match.end()
    rest = text[start:]

    # A Markdown section ends at a heading of the same or higher level. Nested
    # headings (for example individual roles under Experience) belong to it.
    heading_match = re.match(r"^(#+)", match.group(0).lstrip())
    if heading_match:
        level = len(heading_match.group(1))
        boundary = re.search(rf"^#{{1,{level}}}\s+", rest, re.MULTILINE)
        end = boundary.start() if boundary else len(rest)
        return rest[:end].strip()

    # Plain-text extraction loses DOCX heading styles. Stop only at a known
    # peer section name instead of treating every title-cased line as a header.
    known_sections = (
        "summary",
        "professional summary",
        "profile",
        "about",
        "skills",
        "technical skills",
        "core skills",
        "competencies",
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "education",
        "academic background",
        "projects",
        "certifications",
        "languages",
    )
    boundary = re.search(
        rf"^(?:{'|'.join(re.escape(value) for value in known_sections)})\s*:?[ \t]*$",
        rest,
        re.IGNORECASE | re.MULTILINE,
    )
    end = boundary.start() if boundary else len(rest)
    return rest[:end].strip()


def _extract_skills_section(text: str) -> list[str]:
    body = _section_body(text, ("skills", "technical skills", "core skills", "competencies"))
    if not body:
        # Fallback: comma-separated lines with tech-looking tokens
        return []
    tokens: list[str] = []
    for part in re.split(r"[,;\n|•\-]+", body):
        token = part.strip().strip("*").strip()
        if 1 < len(token) <= 40 and not token.lower().startswith("http"):
            tokens.append(token)
    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for t in tokens:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            out.append(t)
    return out[:40]


_EXPERIENCE_ROLE_WORD_RE = re.compile(
    r"\b(?:Engineer|Analyst|Manager|Developer|Designer|Scientist|Architect|"
    r"Consultant|Specialist|Officer|Administrator|Director|Assistant|Intern|"
    r"Lead|Baker|Barista|Clerk|Guide|Programmer)\b",
    re.I,
)

_EXPERIENCE_DATE_LINE_RE = re.compile(
    r"^(?:"
    r"(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?"
    r"(?:19|20)\d{2}"
    r")"
    r"\s*(?:[-–—]|\s+to\s+)\s*"
    r"(?:"
    r"(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?"
    r"(?:(?:19|20)\d{2}|Present|Current)"
    r")\.?$",
    re.I,
)


def _is_experience_meta_line(line: str) -> bool:
    """Date ranges / locations between a role header and its bullets — not employers."""
    stripped = line.strip().strip("()[]")
    if not stripped:
        return True
    if _EXPERIENCE_DATE_LINE_RE.fullmatch(stripped):
        return True
    if re.fullmatch(
        r"(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|Present|Current)\.?",
        stripped,
        re.I,
    ):
        return True
    # "London, UK" / "New York, NY" — short place names without role vocabulary.
    if (
        "," in stripped
        and len(stripped) <= 60
        and not _EXPERIENCE_ROLE_WORD_RE.search(stripped)
        and not any(ch.isdigit() for ch in stripped)
        and " at " not in stripped.lower()
        and not re.search(r"\s+[—–\-]\s+", stripped)
    ):
        return True
    return False


def _looks_like_company_only(header: str) -> bool:
    if header.endswith((".", "!", "?", ":")):
        return False
    words = header.split()
    if not (1 <= len(words) <= 6):
        return False
    if _EXPERIENCE_ROLE_WORD_RE.search(header):
        return False
    if any(ch.isdigit() for ch in header):
        return False
    return bool(re.match(r"^[A-Z0-9]", header))


def _parse_experience_header(header: str) -> tuple[str | None, str | None]:
    """Return (company, title) from a role header, or (None, None) if not a header.

    Title-only lines return ("", title). Company-only lines return (company, None).
    """
    if _is_experience_meta_line(header):
        return None, None
    if " at " in header.lower():
        parts = re.split(r"\s+at\s+", header, maxsplit=1, flags=re.I)
        return parts[1].strip(), parts[0].strip()
    if " — " in header or " - " in header or " – " in header:
        parts = re.split(r"\s+[—–\-]\s+", header, maxsplit=1)
        if len(parts) == 2:
            left, right = (parts[0].strip(), parts[1].strip())
            # Company — Title (2020-Present) style.
            if any(ch.isdigit() for ch in right) and re.search(
                r"\b(?:19|20)\d{2}\b|present", right, re.I
            ):
                return left, right.split("(")[0].strip()
            left_is_role = bool(_EXPERIENCE_ROLE_WORD_RE.search(left))
            right_is_role = bool(_EXPERIENCE_ROLE_WORD_RE.search(right))
            if left_is_role and not right_is_role:
                return right, left  # Title — Company
            if right_is_role and not left_is_role:
                return left, right  # Company — Title
            # Ambiguous: prefer Title — Company (ATS / Base CV fixture convention).
            return right, left
    if _EXPERIENCE_ROLE_WORD_RE.search(header) and len(header) < 80:
        return "", header
    if _looks_like_company_only(header):
        return header, None
    return None, None


def _merge_experience_header_into_current(
    current: dict[str, Any],
    company: str | None,
    title: str | None,
) -> bool:
    """Fold a partial header line into an open role that has no bullets yet."""
    if current["bullets"]:
        return False
    cur_title = (current.get("title") or "").strip()
    cur_company = (current.get("company") or "").strip()
    title_missing = cur_title in ("", "Role")
    company_missing = cur_company in ("", "Unknown")

    if title and not company and title_missing:
        current["title"] = title
        return True
    if company and not title and not title_missing and (company_missing or cur_company == company):
        current["company"] = company
        return True
    if company and not title and company_missing is False and title_missing:
        # Wrapped company name continued on the next line.
        current["company"] = f"{cur_company} {company}".strip()
        return True
    if company and not title and company_missing and title_missing:
        current["company"] = company
        return True
    return False


def _extract_experience(text: str) -> list[dict[str, Any]]:
    body = _section_body(
        text,
        ("experience", "work experience", "professional experience", "employment"),
    )
    if not body:
        return []
    items: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for raw in body.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.lstrip().startswith(("-", "*", "•")):
            if current is None:
                continue
            bullet = stripped.lstrip("-*• ").strip()
            if bullet:
                current["bullets"].append(bullet)
            continue

        header = stripped.lstrip("#").lstrip("*").strip()
        if _is_experience_meta_line(header):
            continue

        company, title = _parse_experience_header(header)
        if company is None and title is None:
            continue

        if current is not None and _merge_experience_header_into_current(
            current, company or None, title
        ):
            continue

        if current is not None:
            items.append(current)

        clean_company = re.sub(r"[*#]", "", (company or "")).strip() or "Unknown"
        clean_title = re.sub(r"[*#]", "", (title or "Role")).strip() or "Role"
        current = {
            "company": clean_company,
            "title": clean_title,
            "bullets": [],
        }
    if current is not None:
        items.append(current)
    return items[:10]


def _extract_education(text: str) -> list[dict[str, Any]]:
    body = _section_body(text, ("education", "academic background"))
    if not body:
        return []
    items: list[dict[str, Any]] = []
    for line in body.splitlines():
        line = line.strip().lstrip("-*• ").strip()
        if not line:
            continue
        items.append({"institution": line.split(",")[0].strip(), "degree": line})
    return items[:5]


def _extract_projects(text: str) -> list[dict[str, Any]]:
    body = _section_body(text, ("projects", "personal projects", "side projects"))
    if not body:
        return []
    items: list[dict[str, Any]] = []
    blocks = re.split(r"\n(?=\S)", body)
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        header = lines[0].lstrip("#").lstrip("*").strip()
        bullets = [
            ln.lstrip("-*• ").strip()
            for ln in lines[1:]
            if ln.lstrip().startswith(("-", "*", "•"))
        ]
        description = None
        for ln in lines[1:]:
            if not ln.lstrip().startswith(("-", "*", "•")):
                description = ln.lstrip("*").strip()
                break
        if header:
            items.append(
                {
                    "name": re.sub(r"[*#]", "", header).strip(),
                    "description": description,
                    "bullets": bullets,
                    "technologies": [],
                }
            )
    return items[:10]


def _extract_summary(text: str) -> str | None:
    body = _section_body(text, ("summary", "professional summary", "profile", "about"))
    if body:
        return " ".join(body.split())[:600]
    return None


def _extract_keywords(jd: str) -> list[str]:
    # First-appearance order preserves JD required/preferred priority for targeting.
    stop = {
        "and", "or", "the", "a", "an", "to", "of", "in", "for", "with", "on", "at",
        "is", "are", "be", "as", "by", "we", "you", "your", "our", "will", "this",
        "that", "from", "have", "has", "been", "their", "they", "job", "role",
    }
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+.#]{1,30}", jd)
    ordered: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        low = t.lower()
        if low in stop or len(low) < 2 or low in seen:
            continue
        seen.add(low)
        ordered.append(t)
        if len(ordered) >= 40:
            break
    return ordered


_SKILL_EXPANSION_RE = re.compile(
    r"\b([A-Za-z][A-Za-z0-9+.#]*(?:\s+[A-Za-z][A-Za-z0-9+.#]*)+)\s*\(([A-Za-z0-9+.#]{2,20})\)"
)


def _extract_skill_expansions(jd: str) -> list[dict[str, str]]:
    """Pull Full Term (ACRONYM) pairs from the JD for grounded skill naming."""
    expansions: list[dict[str, str]] = []
    seen: set[str] = set()
    for full, acronym in _SKILL_EXPANSION_RE.findall(jd):
        full_n = " ".join(full.split())
        acronym_n = acronym.strip()
        key = f"{full_n.lower()}|{acronym_n.lower()}"
        if key in seen:
            continue
        seen.add(key)
        expansions.append({"full": full_n, "acronym": acronym_n})
    return expansions


_RESP_SECTION_RE = re.compile(
    r"^(?:responsibilities|key\s+responsibilities|what\s+you.?ll\s+do|"
    r"what\s+you\s+will\s+do|your\s+role|duties|essential\s+functions)\s*:?\s*$",
    re.IGNORECASE,
)
_RESP_END_RE = re.compile(
    r"^(?:requirements|qualifications|about(?:\s+us|\s+the\s+(?:job|company|role))?|"
    r"about\s+\w+|benefits|nice\s+to\s+have|preferred|must\s+have|"
    r"(?:your\s+)?skills|what\s+we\s+offer|compensation|equal\s+opportunity|"
    r"hybrid\s+working|why\s+you\s+should|make\s+it\s+real|"
    r"we\s+are\s+a\b|disability\s+confident|how\s+to\s+apply|"
    r"what\s+you.?ll\s+get|perks|location|salary)\s*:?\s*$",
    re.IGNORECASE,
)
_THEME_HEADER_RE = re.compile(
    r"^([A-Z][A-Za-z0-9][A-Za-z0-9 /&+.-]{1,48}):?\s*$"
)
_THEME_SECTION_NOISE_RE = re.compile(
    r"^(?:your\s+skills|your\s+role|about\b|why\s+you|we\s+are\b|make\s+it\s+real|"
    r"hybrid\s+working|disability\b|requirements|qualifications|benefits|"
    r"responsibilities|the\s+role|overview)\b",
    re.IGNORECASE,
)


def _extract_responsibility_themes(jd: str) -> list[str]:
    """Clear JD responsibility theme headers — targeting aids only, never facts."""
    themes: list[str] = []
    seen: set[str] = set()
    in_responsibilities = False
    for raw in jd.splitlines():
        stripped = raw.strip()
        if not stripped:
            continue
        if _RESP_SECTION_RE.match(stripped):
            in_responsibilities = True
            continue
        if in_responsibilities and _RESP_END_RE.match(stripped):
            break
        if not in_responsibilities:
            continue
        # Skip bullet/duty lines; keep short Title-Case theme headers.
        if re.match(r"^[-•*]\s+", stripped) or stripped.endswith("."):
            continue
        # Indented duty prose without a bullet marker is still not a theme header.
        if raw[:1].isspace() and not _THEME_HEADER_RE.match(stripped.rstrip(":")):
            continue
        match = _THEME_HEADER_RE.match(stripped)
        if not match:
            continue
        theme = match.group(1).rstrip(":").strip()
        if not theme or _TITLE_BOILERPLATE_RE.match(theme):
            continue
        if _THEME_SECTION_NOISE_RE.match(theme) or _RESP_END_RE.match(theme):
            continue
        words = theme.split()
        # Real JD theme labels are short noun phrases (e.g. "Data Lineage Management").
        if not (1 <= len(words) <= 4):
            continue
        if words[0].lower() in {"we", "you", "your", "our", "why", "about", "the"}:
            continue
        key = theme.lower()
        if key in seen:
            continue
        seen.add(key)
        themes.append(theme)
        if len(themes) >= 8:
            break
    return themes


_TITLE_BOILERPLATE_RE = re.compile(
    r"^(?:about(?:\s+the)?\s+job.*|overview|description|job\s+description|"
    r"position\s+overview|your\s+role|the\s+role|responsibilities|requirements|"
    r"essential\s+functions|hybrid\s+working|about\s+us|who\s+we\s+are)\s*:?\s*$",
    re.IGNORECASE,
)

_TITLE_MARKETING_RE = re.compile(
    r"(?:!|\||"
    r"^(?:join|we(?:'re| are)|looking for|remote|full[\s-]?time|part[\s-]?time|"
    r"about\b|why\s+you|make\s+it|hybrid|earn\b|apply\b|hiring)\b)",
    re.IGNORECASE,
)

_ROLE_PHRASE_RE = re.compile(
    r"\b("
    r"(?:(?:Senior|Junior|Staff|Principal|Lead|IT)\s+)?"
    r"[A-Z][A-Za-z0-9+/#.&'-]*(?:\s+[A-Z][A-Za-z0-9+/#.&'-]*){0,5}\s*"
    r"(?:Engineer|Analyst|Manager|Developer|Designer|Scientist|Architect|"
    r"Consultant|Specialist|Officer|Administrator|Director)\d*"
    r")\b"
)


def _guess_title(jd: str) -> str | None:
    """Best-effort JD role title for targeting — never a candidate fact source."""
    lines = [ln.strip() for ln in jd.strip().splitlines() if ln.strip()]

    labeled = re.search(
        r"(?m)^(?:job\s+)?(?:title|position|role)\s*[:=]\s*(.+)$",
        jd,
        re.I,
    )
    if labeled:
        candidate = labeled.group(1).strip()[:80]
        if (
            candidate
            and not _TITLE_BOILERPLATE_RE.match(candidate)
            and not _TITLE_MARKETING_RE.search(candidate)
        ):
            return candidate

    for line in lines[:15]:
        if _TITLE_BOILERPLATE_RE.match(line):
            continue
        match = _ROLE_PHRASE_RE.search(line[:160])
        if match:
            return match.group(1).strip()[:80]

    # Last resort: short line that looks like a job title, not marketing copy.
    for line in lines[:15]:
        if _TITLE_BOILERPLATE_RE.match(line):
            continue
        if _TITLE_MARKETING_RE.search(line):
            continue
        if 3 < len(line) < 80 and not line.endswith((".", "!", "?")):
            if _EXPERIENCE_ROLE_WORD_RE.search(line):
                return line[:80]
    return None


def _resolve_output_language(jd: str, additional: str) -> tuple[str, bool]:
    # Explicit override in additional_information
    if additional:
        m = _OVERRIDE_LANG_RE.search(additional)
        if m:
            return m.group(1).lower()[:5], False
        # Phrases like "write the CV in Spanish"
        for code, words in (
            ("es", ("spanish", "español", "espanol")),
            ("en", ("english", "inglés", "ingles")),
            ("fr", ("french", "français", "francais")),
            ("de", ("german", "deutsch")),
            ("pt", ("portuguese", "português", "portugues")),
        ):
            if re.search(rf"\b(?:in|en|in)\s+(?:{'|'.join(words)})\b", additional, re.I):
                return code, False

    scores: dict[str, int] = {code: 0 for code in _LANG_HINTS}
    lower = jd.lower()
    for code, hints in _LANG_HINTS.items():
        for h in hints:
            if h in lower:
                scores[code] += 1

    best = max(scores, key=lambda c: scores[c])
    best_score = scores[best]
    second = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0

    if best_score == 0:
        # Default English if JD is mostly ASCII Latin without clear signals
        if re.search(r"[A-Za-z]{20,}", jd):
            return "en", False
        return "en", True

    if best_score == second:
        return best, True

    return best, False
