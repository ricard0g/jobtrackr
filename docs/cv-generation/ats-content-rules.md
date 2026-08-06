# Optimal ATS content rules

Durable drafting playbook for **CV Generation**. Draft and revise prompts operationalize these rules; schema, renderers, and validation enforce structure and truth bounds. This file is the long-term policy store for content strategy.

Source material used only for extraction (not policy): `docs/temporary-cv-gen-improvement-docs/` (ATS resume template cues, Indeed ATS guidance, strategy guide, application checklist). Cover letters, application-form STAR answers, salary negotiation, and apply-timing tactics appear in that pack but are **out of scope** for this playbook and for Generated CV product work.

Glossary terms match `CONTEXT.md`: **Base CV**, **Candidate Evidence**, **Generated CV**, **CV Generation**, **Output Format**, **ATS Structure**, **Grounded Tailoring**.

## Enforcement split

| Concern | Owner | Mechanism |
| --- | --- | --- |
| Section order, headings, typography, contact layout | Deterministic | Canonical CV schema + renderers + renderer tests |
| Content selection, emphasis, JD phrasing | Model under this playbook | Draft / revise prompts |
| Truth bounds (no invented facts/metrics/skills) | Deterministic | Validation against Candidate Evidence |
| Job Description role | Targeting only | JD analysis feeds ordering and phrasing cues; never candidate facts |

ATS Structure details (core order, conditional trailing order, DOCX pixel fidelity, PDF/Markdown style fidelity) live in `CONTEXT.md` and [ADR-0005](../adr/0005-enforce-ats-structure-and-grounded-tailoring.md). This playbook does not redefine layout; it defines how content is chosen and worded inside that contract.

## Grounded Tailoring (non-negotiable)

Grounded Tailoring may reorder, emphasize, densify, and adopt Job Description phrasing **only when Candidate Evidence already supports the underlying fact**.

Allowed:

- Prefer JD-relevant roles, bullets, and skills drawn from Candidate Evidence.
- Use verbatim or near-verbatim JD phrases when the fact exists in Candidate Evidence (or authoritative `additional_information`).
- Expand an evidenced skill as `Full Term (ACRONYM)` when the JD and/or evidence support that naming (e.g. Customer Relationship Management (CRM)).
- Align an Experience **title** to the posting title when that role’s duties clearly match.
- Group Experience bullets under optional theme headings that mirror JD responsibility groups when evidence supports bullets under each theme; otherwise keep flat bullets.
- Include quantified results only when the number exists in Candidate Evidence or `additional_information`.

Forbidden:

- Invented employers, institutions, titles, dates, duties, skills, certifications, languages, awards, projects, or links.
- Estimated or guessed metrics (“even approximate numbers”).
- JD-only skills or keywords that are not evidenced.
- Keyword stuffing or pasting JD text without an evidenced underlying fact.
- Professional headline under the name (the ATS template has none).
- Numeric ATS match scores anywhere on the Generated CV.
- Sensitive personal attributes (age, nationality, marital status, etc.).

`additional_information` in Candidate Evidence is authoritative over conflicting Base CV facts when present. Logistics and right-to-work notes appear only when present in evidence or `additional_information` (e.g. hybrid availability, relocation, right to work)—never invented to clear objections.

## Professional Summary

- Single prose field: **2–3 grounded sentences** (not summary bullets).
- State fit for this Application using years/scope, strengths, and outcomes that exist in Candidate Evidence.
- Naturally include evidenced skill phrases that the JD also names; do not invent keywords.
- Do not compete with Experience bullets: no laundry list of every role; no fabricated metrics.

## Experience

- Prefer roughly **3–4 strong bullets** on the most JD-relevant roles; thin or omit low-signal roles without inventing history.
- Bullet shape: **action verb + what you did (detail) + reason, outcome, or quantified result** when the outcome/number is evidenced.
- Title alignment: change the Experience title toward the Job Description title **only** when duties clearly match; never invent seniority or a mismatched function.
- Theme mirroring: if the JD has clear responsibility themes and Candidate Evidence supports grouped bullets, use optional `{heading, bullets}` groups with those headings; if themes are unclear or unsupported, use flat bullets.
- Preserve real employers, date ranges, and locations from Candidate Evidence; do not fabricate gaps or employers.

## Skills

- Evidence-only: every skill on the Generated CV must appear in Candidate Evidence (structured skills or whole-phrase corpus support).
- Order JD-required / preferred matches first; drop unrelated evidence skills from the skills line so the list stays tight.
- Allow grounded `Full Term (ACRONYM)` expansion when appropriate.
- Do not infer tools or skills the candidate never evidenced, even if the JD requires them.

## Education, contact, and portfolio

- Education follows evidenced degrees, majors, institutions, and completion dates; do not invent coursework or honors.
- Contact stays plain-text at the top (centered per ATS Structure): phone, email, location as evidenced.
- Preserve LinkedIn, GitHub, and portfolio links present in Candidate Evidence in the contact/portfolio area.

## Conditional trailing content

Omit any trailing section with no supported content. When present, content still follows Grounded Tailoring:

| Section | Include when | Content rule |
| --- | --- | --- |
| Awards / Volunteer | Evidenced awards, recognitions, or volunteer work | Name + date as evidenced; no padding |
| Projects | Evidenced projects relevant enough to keep | Truthful scope; JD phrasing only if grounded |
| Certifications | Evidenced certifications | Exact names from evidence |
| Languages | Evidenced languages | Levels only if evidenced |
| Values Alignment | JD states company values **and** evidence supports concrete matching behaviours | Value label + evidenced behaviour; no empty slogans |

Trailing **order** is ATS Structure (schema/renderers), not a drafting choice.

## Output Format and ATS-safe content habits

Content selection and section meaning must be identical across DOCX, PDF, and Markdown. Presentation fidelity is an Output Format concern (DOCX pixel-faithful; PDF/Markdown as close as the medium allows).

For drafting, prefer ATS-safe wording habits drawn from the research pack (Indeed tips + strategy/checklist formatting rules that affect content choice):

- Use clear, standard section meaning under ATS Structure labels (Professional Summary, Experience, Education, Skills, …)—parsers and humans both rely on those labels.
- Weave evidenced JD keywords naturally into Professional Summary, Skills, and Experience; do not stuff.
- Prefer one- or two-word skill phrases and explicit tool names over hoping parsers infer them.
- Include both acronym and full term when grounded (`Full Term (ACRONYM)`).
- Plain language; avoid special characters that break parsers.
- Single-column layout, standard bullets, and no tables/graphics/headers/footers in rendered Output Formats (enforced by renderers; DOCX is the preferred ATS-safe Output Format when the posting allows).

## Length and one-page fit

Generated CVs must fit **one page** (US Letter, ATS template margins/typography). Prefer conversion density over completeness:

- Professional Summary: 2–3 sentences only.
- Experience: about 3–4 strong bullets on the most JD-relevant roles; thin or omit low-signal roles.
- Keep Skills to a tight JD-ordered line; omit empty trailing sections.
- If content still overflows one page, drop the least JD-relevant experience bullets and optional trailing sections before inventing brevity that removes evidenced fit.

Do not dump the full Candidate Evidence corpus onto the page.

## Pre-submit content checklist (Generated CV)

Use before accepting a draft as ready:

1. Experience titles align to the Job Description only where duties clearly match.
2. Verbatim / near-verbatim JD phrases appear only where Candidate Evidence supports the fact.
3. Experience themes mirror JD groups only when evidence supports the groups; otherwise flat bullets.
4. Metrics appear only when numbers exist in Candidate Evidence or `additional_information`.
5. Skills are evidence-only, JD-relevant first, unrelated dropped; grounded acronym expansion OK.
6. Summary is 2–3 grounded prose sentences.
7. Values Alignment present only when JD values + evidenced behaviours both exist.
8. No invented employers, skills, dates, duties, or logistics.
9. Contact/portfolio links from evidence are preserved.
10. Empty optional sections are omitted.
11. Draft fits one page under ATS Structure density rules.

## How agents and prompts should use this file

- Treat this Markdown as the content source of truth for Optimal ATS rules.
- Do not re-host raw `.docx` / `.xlsx` research files as policy; re-extract into this playbook if guidance changes.
- Structure and styles remain schema/renderer concerns; do not move layout instructions into the model as the primary enforcement path.
- Respect ADR-0001: Candidate Evidence is structured before tailoring. This playbook deepens drafting after evidence exists.
