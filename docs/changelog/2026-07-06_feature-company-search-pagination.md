***

## `2026-07-06` — Paginated company search API added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Company lists can grow too large for a single unfiltered response, especially while creating applications.

### Solution

Added pageable company search with bounded defaults and a dedicated page response for the company endpoint.

### What Changed

- Added Spring Data web configuration for pagination.
- Added company search and page response support.
- Added controller and service tests for pagination behavior.

### Impact

Clients can search and browse companies efficiently as the catalog grows.
