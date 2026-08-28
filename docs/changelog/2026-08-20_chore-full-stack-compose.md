***

## `2026-08-20` — Start the complete five-service stack with local Compose

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Developers could start individual production-shaped images, but not the full JobTrackr application as one local Compose stack. Host-run Spring and Vite still mattered for fast iteration, while dump scripts and acceptance still assumed a hard-coded Postgres name and a Vite build variable as the test target.

### Solution

One Compose command now builds and starts frontend, backend, PostgreSQL, CV Generation, and Gotenberg from sanitized configuration. Services talk over Compose DNS, the frontend is published only on loopback, and host-run helpers still start just the infrastructure those workflows need.

### What Changed

- Published the frontend on `127.0.0.1:18080` and added `.env.compose.example` plus `./scripts/dev-full.sh`
- Pointed dump/restore at the Compose `postgres` service and kept PostgreSQL on a named volume
- Added Compose config validation, origin-based full-stack smoke with persistence, and `JOBTRACKR_APP_ORIGIN` for Documents acceptance

### Impact

A clean checkout can start the real integrated application locally without giving up the host-run Spring and Vite workflow, and without treating this path as VPS deployment.
