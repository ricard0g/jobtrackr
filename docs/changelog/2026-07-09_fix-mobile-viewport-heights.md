***

## `2026-07-09` — Mobile viewport height handling improved

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Fixed viewport-height units caused the mobile layout and Kanban columns to size poorly in mobile browsers.

### Solution

Updated app, board, card, dialog, input, and application-detail layouts to use dynamic viewport sizing.

### What Changed

- Updated app-level mobile height handling.
- Updated Kanban column and card sizing.
- Updated dialog and detail-route viewport behavior.

### Impact

The application fits mobile browser viewports more reliably.
