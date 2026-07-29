## `2026-07-25` — Keep deleted Generated CVs deleted in mock mode

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The mock database migration could restore deleted Generated CVs after a page reload when the new collection was intentionally empty. This made deleted documents appear to come back.

### Solution

The migration now runs only when the new Generated CV collection is absent, rather than merely empty. It also removes the obsolete Application CV storage key after migration.

### What Changed

- Distinguished a missing Generated CV collection from an empty one
- Skipped legacy migration for intentionally empty libraries
- Removed leftover Application CV keys after migration
- Kept existing mock data migration compatible

### Impact

Generated CVs deleted in mock mode now remain deleted after the browser reloads.
