***

## `2026-07-14` — Create application dialog height fixed for desktop and mobile

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The create-application dialog used a fixed viewport height on every screen size, so it felt oversized on desktop while still needing scroll room on mobile.

### Solution

Kept the mobile `dvh` height and switched desktop to content-fit height with the same max-height cap.

### What Changed

- Updated `CreatePostulationDialog` content classes to `h-[85dvh] sm:h-fit max-h-[85dvh]`.
- Preserved scroll behavior for longer forms on smaller screens.

### Impact

The create-application dialog now sizes naturally on desktop and stays usable on mobile.
