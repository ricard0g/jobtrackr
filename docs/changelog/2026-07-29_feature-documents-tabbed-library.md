## `2026-07-29` — Redesign Documents as a URL-backed tabbed library

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Base CVs and Generated CVs shared one long Documents view, making the two libraries difficult to scan and navigate independently. The screen also had no durable URL state, so a selected library, page, or order could not be bookmarked or restored with browser history.

### Solution

Rebuilt Documents around accessible Generated CVs and Base CVs tabs whose active tab, page, sort key, and direction live in the query string. Invalid or incomplete query parameters are replaced with safe canonical defaults, and each tab restores its own default table state when selected.

### What Changed

- Made Generated CVs the default tab and added a dedicated Base CVs panel
- Added keyboard-operable tabs with clear active, focus, and responsive states
- Stored tab, page, sort, and direction in canonical URL parameters
- Reset destination state on tab changes while preserving browser back/forward navigation
- Refined the tab track, library spacing, and active-tab visual hierarchy

### Impact

Users can move between focused document libraries, share or revisit an exact Documents view, and navigate it reliably with a keyboard or browser history.
