***

## `2026-07-06` — Explicit development database seed added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Local and cloud development needed a repeatable data set that was separate from production migrations.

### Solution

Added an opt-in development seed file and script, with configuration and documentation for applying it safely.

### What Changed

- Added the development SQL seed.
- Added a script to apply development seed data.
- Documented seed configuration and usage.

### Impact

Developers can initialize realistic non-production data consistently.
