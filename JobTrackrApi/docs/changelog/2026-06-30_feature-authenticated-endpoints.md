***

## `2026-06-30` — Authenticated endpoint ownership enforced

**Type:** `feature`
**Branch:** `refactor/endpoints-refactor-with-auth`
**Status:** `🔄 In Progress`

***

### Problem / Goal

User-owned endpoints still accepted `userId` as a path parameter, which made clients responsible for sending identity data that should come from authentication. JWT validation also needed to reject tokens for users who are disabled, locked, expired, or malformed.

### Solution

Updated protected controllers to resolve the user ID from the authenticated `Principal` instead of URL path variables. JWT validation now checks the token subject, expiration, and user account state while safely returning `false` for invalid tokens.

### What Changed

- Replaced `/api/v1/users/{userId}/applications` with authenticated `/api/v1/applications` routes
- Replaced `/api/v1/users/{userId}/companies` with authenticated `/api/v1/companies` routes
- Replaced nested interview routes to derive ownership from the authenticated user
- Added `AuthenticatedUserId` helper for converting `Principal` names into UUID user IDs
- Changed `/api/v1/users` to return the authenticated user and expanded JWT/controller tests

### Impact

Users can now access their own applications, companies, interviews, and profile data without exposing or passing user IDs in protected endpoint URLs.
