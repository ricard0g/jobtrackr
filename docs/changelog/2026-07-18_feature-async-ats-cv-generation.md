## `2026-07-18` — Asynchronous ATS-ready CV generation

**Type:** `feature`
**Branch:** `cursor/fix-cv-generation-review-182c`
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
- Review hardening: application-delete locking (PENDING-only cancel), upload-outside-lock finalize with compensate, lease renewal/owner checks, parallel worker concurrency, stable provider error mapping, cleanup attempt caps (V9 unique pending key), DOCX zip limits, PDF page max 2, cooperative 5m timeout, spec `extra=forbid`, stronger evidence grounding, Generate loader/MSW cascade fixes, correlation ID on failures

### Impact

Now users can queue tailored Application CVs, track Queued/Generating/Completed/Failed/Cancelled status, download signed artifacts, and delete versions without talking to the AI service directly.
