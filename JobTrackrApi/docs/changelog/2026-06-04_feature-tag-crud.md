***

## `2026-06-04` — Tag CRUD endpoints added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed a way to organize applications with reusable tags. The API also needed consistent validation and error handling around tag operations.

### Solution

Added tag list, get-by-id, create, and delete endpoints under `/api/v1/tags`. The implementation introduced request and response DTOs, a tag service and repository, duplicate-name handling, not-found handling, and WebMvc coverage.

### What Changed

- Added `TagController`, `TagService`, and `TagRepository`
- Added tag create and response DTOs
- Added duplicate tag and tag-not-found exceptions
- Added global API error handling for tag workflows
- Added `TagControllerTest` coverage

### Impact

Users can now create, retrieve, list, and delete tags for organizing job applications.
