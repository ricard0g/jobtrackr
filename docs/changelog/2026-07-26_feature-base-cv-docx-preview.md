## `2026-07-26` — Preview and cache Base CV DOCX files

**Type:** `feature`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

DOCX Base CVs could not be viewed from Documents because browsers cannot render them directly. Re-converting the same document for every preview would also be slow and wasteful.

### Solution

Added a dedicated Gotenberg client that converts DOCX files to PDF and caches the result in R2 at the documented preview key. The existing PDF viewer streams cached or newly converted previews through the same dialog.

### What Changed

- Added configurable Gotenberg DOCX-to-PDF conversion
- Cached converted previews in R2 object storage
- Reused the existing protected preview endpoint and PDF viewer
- Added local Gotenberg infrastructure and setup documentation
- Added configuration, conversion, storage, service, and UI tests

### Impact

Users can now preview DOCX Base CVs in Documents with faster repeat loads from the preview cache.
