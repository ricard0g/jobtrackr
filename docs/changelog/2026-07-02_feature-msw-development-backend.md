***

## `2026-07-02` — Mock Service Worker development backend added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Frontend development depended on a live API, which made isolated UI work and testing harder.

### Solution

Added Mock Service Worker configuration, handlers, seed data, and API switching support for browser-based development.

### What Changed

- Added MSW browser setup and request handlers.
- Added mock data, response builders, and type definitions.
- Added documentation and API configuration for mock mode.

### Impact

Frontend development and tests can run without a live backend.
