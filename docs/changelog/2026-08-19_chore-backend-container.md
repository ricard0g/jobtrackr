***

## `2026-08-19` — Backend production container and embedded workers

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The API, Flyway, and background workers still ran only on the host, so a VPS or full Compose stack had no production-shaped backend image to start against PostgreSQL, CV Generation, and Gotenberg.

### Solution

Added a Java 25 multi-stage backend image that runs tests before packaging, executes as a non-root user, and starts the HTTP API plus the existing embedded workers in one process. Compose uses service DNS names; the production profile rejects missing credentials and honors forwarded HTTPS headers.

### What Changed

- Added `JobTrackrApi/Dockerfile` and a `full`-profile `backend` Compose service with actuator readiness checks
- Rejected missing production PostgreSQL, JWT, CV Generation token, and R2 settings, including the documented example JWT signing key
- Added a container-network smoke test for readiness and `/api/v1/auth/csrf`
- Documented host-run versus container execution without real credentials

### Impact

Operators can build and run the backend as one container while contributors keep the fast host-run Spring Boot workflow.
