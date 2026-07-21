"""Markdown renderer — single-column ATS-safe template."""

from __future__ import annotations

from cv_generation.models.canonical_cv import CanonicalCV


def render_markdown(cv: CanonicalCV) -> bytes:
    lines: list[str] = []
    lines.append(f"# {cv.full_name}")
    lines.append("")

    contact_bits: list[str] = []
    c = cv.contact
    if c.email:
        contact_bits.append(c.email)
    if c.phone:
        contact_bits.append(c.phone)
    if c.location:
        contact_bits.append(c.location)
    if c.linkedin:
        contact_bits.append(c.linkedin)
    if c.github:
        contact_bits.append(c.github)
    if c.portfolio:
        contact_bits.append(c.portfolio)
    if contact_bits:
        lines.append(" | ".join(contact_bits))
        lines.append("")

    if cv.professional_summary:
        lines.append("## Summary")
        lines.append("")
        lines.append(cv.professional_summary)
        lines.append("")

    if cv.skills:
        lines.append("## Skills")
        lines.append("")
        lines.append(", ".join(cv.skills))
        lines.append("")

    if cv.experience:
        lines.append("## Experience")
        lines.append("")
        for exp in cv.experience:
            dates = " – ".join(filter(None, [exp.start_date, exp.end_date]))
            header = f"### {exp.title} — {exp.company}"
            if dates:
                header = f"{header} ({dates})"
            lines.append(header)
            if exp.location:
                lines.append(f"*{exp.location}*")
            lines.append("")
            for bullet in exp.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if cv.education:
        lines.append("## Education")
        lines.append("")
        for edu in cv.education:
            title = edu.degree or edu.institution
            lines.append(f"### {title}")
            if edu.degree and edu.institution:
                lines.append(edu.institution)
            if edu.field:
                lines.append(edu.field)
            dates = " – ".join(filter(None, [edu.start_date, edu.end_date]))
            if dates:
                lines.append(dates)
            for detail in edu.details:
                lines.append(f"- {detail}")
            lines.append("")

    if cv.projects:
        lines.append("## Projects")
        lines.append("")
        for proj in cv.projects:
            lines.append(f"### {proj.name}")
            if proj.description:
                lines.append(proj.description)
            if proj.technologies:
                lines.append(f"Technologies: {', '.join(proj.technologies)}")
            if proj.url:
                lines.append(proj.url)
            for bullet in proj.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if cv.certifications:
        lines.append("## Certifications")
        lines.append("")
        for cert in cv.certifications:
            lines.append(f"- {cert}")
        lines.append("")

    if cv.languages:
        lines.append("## Languages")
        lines.append("")
        lines.append(", ".join(cv.languages))
        lines.append("")

    return "\n".join(lines).encode("utf-8")
