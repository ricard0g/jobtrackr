## `2026-07-25` — Standardize Generated CV library pagination

**Type:** `refactor`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The first Generated CV library used a custom opaque cursor that duplicated pagination behavior already provided by Spring Data. Documents revalidation also needed to preserve pages loaded through Load More.

### Solution

Replaced the custom cursor with Spring Data `Pageable` and `Page` contracts from the repository through the web client. The Documents state now keeps incrementally loaded results stable when route data revalidates.

### What Changed

- Replaced cursor parameters with page and size parameters
- Returned standard page metadata from the Generated CV API
- Removed the custom cursor utility and its error handling
- Preserved loaded pages across Documents revalidation
- Recorded the DOCX preview cache architecture decision

### Impact

Generated CV pagination is simpler to maintain, and users no longer lose loaded results after Documents updates.
