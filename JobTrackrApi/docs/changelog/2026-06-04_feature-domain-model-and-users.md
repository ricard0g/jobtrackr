***

## `2026-06-04` — Domain model and user listing added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The API needed the core job-tracking domain represented in code before user-facing workflows could be built. It also needed a first endpoint to verify the application could expose stored data.

### Solution

Added the main JPA entities, enums, initial schema configuration, and a simple user read flow. The first user endpoint exposed `/api/v1/user` so clients could retrieve users through the controller, service, and repository layers.

### What Changed

- Added core entities for users, applications, companies, interviews, tags, CVs, tasks, saved views, and status history
- Added domain enums for application status, interview type and outcome, remote type, tag category, and task type
- Added `UserController`, `UserService`, `UserRepository`, and `UserResponseDto`
- Added initial application configuration and schema file

### Impact

The API now has its core data model and a first working user retrieval endpoint.
