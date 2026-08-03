## `2026-07-29` — Complete Generated CV library actions

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The redesigned table needed complete document actions without making the filename or entire row behave unexpectedly. Those actions also needed clear pending, confirmation, failure, and small-screen behavior.

### Solution

Added explicit Open Application, Preview, Download, and Delete controls to every Generated CV row. Desktop icon controls use accessible labels and tooltips, while narrow layouts use a row-scoped action menu; downloads and deletes report progress or failure without blocking unrelated rows.

### What Changed

- Kept rows and filename cells inert until a user chooses an explicit action
- Added Open Application navigation plus the existing multi-format preview flow
- Added row-scoped download progress and failure toasts
- Added document-specific permanent-delete confirmation and error recovery
- Preserved usable action states in the compact mobile menu

### Impact

Users can safely act on the intended Generated CV with consistent feedback across desktop and mobile layouts.
