***

## `2026-06-04` — Job description entity added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Applications needed a place to store structured job description data separately from the application record itself. Keeping this content in its own entity makes the model easier to extend as job details grow.

### Solution

Added a dedicated `JobDescription` model to complete the set of application-related database entities. This prepared the persistence layer for richer job description tracking.

### What Changed

- Added the `JobDescription` JPA entity
- Extended the domain model around applications
- Prepared the schema model for job posting details

### Impact

The product can now represent job description details as part of the application tracking domain.
