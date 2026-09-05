# JobTrackr

JobTrackr helps candidates manage job applications and produce truthful, role-tailored CVs from reusable source material.

## Language

**User**:
A person whose applications, documents, and preferences belong to one JobTrackr profile, independent of how that person signs in.
_Avoid_: Google user, password user, account

**Primary Email**:
The read-only email address associated with a User and used for password sign-in and Identity Link matching. A provider email may change independently and does not replace it.
_Avoid_: Google email, editable email, provider subject

**Verified Email**:
A Primary Email whose ownership has been accepted from the current verification mechanism, including Google's verified-email assertion. Verification status alone never creates an Identity Link.
_Avoid_: Identity Link, automatic account match

**Sign-in Identity**:
A verified identity through which a User can enter JobTrackr. A User may retain password sign-in and have at most one Google Sign-in Identity.
_Avoid_: User, Google account, session

**Identity Link**:
The association between one Google Sign-in Identity and one User. It is created for a new User at first sign-in or explicitly by a password-reauthenticated existing User whose primary email matches Google's verified email, never inferred from that match alone.
_Avoid_: Email match, automatic merge, account merge

**Password Creation Grant**:
A five-minute, single-use server-side authorization that lets a Google-only User create a password after Google freshly proves the already linked Sign-in Identity. It contains no Google tokens and is consumed atomically when the password is created.
_Avoid_: OAuth session, refresh token, access token, password-reset token

**Account Settings**:
The routed dialog where a User manages personal details and Sign-in Identities. It is a user-interface concept, not a separate entity from User.
_Avoid_: Account entity, user administration

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

**Google Sign-In**:
A way for Google to verify a person's identity when they enter JobTrackr. JobTrackr uses only Google's stable subject and verified email, without accessing Google services or importing Google profile data.
_Avoid_: Google integration, Google API access, Google connection
