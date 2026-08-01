# JobTrackr

JobTrackr helps candidates manage job applications and produce truthful, role-tailored CVs from reusable source material.

## Language

**Base CV**:
A user-supplied source document containing the candidate facts that may support tailored CV content.
_Avoid_: Original CV, master resume

**Candidate Evidence**:
Structured, inspectable candidate facts interpreted from a Base CV and any user-supplied additions. Candidate Evidence is established before job-specific tailoring begins.
_Avoid_: Parsed CV, raw text

**Generated CV**:
A role-tailored CV whose content has been drafted from Candidate Evidence for a specific Application. Once created, it is an independent artifact from its source Base CV.
_Avoid_: Application CV, output CV

**CV Generation**:
The creation of a Generated CV using a real drafting model. If that model is unavailable, CV Generation fails rather than returning a placeholder artifact.
_Avoid_: Export, conversion

**Output Format**:
The file representation of a Generated CV, such as PDF, DOCX, or Markdown. It changes serialization, not the Generated CV's selected content or section structure.
_Avoid_: Template, layout

**ATS Structure**:
The fixed section order and presentation contract for a Generated CV: Professional Summary, Experience, Education, Skills as the always-on core, with conditional trailing sections only when evidence supports them. Presentation (alignment, weights, labels, fonts) follows the project's ATS resume template.
_Avoid_: Fancy layout, Canva template, free-form sections

**Grounded Tailoring**:
Drafting that reorders, emphasizes, and may adopt job-description phrasing only when Candidate Evidence already supports the underlying fact. It does not invent employers, metrics, skills, or duties.
_Avoid_: Keyword stuffing, verbatim paste without evidence, loose title matching
