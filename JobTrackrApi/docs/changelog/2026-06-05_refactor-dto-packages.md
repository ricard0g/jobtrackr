***

## `2026-06-05` — DTO packages reorganized

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

DTOs were all grouped together, which made the package structure harder to scan as the API surface grew. Controllers, services, and tests needed imports aligned with a clearer feature-based DTO layout.

### Solution

Moved DTO classes into domain-specific packages for applications, companies, tags, and users. Updated all affected imports across controllers, services, and tests without changing endpoint behavior.

### What Changed

- Moved application DTOs into `dto/ApplicationDto`
- Moved company DTOs into `dto/CompanyDto`
- Moved tag DTOs into `dto/TagDto`
- Moved user DTOs into `dto/UserDto`
- Updated imports across production and test code

### Impact

The codebase is easier to navigate as more request and response DTOs are added.
