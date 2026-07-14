***

## `2026-07-08` — Company pagination hardened for application creation

**Type:** `fix`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The paginated company selector could fail or behave inconsistently during application creation.

### Solution

Hardened search request handling, mock seed behavior, and coverage for the company selection flow.

### What Changed

- Updated company search hook behavior.
- Added company-search and mock-seed tests.
- Updated API documentation and Vite test configuration.

### Impact

Application creation remains reliable when searching a paginated company catalog.
