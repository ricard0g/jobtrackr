***

## `2026-07-16` — Navbar logout hover color aligned with other controls

**Type:** `fix`
**Branch:** `feature/dashboard-redesign-and-r2-bucket-integration`
**Status:** `✅ Merged`

***

### Problem / Goal

The logout button used a different hover background than the other navbar actions, so it looked inconsistent.

### Solution

Matched the logout button hover styles to the shared navbar control treatment.

### What Changed

- Updated logout button hover class from `hover:bg-lightest-accent` to `hover:bg-light-accent`.

### Impact

Navbar actions now share a consistent hover appearance.
