***

## `2026-07-02` — Kanban columns use the available board width

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Kanban columns did not fill the board reliably, leaving avoidable empty space.

### Solution

Adjusted the board and column layout rules so the workflow columns expand across the available width.

### What Changed

- Updated Kanban board layout styles.
- Updated status-column sizing behavior.
- Preserved the existing responsive column flow.

### Impact

The Kanban board uses screen space more effectively.
