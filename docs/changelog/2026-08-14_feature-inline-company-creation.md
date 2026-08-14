***

## `2026-08-14` — Inline company creation added to company combobox

**Type:** `feature`
**Branch:** `cursor/inline-company-create-eb1f`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The application create dialog could only pick pre-seeded (or already saved) companies. If a user’s employer was not in that catalog, they could not create the application.

### Solution

When company search returns no matches, the combobox now shows a `Create "{name}"` button that posts a user-owned company with that name and selects it. The existing company API and user-scoped schema already supported this; the frontend was the missing piece.

### What Changed

- Added an empty-state create action inside `CompanyCombobox`.
- Wired create to `POST /companies` and mapped duplicate-name errors.
- Added combobox tests for show/hide, success, duplicate, and pending states.

### Impact

Users can add a missing company without leaving the create-application dialog.
