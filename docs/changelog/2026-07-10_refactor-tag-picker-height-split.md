***

## `2026-07-10` — Tag picker uses content-and-actions height split

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Tag list content and action buttons competed for vertical space.

### Solution

Allocated the picker height between the tag list and actions using an 80/20 split.

### What Changed

- Assigned most picker height to the tag list.
- Reserved space for action buttons.
- Updated responsive tag-picker layout.

### Impact

Users can see more tags while keeping actions available.
