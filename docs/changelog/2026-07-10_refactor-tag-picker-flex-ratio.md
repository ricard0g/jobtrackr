***

## `2026-07-10` — Tag picker height split uses flex ratios

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Percentage-based height allocation was brittle in the responsive dialog.

### Solution

Replaced percentage sizing with flex ratios for the tag list and actions.

### What Changed

- Removed percentage-based picker sizing.
- Applied flex-ratio layout rules.
- Preserved the tag-list and action allocation.

### Impact

The tag picker scales more predictably across devices.
