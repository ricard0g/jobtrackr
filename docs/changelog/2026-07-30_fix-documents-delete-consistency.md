## `2026-07-30` — Keep Recent files and pagination consistent after deletion

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Deleting a Generated CV could leave a stale copy in Recent files when an earlier retry response arrived after route revalidation. Removing the final row on a page could also display a result range beyond the new library total.

### Solution

The Recent panel now prefers freshly revalidated route data over stale retry data. The shared document table clamps its displayed page and range as totals shrink, keeping optimistic removal and authoritative loader data aligned.

### What Changed

- Preferred revalidated Recent data after Generated CV deletion
- Prevented stale Retry responses from restoring a removed shortcut
- Clamped pagination when deletion empties the current page
- Added regression coverage for both timing and pagination edge cases

### Impact

Deleted Generated CVs disappear consistently from every Documents view, and pagination remains truthful as the library shrinks.
