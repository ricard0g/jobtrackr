## `2026-07-27` — Prove the complete real-stack Documents workflow

**Type:** `chore`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Documents preview slices worked in isolation and under mocks, but the epic still needed proof that Base CVs, Generated CVs, R2 caching, Gotenberg conversion, pagination, deletion cleanup, and dialog accessibility hold together on the real stack.

### Solution

Added an automated HTTP acceptance path against the live API/Postgres/R2/Gotenberg stack with a documented UI checklist, closed remaining dialog keyboard/mobile route coverage, and restored Generated CV pages to twenty results.

### What Changed

- Restored Generated CV page size to 20 across API, web client, MSW, and tests
- Added `scripts/acceptance/documents-real-stack.sh` plus `docs/acceptance/documents-real-stack.md`
- Extended Documents route tests for Escape focus management and a reduced mobile viewport
- Linked the acceptance path from the local runbook

### Impact

Candidates and agents can now prove the full Documents library and preview flow against production-like infrastructure instead of relying on MSW alone.
