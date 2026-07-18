"""PDF renderer via WeasyPrint HTML — single-column ATS-safe template."""

from __future__ import annotations

import html

from cv_generation.models.canonical_cv import CanonicalCV
from cv_generation.models.errors import ErrorCode, ServiceError


def _esc(value: str | None) -> str:
    return html.escape(value or "", quote=True)


def render_pdf(cv: CanonicalCV) -> bytes:
    body = _to_html(cv)
    try:
        from weasyprint import HTML
    except ImportError as exc:
        raise ServiceError(
            ErrorCode.INTERNAL_ERROR,
            "WeasyPrint is not available",
        ) from exc

    try:
        return HTML(string=body).write_pdf()
    except Exception as exc:  # noqa: BLE001
        raise ServiceError(
            ErrorCode.INTERNAL_ERROR,
            f"PDF rendering failed: {exc}",
        ) from exc


def _to_html(cv: CanonicalCV) -> str:
    contact_bits = [
        _esc(v)
        for v in (
            cv.contact.email,
            cv.contact.phone,
            cv.contact.location,
            cv.contact.linkedin,
            cv.contact.github,
            cv.contact.portfolio,
        )
        if v
    ]
    contact_html = " · ".join(contact_bits)

    sections: list[str] = [
        f"<h1>{_esc(cv.full_name)}</h1>",
        f"<p class='contact'>{contact_html}</p>",
    ]

    if cv.professional_summary:
        sections.append("<h2>Summary</h2>")
        sections.append(f"<p>{_esc(cv.professional_summary)}</p>")

    if cv.skills:
        sections.append("<h2>Skills</h2>")
        sections.append(f"<p>{_esc(', '.join(cv.skills))}</p>")

    if cv.experience:
        sections.append("<h2>Experience</h2>")
        for exp in cv.experience:
            dates = " – ".join(filter(None, [exp.start_date, exp.end_date]))
            header = f"{_esc(exp.title)} — {_esc(exp.company)}"
            if dates:
                header = f"{header} ({_esc(dates)})"
            sections.append(f"<h3>{header}</h3>")
            if exp.location:
                sections.append(f"<p class='meta'>{_esc(exp.location)}</p>")
            if exp.bullets:
                sections.append("<ul>")
                for b in exp.bullets:
                    sections.append(f"<li>{_esc(b)}</li>")
                sections.append("</ul>")

    if cv.education:
        sections.append("<h2>Education</h2>")
        for edu in cv.education:
            sections.append(f"<h3>{_esc(edu.degree or edu.institution)}</h3>")
            if edu.degree and edu.institution:
                sections.append(f"<p>{_esc(edu.institution)}</p>")

    if cv.projects:
        sections.append("<h2>Projects</h2>")
        for proj in cv.projects:
            sections.append(f"<h3>{_esc(proj.name)}</h3>")
            if proj.description:
                sections.append(f"<p>{_esc(proj.description)}</p>")

    if cv.certifications:
        sections.append("<h2>Certifications</h2><ul>")
        for cert in cv.certifications:
            sections.append(f"<li>{_esc(cert)}</li>")
        sections.append("</ul>")

    if cv.languages:
        sections.append("<h2>Languages</h2>")
        sections.append(f"<p>{_esc(', '.join(cv.languages))}</p>")

    css = """
    @page { size: A4; margin: 1.6cm; }
    body {
      font-family: DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.35;
      color: #111;
    }
    h1 { font-size: 18pt; margin: 0 0 4pt 0; }
    h2 {
      font-size: 11pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #333;
      margin: 12pt 0 6pt 0;
      padding-bottom: 2pt;
    }
    h3 { font-size: 10.5pt; margin: 8pt 0 2pt 0; }
    p { margin: 0 0 4pt 0; }
    .contact { font-size: 9.5pt; color: #333; }
    .meta { font-size: 9.5pt; color: #444; font-style: italic; }
    ul { margin: 2pt 0 6pt 1.1em; padding: 0; }
    li { margin: 0 0 2pt 0; }
    """

    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{css}</style></head><body>"
        + "".join(sections)
        + "</body></html>"
    )
