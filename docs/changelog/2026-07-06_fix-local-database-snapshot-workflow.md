***

## `2026-07-06` — Local database snapshot workflow corrected

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Database reset and snapshot commands did not provide a dependable local recovery flow.

### Solution

Corrected the database dump, restore, and reset scripts and documented the resulting workflow.

### What Changed

- Updated database dump script behavior.
- Updated restore and reset scripts.
- Updated the root development instructions.

### Impact

Developers can recover local database state more reliably.
