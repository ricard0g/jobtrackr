***

## `2026-07-02` — Status-column application creation presets added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Creating an application from a Kanban column required users to select the status again in the dialog.

### Solution

Connected each column’s add action to the creation dialog so it opens with that column’s status already selected.

### What Changed

- Added an add action to status columns.
- Passed the selected status into the create dialog.
- Kept the Kanban board and dialog state synchronized.

### Impact

Users can add an application directly into the intended workflow stage.
