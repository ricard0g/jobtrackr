"""Markdown renderer — structure-faithful ATS template (inline dates)."""

from __future__ import annotations

from cv_generation.models.canonical_cv import CanonicalCV


def render_markdown(cv: CanonicalCV) -> bytes:
    lines: list[str] = []
    lines.append(f"# {cv.full_name}")
    lines.append("")

    c = cv.contact
    contact_bits = [v for v in (c.phone, c.email, c.location, c.linkedin, c.github) if v]
    if contact_bits:
        lines.append(" | ".join(contact_bits))
        lines.append("")
    if c.portfolio:
        lines.append(c.portfolio)
        lines.append("")

    # Professional Summary is always present in ATS Structure.
    lines.append("## PROFESSIONAL SUMMARY")
    lines.append("")
    lines.append((cv.professional_summary or "").strip())
    lines.append("")

    if cv.experience:
        lines.append("## EXPERIENCE")
        lines.append("")
        for exp in cv.experience:
            dates = " - ".join(filter(None, [exp.start_date, exp.end_date]))
            header = f"***{exp.title}, {exp.company}***"
            if dates:
                header = f"{header} ({dates})"
            lines.append(header)
            if exp.location:
                lines.append(exp.location)
            lines.append("")
            for bullet in exp.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if cv.education:
        lines.append("## EDUCATION")
        lines.append("")
        for edu in cv.education:
            degree_bits = [bit for bit in (edu.degree, edu.field) if bit]
            label = ", ".join(degree_bits) if degree_bits else edu.institution
            # ATS template uses completion date only — never a start-date fallback.
            completion = edu.end_date or ""
            header = f"***{label}***"
            if completion:
                header = f"{header} ({completion})"
            lines.append(header)
            if degree_bits and edu.institution:
                lines.append(edu.institution)
            for detail in edu.details:
                lines.append(f"- {detail}")
            lines.append("")

    if cv.skills:
        lines.append("## SKILLS")
        lines.append("")
        lines.append(", ".join(cv.skills))
        lines.append("")

    if cv.awards:
        lines.append("## AWARDS/VOLUNTEER")
        lines.append("")
        for award in cv.awards:
            line = f"***{award.title}***"
            if award.date:
                line = f"{line} ({award.date})"
            lines.append(line)
            lines.append("")

    if cv.projects:
        lines.append("## PROJECTS")
        lines.append("")
        for proj in cv.projects:
            lines.append(f"**{proj.name}**")
            if proj.description:
                lines.append(proj.description)
            for bullet in proj.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if cv.certifications:
        lines.append("## CERTIFICATIONS")
        lines.append("")
        for cert in cv.certifications:
            lines.append(f"- {cert}")
        lines.append("")

    if cv.languages:
        lines.append("## LANGUAGES")
        lines.append("")
        lines.append(", ".join(cv.languages))
        lines.append("")

    if cv.values_alignment:
        lines.append("## VALUES ALIGNMENT")
        lines.append("")
        for item in cv.values_alignment:
            lines.append(f"**{item.value}** — {item.behaviour}")
            lines.append("")

    return "\n".join(lines).encode("utf-8")
