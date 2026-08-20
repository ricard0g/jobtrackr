***

## `2026-08-20` — Harden the CV Generation runtime image

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The CV Generation container was not a safe release image: builds skipped tests, ran as root, could pick up local `.env` files, and treated liveness as enough for Compose startup even when Gemini or the service token were missing.

### Solution

The image now installs from `uv.lock`, runs the existing pytest suite before packaging, and starts as a non-root process configured only through environment variables. Liveness stays process-up; readiness rejects missing Gemini configuration, the documented default token outside local/test, and the fake provider unless it is enabled explicitly.

### What Changed

- Added a pytest-gated, lockfile-based, non-root Dockerfile and a tight `.dockerignore`
- Rejected default or blank service tokens on production readiness while keeping local/test permissive
- Added a container smoke check for liveness, readiness, and one authenticated fake generation
- Documented provider modes, readiness, and the five-minute timeout default with placeholders only

### Impact

Operators can build a reproducible CV Generation image that fails closed for production configuration while tests and smoke still run without Gemini.
