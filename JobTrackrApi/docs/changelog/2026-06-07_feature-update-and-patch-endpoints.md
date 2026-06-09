***

## `2026-06-07` — Update and patch endpoints added

**Type:** `feature`
**Branch:** `feature/update-patch-to-endpoints`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed to edit existing applications, companies, interviews, and tags after creation. The API also needed separate full-update and partial-update request models with validation.

### Solution

Added PUT and PATCH support across applications, companies, interviews, and tags. New request DTOs and service methods handle updates, duplicate-name checks, tag limits, and existing domain error responses.

### What Changed

- Added PUT and PATCH endpoints to application, company, interview, and tag controllers
- Added update request DTOs for applications, companies, interviews, and tags
- Added service-layer update logic and validation
- Added `TooManyApplicationTagsException`
- Expanded controller tests for update success and error scenarios

### Impact

Users can now correct and maintain existing job-tracking records without deleting and recreating them.
