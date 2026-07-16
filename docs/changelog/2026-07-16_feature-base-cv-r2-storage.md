***

## `2026-07-16` — Base CV storage with R2 integration added

**Type:** `feature`
**Branch:** `feature/dashboard-redesign-and-r2-bucket-integration`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed a real place to upload and manage a base CV, but the old CV model and UI did not support cloud-backed document storage or downloads.

### Solution

Replaced the legacy CV model with a Base CV flow backed by Cloudflare R2, including validation, API endpoints, Flyway migration, and a Documents experience in the web app with MSW mocks.

### What Changed

- Added Base CV API (controller, service, R2 storage, validation, migration, and tests).
- Added Documents route, types, API client methods, and mock handlers in the web app.
- Updated navbar/routing and environment examples for the new documents experience.

### Impact

Users can upload, list, and download a base CV through a cloud-backed documents flow.
