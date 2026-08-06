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
    c = cv.contact
    contact_bits = [_esc(v) for v in (c.phone, c.email, c.location, c.linkedin, c.github) if v]
    contact_html = " | ".join(contact_bits)

    sections: list[str] = [
        f"<h1>{_esc(cv.full_name)}</h1>",
    ]
    if contact_html:
        sections.append(f"<p class='contact'>{contact_html}</p>")
    if c.portfolio:
        sections.append(f"<p class='contact'>{_esc(c.portfolio)}</p>")

    # Professional Summary is always present in ATS Structure.
    sections.append("<h2>Professional Summary</h2>")
    sections.append(f"<p>{_esc((cv.professional_summary or '').strip())}</p>")

    if cv.experience:
        sections.append("<h2>Experience</h2>")
        for exp in cv.experience:
            dates = " - ".join(filter(None, [exp.start_date, exp.end_date]))
            header = f"{_esc(exp.title)}, {_esc(exp.company)}"
            if dates:
                header = f"{header}<span class='dates'>{_esc(dates)}</span>"
            sections.append(f"<h3>{header}</h3>")
            if exp.location:
                sections.append(f"<p class='meta'>{_esc(exp.location)}</p>")
            if exp.bullets:
                sections.append("<ul>")
                for b in exp.bullets:
                    sections.append(f"<li>{_esc(b)}</li>")
                sections.append("</ul>")
            for group in exp.bullet_groups:
                sections.append(f"<p class='theme'>{_esc(group.heading)}</p>")
                if group.bullets:
                    sections.append("<ul>")
                    for b in group.bullets:
                        sections.append(f"<li>{_esc(b)}</li>")
                    sections.append("</ul>")

    if cv.education:
        sections.append("<h2>Education</h2>")
        for edu in cv.education:
            degree_bits = [bit for bit in (edu.degree, edu.field) if bit]
            label = ", ".join(degree_bits) if degree_bits else edu.institution
            completion = edu.end_date or ""
            heading = _esc(label)
            if completion:
                heading = f"{heading}<span class='dates'>{_esc(completion)}</span>"
            sections.append(f"<h3>{heading}</h3>")
            if degree_bits and edu.institution:
                sections.append(f"<p>{_esc(edu.institution)}</p>")
            if edu.details:
                sections.append("<ul>")
                for detail in edu.details:
                    sections.append(f"<li>{_esc(detail)}</li>")
                sections.append("</ul>")

    if cv.skills:
        sections.append("<h2>Skills</h2>")
        sections.append(f"<p>{_esc(', '.join(cv.skills))}</p>")

    if cv.awards:
        sections.append("<h2>Awards/Volunteer</h2>")
        for award in cv.awards:
            line = _esc(award.title)
            if award.date:
                line = f"{line}<span class='dates'>{_esc(award.date)}</span>"
            sections.append(f"<p class='dated'>{line}</p>")

    if cv.projects:
        sections.append("<h2>Projects</h2>")
        for proj in cv.projects:
            sections.append(f"<h3>{_esc(proj.name)}</h3>")
            if proj.description:
                sections.append(f"<p>{_esc(proj.description)}</p>")
            if proj.bullets:
                sections.append("<ul>")
                for b in proj.bullets:
                    sections.append(f"<li>{_esc(b)}</li>")
                sections.append("</ul>")

    if cv.certifications:
        sections.append("<h2>Certifications</h2><ul>")
        for cert in cv.certifications:
            sections.append(f"<li>{_esc(cert)}</li>")
        sections.append("</ul>")

    if cv.languages:
        sections.append("<h2>Languages</h2>")
        sections.append(f"<p>{_esc(', '.join(cv.languages))}</p>")

    if cv.values_alignment:
        sections.append("<h2>Values Alignment</h2>")
        for item in cv.values_alignment:
            sections.append(
                f"<p><strong>{_esc(item.value)}</strong> — {_esc(item.behaviour)}</p>"
            )

    css = """
    @page { size: Letter; margin: 1in; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.15;
      color: #111;
      margin: 0;
    }
    h1 {
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
      margin: 0 0 2pt 0;
    }
    h2 {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 8pt 0 2pt 0;
    }
    h3 {
      font-size: 11pt;
      font-weight: bold;
      font-style: italic;
      margin: 4pt 0 1pt 0;
    }
    p { margin: 0 0 2pt 0; }
    .contact { text-align: center; margin: 0 0 1pt 0; }
    .meta { font-size: 11pt; }
    .theme { font-weight: bold; margin: 3pt 0 1pt 0; }
    .dated { margin: 0 0 2pt 0; }
    .dates { float: right; font-style: italic; font-weight: bold; }
    ul { margin: 1pt 0 4pt 1.1em; padding: 0; }
    li { margin: 0 0 1pt 0; }
    """

    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{css}</style></head><body>"
        + "".join(sections)
        + "</body></html>"
    )
