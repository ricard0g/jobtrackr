***

## `2026-06-04` — User-scoped application endpoints added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The core product needed users to track job applications tied to their account. The API also needed to validate application data such as salary ranges and optional tag assignments.

### Solution

Added user-scoped application list, get, create, and delete endpoints. Responses include nested company and tag data, while creation validates ownership, salary range rules, and optional tag selection.

### What Changed

- Added `ApplicationController` and `ApplicationService`
- Added application create and response DTOs
- Added application not-found and invalid salary range exceptions
- Extended application and tag repositories for lookup flows
- Added `ApplicationControllerTest` coverage

### Impact

Users can now create, view, list, and delete their own job applications.
