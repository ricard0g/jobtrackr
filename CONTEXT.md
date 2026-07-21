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
A role-tailored CV whose content has been drafted from Candidate Evidence for a specific Application.
_Avoid_: Application CV, output CV

**CV Generation**:
The creation of a Generated CV using a real drafting model. If that model is unavailable, CV Generation fails rather than returning a placeholder artifact.
_Avoid_: Export, conversion

**Output Format**:
The file representation of a Generated CV, such as PDF, DOCX, or Markdown. It changes serialization, not the Generated CV's selected content or section structure.
_Avoid_: Template, layout
