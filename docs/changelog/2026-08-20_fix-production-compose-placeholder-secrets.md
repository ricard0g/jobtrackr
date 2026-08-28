***

## `2026-08-20` — Reject Compose template secrets and insecure production cookies

**Type:** `fix`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

A copied `.env.compose.example` could start the production-profile backend with public placeholder secrets, while refresh cookies defaulted to insecure on HTTP and infrastructure ports were published on all interfaces.

### Solution

Production startup now rejects documented Compose placeholders and `replace-with-` secrets. Insecure refresh cookies require an explicit override. Compose binds Postgres, CV Generation, Gotenberg, and the frontend to loopback.

### What Changed

- Extended `ProductionCredentials` for Compose example secrets and the cookie override
- Defaulted Compose `JWT_REFRESH_COOKIE_SECURE` to true and bound infrastructure host ports to `127.0.0.1`
- Stopped `./scripts/dev-full.sh` when template placeholders are still present

### Impact

An uncustomized Compose template can no longer boot a production-shaped stack with predictable credentials or all-interface database access.
