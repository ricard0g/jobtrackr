## `2026-07-18` — Async ATS CV generation workflow delivered

**Type:** `feature`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Users could store a Base CV and application details but could not create a tailored CV for a role. Generation can take several minutes, so the product needed a durable workflow that would not block the user interface.

### Solution

Added Spring's asynchronous `CvGeneration` workflow with durable PostgreSQL claiming, explicit AI consent, R2 finalization, and Application CV APIs. Connected the FastAPI service through Compose and added a polling Generate UI with mock support and tests.

### What Changed

- Added durable `CvGeneration` records, PostgreSQL claiming, and consent handling
- Added Application CV APIs and R2 finalization for generated artifacts
- Connected the FastAPI LangGraph service through Docker Compose
- Added a polling Generate UI, MSW handlers, and test coverage

### Impact

Users can request ATS-ready CVs and monitor progress without waiting for AI processing in the browser.
