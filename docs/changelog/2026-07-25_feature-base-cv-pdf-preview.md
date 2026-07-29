## `2026-07-25` — Preview Base CV PDFs in Documents

**Type:** `feature`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Users had to download a Base CV to inspect its contents. This interrupted document management and made it harder to confirm which file they were about to use.

### Solution

Added an ownership-protected preview endpoint that streams PDF bytes without browser caching. Documents now opens PDFs in an accessible dialog with page, zoom, retry, and resource-cleanup behavior.

### What Changed

- Added an authenticated Base CV preview endpoint
- Returned PDF previews with private no-store headers
- Added a reusable document preview dialog
- Added PDF page navigation, zoom, retry, and loading states
- Tested API authorization and Documents preview interactions

### Impact

Users can now inspect PDF Base CVs directly from Documents without downloading them first.
