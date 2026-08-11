# JobTrackr

JobTrackr helps candidates manage job applications and produce truthful, role-tailored CVs from reusable source material.

## Language

**Application**:
A tracked job pursuit for a specific role at a company, including status, interviews, and related Generated CVs.
_Avoid_: Postulation, job entry, listing

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
The file representation of a Generated CV, such as PDF, DOCX, or Markdown. Section order and selected content stay the same across formats. DOCX matches the ATS resume template styles exactly; PDF and Markdown match those styles as closely as the medium allows.
_Avoid_: Template, layout, format-specific section structure

**ATS Structure**:
The fixed section order and presentation contract for a Generated CV. Always-on core: Professional Summary, Experience, Education, Skills. Conditional trailing order when present: Awards/Volunteer, then Projects, Certifications, Languages, then Values Alignment. Presentation (alignment, weights, labels, fonts) follows the project's ATS resume template. Structure and presentation are enforced deterministically in schema and renderers; content selection follows Grounded Tailoring in drafting.
_Avoid_: Fancy layout, Canva template, free-form sections, prompt-only layout

**Grounded Tailoring**:
Drafting that reorders, emphasizes, and may adopt job-description phrasing only when Candidate Evidence already supports the underlying fact. It does not invent employers, metrics, skills, or duties. Quantified results appear only when the number exists in Candidate Evidence.
_Avoid_: Keyword stuffing, verbatim paste without evidence, loose title matching, estimated metrics
