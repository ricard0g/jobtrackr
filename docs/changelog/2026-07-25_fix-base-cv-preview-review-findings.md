## `2026-07-25` — Resolve Base CV preview review findings

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The initial preview work could trigger extra database queries while listing Generated CVs. It also did not clearly explain why non-PDF Base CVs could not yet be previewed.

### Solution

Generated CV list associations are now fetched eagerly to prevent per-item queries. The preview dialog shows a clear PDF-only message for unsupported Base CV formats.

### What Changed

- Eager-fetched Generated CV list associations
- Prevented N+1 queries while building library results
- Added an explicit PDF-only preview message
- Added coverage for unsupported Base CV formats

### Impact

The Documents library loads more efficiently and gives users clear guidance when a file cannot be previewed.
