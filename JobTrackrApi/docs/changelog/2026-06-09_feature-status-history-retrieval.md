***

## `2026-06-09` — Application status history retrieval added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users could record application status changes, but there was no API flow to view the historical timeline for a specific application. This made it harder to understand how an application progressed over time.

### Solution

Added status history retrieval for applications through the controller, service, and repository layers. The service now verifies the application belongs to the user before returning history records, and a response DTO exposes the relevant status history data.

### What Changed

- Added a GET endpoint to fetch an application's status history
- Added `StatusHistoryResponseDto`
- Added repository lookup by application and user IDs
- Added service validation before returning status history
- Added controller and service tests for success and not-found scenarios

### Impact

Users can now review the full status timeline for an application from the API.
