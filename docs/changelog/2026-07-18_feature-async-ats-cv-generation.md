## `2026-07-18` — Asynchronous ATS-ready CV generation

**Type:** `feature`
**Branch:** `cursor/async-ats-cv-generation-4f9d`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Users could store Base CVs and Applications, but could not turn truthful experience into an ATS-ready CV tailored to a Job Description. Generation needed to stay responsive during multi-minute AI work and keep private artifacts in R2.

### Solution

Spring now owns an async `CvGeneration` workflow with PostgreSQL-backed claiming, consent, retries, and R2 finalization. A new FastAPI LangGraph service (Gemini or deterministic fake provider) renders PDF/DOCX/Markdown. The Generate UI polls Spring only.

### What Changed

- Added Flyway V8 for `cv_generations`, remodeled `application_cvs`, AI consent, and R2 cleanup outbox
- Added Spring APIs, durable worker, FastAPI client, and generalized R2 `ObjectStorage`
- Shipped FastAPI CV service in Compose and a full Generate experience with MSW + tests

### Impact

Now users can queue tailored Application CVs, track Queued/Generating/Completed/Failed/Cancelled status, download signed artifacts, and delete versions without talking to the AI service directly.
