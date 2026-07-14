***

## `2026-07-13` — Inline tag creation added to tag multiselect

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Users had to leave the tag selector to create a tag that did not yet exist.

### Solution

Added inline tag creation to the multi-select and updated application route data to refresh selections.

### What Changed

- Added inline tag creation to the combobox.
- Updated tag multiselect tests.
- Updated application detail and route data integration.

### Impact

Users can create and apply a new tag without leaving the application view.
