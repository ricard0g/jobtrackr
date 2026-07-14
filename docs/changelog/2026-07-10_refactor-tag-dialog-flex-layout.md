***

## `2026-07-10` — Tag dialog whitespace handled with flex layout

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Whitespace in tag mode made the dialog layout feel unbalanced.

### Solution

Wrapped the tag form in a flex container to distribute available space predictably.

### What Changed

- Added a flex wrapper around tag form content.
- Updated tag-mode space distribution.
- Preserved existing form behavior.

### Impact

The tag dialog has a more balanced responsive layout.
