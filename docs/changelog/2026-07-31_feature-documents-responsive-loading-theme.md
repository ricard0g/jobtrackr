## `2026-07-31` — Finish responsive loading and visual fidelity for Documents

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The redesigned route still shifted as data loaded and its dense tables and Recent cards did not fit naturally on narrow screens. Reused gray values also made the approved panel, table, and tab surfaces difficult to maintain consistently.

### Solution

Added layout-stable skeleton and placeholder rows, horizontal overflow for semantic tables, and a scrolling Recent strip that becomes a five-column grid at wider breakpoints. Named Documents surface and shadow tokens now reproduce the intended visual hierarchy without scattering one-off colors.

### What Changed

- Added five Recent card skeletons and ten table-row skeletons during initial loading
- Reserved ten table rows when a page has fewer results to prevent layout jumps
- Kept the Base CV upload area visible while its library loads
- Made tables horizontally scrollable and Recent cards swipeable on narrow screens
- Added named panel, table, tab-track, and Recent shadow theme tokens

### Impact

Documents now loads without disruptive shifts and retains its full hierarchy and functionality across narrow and wide screens.
