## `2026-07-25` — Add a Generated CV library to Documents

**Type:** `feature`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Generated CVs were tied to individual applications and had no user-wide place to browse them. Users needed a central library for finding, downloading, and removing their generated documents.

### Solution

Added a paginated Generated CV API and a dedicated section under Base CVs on the Documents screen. The library supports incremental loading plus existing download and delete actions.

### What Changed

- Added a user-scoped Generated CV listing endpoint
- Added pagination contracts across the API, web client, and mocks
- Rendered Generated CVs in a recessed Documents section
- Added Load More, download, and delete controls
- Covered listing and Documents interactions with tests

### Impact

Users can now manage all of their Generated CVs from one Documents library.
