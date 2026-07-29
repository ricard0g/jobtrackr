## `2026-07-25` — Adopt Generated CV in public contracts

**Type:** `refactor`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The product called generated documents “Application CVs” in public API and web contracts, even though users know them as Generated CVs. This mismatch made the feature language harder to understand and maintain.

### Solution

Renamed the public routes, DTOs, client types, and mock data to Generated CV while preserving the existing persistence names. An architecture decision records the boundary so the database does not need a risky rename.

### What Changed

- Renamed the public controller, DTOs, and frontend types to Generated CV
- Updated API routes, client calls, mocks, and Generate screen contracts
- Preserved the existing Application CV persistence model
- Added controller coverage and documented the naming decision

### Impact

Users and developers now see consistent Generated CV terminology across the API and web application.
