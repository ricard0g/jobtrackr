***

## `2026-06-30` — User-scoped tags with global defaults

**Type:** `feature`
**Branch:** `feature/user-scoped-tags`
**Status:** `✅ Merged`

***

### Problem / Goal

Tags were shared globally, so custom tags created by one user could affect every other user. The API needed shared default tags while still letting each user manage a private tag catalog.

### Solution

Added user ownership to tags with nullable `tag_user_id`, allowing global tags to remain shared while personal tags belong to a specific user. Tag lookup, CRUD, and application tag attachment now resolve only tags that are either global or owned by the authenticated user.

### What Changed

- Added Flyway V4 migration for `tag_user_id`, scoped tag uniqueness, indexes, and seeded global defaults
- Scoped tag list, detail, create, replace, and delete operations to the authenticated user
- Restricted application tag attachment to global tags or tags owned by the current user
- Included tag ownership in tag responses and expanded controller/service test coverage

### Impact

Users can now use a shared default tag catalog while creating and managing personal tags that stay private to their account.
