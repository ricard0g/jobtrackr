***

## `2026-07-04` — Global technology companies and user-scoped companies added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users needed useful company choices before creating personal company records, while retaining ownership boundaries.

### Solution

Added company ownership support, a global-company seed migration, and API behavior that distinguishes global from personal companies.

### What Changed

- Added migrations for optional company owners and global technology company data.
- Updated company models, queries, and responses for global visibility.
- Added company logo utilities and coverage for scoped company behavior.

### Impact

Users can select shared companies while keeping their own company data private.
