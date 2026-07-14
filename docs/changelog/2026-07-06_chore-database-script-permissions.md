***

## `2026-07-06` — Database script executable permissions restored

**Type:** `chore`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Database helper scripts could not be run directly after their executable bits were lost.

### Solution

Restored executable permissions on the local database scripts.

### What Changed

- Restored execute permission for database dump script.
- Restored execute permission for database reset script.
- Restored execute permission for database restore script.

### Impact

Database helper commands work directly from the command line.
