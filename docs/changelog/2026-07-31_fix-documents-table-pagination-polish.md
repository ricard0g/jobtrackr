## `2026-07-31` — Polish Documents tables and pagination

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The first redesigned tables felt vertically loose and constrained by the earlier page canvas. Pagination labels and optimistic totals could also become confusing while retries, page changes, or deletions were revalidating data.

### Solution

Widened the Documents canvas, tightened rows and surrounding spacing, and changed pagination feedback to simple current-page and total-page counts. Generated CV retries and optimistic totals now preserve the intended page state until authoritative data returns.

### What Changed

- Widened the library layout and reduced unnecessary vertical density
- Replaced document result ranges with current-page and page-count labels
- Fixed Generated CV Retry behavior and optimistic total calculations
- Kept page labels in range when deletion removes the final row
- Preserved the selected Generated CV page through revalidation

### Impact

The redesigned library is easier to scan and its pagination stays stable during common loading and deletion transitions.
