***

## `2026-08-20` — Reject the documented default PostgreSQL password in production

**Type:** `fix`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The production profile already refused the documented JWT signing key and CV Generation token, but it accepted `jobtrackr_app` as the database password. A full-profile Compose stack copied from `.env.example` could therefore start a production backend against a host-published Postgres using that default.

### Solution

Production startup now treats the documented example PostgreSQL password the same way as the other known defaults. Smoke fixtures use a distinct placeholder password so container checks still start.

### What Changed

- Rejected `DB_PASSWORD=jobtrackr_app` outside local and test profiles
- Updated backend and frontend container smoke fixtures to a non-default password
- Documented the production password gate next to the existing JWT and CV token checks

### Impact

A production-shaped backend container will not start until the PostgreSQL password is changed from the committed example.
