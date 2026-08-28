***

## `2026-08-20` — Serve JobTrackr through a frontend Nginx container

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The React app still ran only on the host with Vite. A VPS or full Compose stack had no production frontend image that could serve the SPA, survive a nested-route refresh, and call the real API without exposing Spring Boot directly.

### Solution

Added a multi-stage frontend image that type-checks, builds a same-origin production bundle, and serves it with Nginx. Nginx caches hashed assets, returns the application shell for React Router paths, and proxies `/api/v1` to the backend over the private Compose network while preserving forwarded host and HTTPS headers.

### What Changed

- Added `jobtrackr-web/Dockerfile`, Nginx runtime config, and a `full`-profile `frontend` Compose service
- Baked `VITE_API_MOCKING=false` and an empty `VITE_API_ORIGIN` so the bundle never embeds a hostname or secret
- Added a container-network smoke test for health, static files, SPA fallback, and CSRF through Nginx
- Replaced the generic Vite scaffold README with project-specific host and container guidance

### Impact

Operators can serve JobTrackr from one frontend container while contributors keep the fast host-run Vite workflow.
