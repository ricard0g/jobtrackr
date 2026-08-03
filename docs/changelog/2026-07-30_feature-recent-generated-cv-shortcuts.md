## `2026-07-30` — Add Recent Generated CV shortcuts

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users commonly need their newest outputs, but the redesigned table still required scanning or sorting the full library before opening them. Recent files also needed to remain useful when the main table was loading or unavailable.

### Solution

Added an independently loaded Recent files panel containing up to five Generated CVs in newest-first order. Each compact card shows the full filename, localized creation date, and file size and opens the shared preview with pointer or keyboard input.

### What Changed

- Added five newest-first Generated CV shortcuts above the main table
- Supported preview activation by click, Enter, and Space
- Added independent loading skeletons, retry, error, and empty states
- Linked the empty state to Generate so users can create their first file
- Refined card density and metadata layout without coupling it to table sorting

### Impact

Users can open their latest Generated CVs immediately, even when the full Generated CV table cannot load.
