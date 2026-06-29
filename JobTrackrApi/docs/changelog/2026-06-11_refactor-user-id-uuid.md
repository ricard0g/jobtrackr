***

## `2026-06-11` — User IDs migrated to UUID

**Type:** `refactor`
**Branch:** `feature/basic-user-auth-email-password`
**Status:** `✅ Merged`

***

### Problem / Goal

User records still used numeric IDs, which are easier to guess and less suitable for public API boundaries. The API needed a stronger identifier format that could be used consistently across user-owned resources.

### Solution

Migrated user IDs from `Long` to `UUID` across the controller, service, repository, DTO, and exception layers. The user table migration was updated to use UUID identifiers, and the affected controller and service tests were adjusted to match the new ID format.

### What Changed

- Updated application, company, and interview flows to accept UUID user IDs
- Changed user-facing DTOs and not-found exceptions to use UUID values
- Updated repository lookups for user-owned applications, companies, interviews, and status history
- Added a Flyway migration to redesign the users table with UUID support
- Updated unit tests for UUID-based user identifiers

### Impact

User-owned API resources now use UUID identifiers consistently, improving the foundation for authentication and public API usage.
