***

## `2026-06-05` — Nested interview CRUD added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Applications needed interview tracking so users could manage interview steps directly under a job application. The API needed to enforce ownership without repeatedly loading full user and application records.

### Solution

Added nested interview list, create, get, and delete workflows under user applications. Repository methods were optimized with lightweight ownership checks and single-query retrieval or deletion paths.

### What Changed

- Added `InterviewController`, `InterviewService`, and `InterviewRepository`
- Added interview create and response DTOs
- Added interview not-found handling
- Extended application repository ownership checks
- Added `InterviewControllerTest` coverage

### Impact

Users can now manage interviews as part of each tracked job application.
