***

## `2026-07-10` — Tag-mode dialog max-height behavior simplified

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

A fixed height made the tag dialog less adaptive across viewport sizes.

### Solution

Replaced the fixed tag-mode dialog height with a maximum-height layout rule.

### What Changed

- Removed fixed tag-mode height constraints.
- Applied maximum-height behavior.
- Kept the dialog responsive to viewport changes.

### Impact

The tag dialog adapts better to different screen heights.
