***

## `2026-07-10` — Interview outcome PATCH endpoint added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed to update the result of an interview without replacing the complete interview record.

### Solution

Added an outcome-specific PATCH request across the API, frontend client, mocks, and application-detail data flow.

### What Changed

- Added an interview outcome patch request DTO and endpoint support.
- Updated interview service, repository, and controller tests.
- Updated frontend API client, mocks, types, and detail route.

### Impact

Users can record interview outcomes directly from the application workflow.
