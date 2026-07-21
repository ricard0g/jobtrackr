## `2026-07-18` — FastAPI CV generation service added

**Type:** `feature`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

JobTrackr needed a dedicated service to turn a Base CV and job description into an ATS-ready document. The AI-facing work needed to stay isolated from the main application and be safe to run in development and CI.

### Solution

Added a stateless FastAPI service protected by a bearer service token. It runs a LangGraph workflow that extracts, drafts, validates, and renders documents, with a deterministic fake Gemini provider available for CI.

### What Changed

- Added the FastAPI CV generation service and service-token authentication
- Implemented the extract, draft, validate, and render LangGraph workflow
- Added fake-provider support for deterministic CI execution
- Added PDF, DOCX, and Markdown renderers using WeasyPrint and Python DOCX tooling

### Impact

JobTrackr now has an isolated, testable foundation for generating tailored CV documents.
