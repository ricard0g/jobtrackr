***

## `2026-06-04` — Company controller tests added

**Type:** `chore`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Company endpoints needed automated coverage before more application workflows depended on them. Validation and domain errors also needed to be verified at the web layer.

### Solution

Added WebMvc tests for company controller success paths, validation failures, and domain error responses. The related create DTOs were also simplified by removing unnecessary JSON property annotations.

### What Changed

- Added `CompanyControllerTest`
- Covered company CRUD success responses
- Covered validation and domain error responses
- Removed redundant JSON property annotations from create request DTOs

### Impact

Company API behavior is now protected by focused controller tests.
