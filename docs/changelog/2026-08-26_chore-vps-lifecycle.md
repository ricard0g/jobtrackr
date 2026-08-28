***

## `2026-08-26` — Prove updates, rollback, backup, and recovery

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The VPS stack could start from immutable GHCR images, but operators had no proven path to update, roll back, back up, or restore without risking the PostgreSQL volume or R2-backed documents. A new operator also could not find every supported workflow from the project overview.

### Solution

The VPS runbook now covers persistence, backup, restore (same and replacement VPS), update, rollback, recovery, Generated CV acceptance, and troubleshooting. Dump and restore address the Compose `postgres` service. Lifecycle smoke retags a second immutable release, recreates only changed application services, and restores a dump without deleting the external volume.

### What Changed

- Documented PostgreSQL versus R2 ownership, pre-Flyway backup, restore, update, rollback, and recovery
- Added `./scripts/vps-backup.sh`, `./scripts/vps-restore.sh`, and VPS lifecycle smoke
- Linked local development, Compose, VPS, Cloudflare routing, and operator workflows from the project overview
- Served `.mjs` assets as `application/javascript` from frontend Nginx so ES modules are not blocked

### Impact

An operator can update or roll back a JobTrackr release, take a PostgreSQL recovery point, and restore onto the same or a replacement VPS without deleting application state or R2 objects.
