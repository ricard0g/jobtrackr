***

## `2026-07-06` — Searchable paginated company combobox added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

A static company selector became difficult to use as the company catalog grew.

### Solution

Replaced the selector with a searchable combobox that requests paginated company results from the API.

### What Changed

- Added a reusable company combobox.
- Added company-search hook and API integration.
- Added command and popover UI primitives.

### Impact

Users can quickly find a company when creating an application.
