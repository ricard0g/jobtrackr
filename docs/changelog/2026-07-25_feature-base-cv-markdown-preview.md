## `2026-07-25` — Preview Base CV Markdown safely in Documents

**Type:** `feature`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Markdown Base CVs still could not be inspected from Documents after PDF preview support was added. Rendering user-authored Markdown also required safeguards against unsafe HTML and links.

### Solution

The preview endpoint now streams Markdown as UTF-8 text with private no-store headers. A shared dialog renders GitHub-flavored Markdown without raw HTML and applies safe behavior to external links.

### What Changed

- Added ownership-checked Markdown preview responses
- Declared UTF-8 Markdown content and disabled browser caching
- Added a GitHub-flavored Markdown viewer
- Suppressed raw HTML and secured external links
- Added service, controller, mock, and route coverage

### Impact

Users can now read Markdown Base CVs in Documents without exposing the application to unsafe embedded content.
