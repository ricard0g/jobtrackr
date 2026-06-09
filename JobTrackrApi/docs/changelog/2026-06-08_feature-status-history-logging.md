***

## `2026-06-08` — Application status history logging added

**Type:** `feature`
**Branch:** `feature/status-history-logging`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed application status changes to be tracked over time instead of only storing the latest status. Status updates also needed stronger consistency when multiple updates happen close together.

### Solution

Added a dedicated status PATCH request flow that records each application status change through a status history service. Application retrieval for status updates now uses pessimistic locking to preserve data integrity during concurrent updates.

### What Changed

- Added application status PATCH endpoint support
- Added `ApplicationStatusPatchRequestDto`
- Added `StatusHistoryRepository` and `StatusHistoryService`
- Added pessimistic write locking for status update retrieval
- Added controller and service tests for status updates and locking behavior

### Impact

Users can now change an application status while preserving a reliable history of those changes.
