## `2026-07-29` — Add a sortable, paginated Generated CV table

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The previous Generated CV section was optimized for incremental loading rather than comparing a growing document library. Users could not order files by useful metadata or return to a stable page of results.

### Solution

Introduced a reusable semantic document table and server-side Generated CV sorting with ten results per page. The API accepts stable public sort keys and maps them to persistence fields with an ID tie-breaker, keeping pagination deterministic without exposing database names.

### What Changed

- Added sortable Name, Type, Size, Created, Version, and Company columns
- Added URL-backed ascending/descending order and Previous/Next page navigation
- Kept current rows visible but muted while a new order or page loads
- Normalized empty and out-of-range libraries to a valid page
- Isolated Generated CV loading failures so Base CV management remains available

### Impact

Users can compare, sort, and page through Generated CVs predictably even as their library grows.
