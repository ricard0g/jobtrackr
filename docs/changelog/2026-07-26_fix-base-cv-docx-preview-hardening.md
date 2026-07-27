## `2026-07-26` — Harden DOCX preview conversion and cleanup

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

DOCX conversion needed a response-size boundary to prevent oversized PDFs from consuming excessive memory. Cached previews also needed cleanup when their source Base CV was deleted.

### Solution

Gotenberg responses are now streamed with a configurable 15 MB limit and fail safely when exceeded. Deleting a Base CV schedules best-effort cache removal, and a standalone script makes local Gotenberg development easier.

### What Changed

- Added a configurable maximum converted PDF size
- Stopped and rejected oversized Gotenberg responses
- Scheduled preview-cache cleanup after Base CV deletion
- Added regression coverage for response limits and cleanup
- Added a standalone local Gotenberg startup script

### Impact

DOCX previews now have safer resource limits and no longer leave unnecessary cached PDFs after source deletion.
