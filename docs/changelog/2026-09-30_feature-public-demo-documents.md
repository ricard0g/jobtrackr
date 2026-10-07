# Public Demo Documents and fictional Generated CV previews

Issue: #91 (parent #88)

Visitors can switch between Kanban and Documents in the public landing's demo iframe. Documents lists five Generated CVs linked to the prepared fictional Applications, with responsive, read-only Markdown previews. Native modal behavior supports keyboard dismissal, focus containment, and focus restoration. Temporary Kanban moves survive workspace navigation; reload restores prepared state.

The public CV assets were generated ahead of time using the real FastAPI/Gemini CV Generation pipeline, with the committed fictional Base CV and job descriptions. Their provenance records model/workflow headers, timestamps, sizes, and hashes. No User record or private document was used. Preview requests only load same-origin static assets; the demo has no upload, download, or generation action.

Validation: Astro typechecking, production build, browser-visible Documents and Kanban tests, desktop/mobile preview inspection, and the complete landing Playwright suite. Tests cover every asset in the landing iframe, absence of write controls and API/persistence requests, keyboard dismissal/focus restoration, and reset on reload.
