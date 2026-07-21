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
    deterministic_hints = _parse_evidence_from_text(text)
    interpreted = provider.interpret_base_cv(
        extracted_text=text,
        deterministic_hints=deterministic_hints,
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
    evidence["raw_text"] = f"{raw}\n\n# Additional Information\n{additional}".strip()

    override = _parse_evidence_from_text(additional)
    kv = _parse_kv_overrides(additional)

    if kv.get("full_name"):
        evidence["full_name"] = kv["full_name"]
    elif override.get("full_name"):
        evidence["full_name"] = override["full_name"]

    contact = dict(evidence.get("contact") or {})
    for key in ("email", "phone", "linkedin", "github", "portfolio", "location"):
        if kv.get(key):
            contact[key] = kv[key]
        elif override.get("contact", {}).get(key):
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

    return {
        "jd_analysis": {
            "keywords": keywords,
            "target_title": target_title,
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
            "Base CV text was extracted, but no experience, education, or projects could be structured",
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
    revision_count = int(state.get("revision_count") or 0)
    max_revisions = int(state.get("max_revisions") or 2)
    needs = bool(issues) and revision_count < max_revisions
    if issues and not needs:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "; ".join(issues[:5]),
            details={"issues": issues},
        )
    return {
        "validation_issues": issues,
        "needs_revision": needs,
    }


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
        "projects": [],
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


def _extract_experience(text: str) -> list[dict[str, Any]]:
    body = _section_body(
        text,
        ("experience", "work experience", "professional experience", "employment"),
    )
    if not body:
        return []
    items: list[dict[str, Any]] = []
    # Lines like: Company — Title (dates) or **Title** at Company
    blocks = re.split(r"\n(?=\S)", body)
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        header = lines[0].lstrip("#").lstrip("*").strip()
        company = None
        title = None
        if " at " in header.lower():
            parts = re.split(r"\s+at\s+", header, maxsplit=1, flags=re.I)
            title, company = parts[0].strip(), parts[1].strip()
        elif " — " in header or " - " in header or " – " in header:
            parts = re.split(r"\s+[—–\-]\s+", header, maxsplit=1)
            if len(parts) == 2:
                left, right = parts
                # Heuristic: company first or title first
                if any(c.isdigit() for c in right):
                    company, title = left, right.split("(")[0].strip()
                else:
                    company, title = left, right
        else:
            company = header
            title = lines[1] if len(lines) > 1 else "Role"

        bullets = [
            ln.lstrip("-*• ").strip()
            for ln in lines[1:]
            if ln.lstrip().startswith(("-", "*", "•"))
        ]
        if company:
            items.append(
                {
                    "company": re.sub(r"[*#]", "", company).strip(),
                    "title": re.sub(r"[*#]", "", title or "Role").strip(),
                    "bullets": bullets,
                }
            )
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


def _extract_summary(text: str) -> str | None:
    body = _section_body(text, ("summary", "professional summary", "profile", "about"))
    if body:
        return " ".join(body.split())[:600]
    return None


def _extract_keywords(jd: str) -> list[str]:
    # Simple token frequency for targeting
    stop = {
        "and", "or", "the", "a", "an", "to", "of", "in", "for", "with", "on", "at",
        "is", "are", "be", "as", "by", "we", "you", "your", "our", "will", "this",
        "that", "from", "have", "has", "been", "their", "they", "job", "role",
    }
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+.#]{1,30}", jd)
    freq: dict[str, int] = {}
    for t in tokens:
        low = t.lower()
        if low in stop or len(low) < 2:
            continue
        freq[t] = freq.get(t, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0].lower()))
    return [k for k, _ in ranked[:40]]


def _guess_title(jd: str) -> str | None:
    first_line = jd.strip().splitlines()[0].strip() if jd.strip() else ""
    if 3 < len(first_line) < 80:
        return first_line
    m = re.search(r"(?:title|position|role)\s*[:=]\s*(.+)", jd, re.I)
    if m:
        return m.group(1).strip()[:80]
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
