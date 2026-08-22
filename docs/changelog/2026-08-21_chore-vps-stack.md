***

## `2026-08-21` — Deploy a private and persistent VPS stack

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Verified GHCR images existed, but a VPS still had no standalone Compose path that pulled those tags, kept PostgreSQL off the application release cycle, and published only a loopback frontend. Operators would otherwise need source checkouts, build toolchains, or accidentally expose internal services.

### Solution

A separate VPS Compose file now references immutable GHCR tags, attaches all five services to a private network, and publishes only `127.0.0.1:18080` by default. PostgreSQL uses a pre-created external volume, secrets stay least-scope, and startup fails closed when required production configuration is missing.

### What Changed

- Added `docker-compose.vps.yml`, `.env.vps.example`, and `./scripts/vps-up.sh` for first deployment
- Validated rendered VPS Compose plus environment names without printing secret values
- Added VPS smoke for loopback health, SPA and API routing, unpublished internals, and external-volume persistence

### Impact

An operator can install and verify JobTrackr on a VPS from GHCR images without building the application there, and without publishing PostgreSQL, the API, CV Generation, or Gotenberg on the host.
