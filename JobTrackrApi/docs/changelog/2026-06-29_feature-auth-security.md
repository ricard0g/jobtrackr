***

## `2026-06-29` — Email and password authentication added

**Type:** `feature`
**Branch:** `feature/basic-user-auth-email-password`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The API needed a real authentication layer so users could create accounts, sign in, and access protected resources securely. It also needed refresh-token support so sessions could continue without exposing long-lived access tokens.

### Solution

Added Spring Security with stateless JWT access tokens and opaque refresh tokens stored through secure cookies. Registration and login now issue token pairs, refresh rotates tokens to detect reuse, and logout revokes the active refresh token.

### What Changed

- Added `/auth/register`, `/auth/login`, `/auth/refresh`, and `/auth/logout` endpoints
- Added JWT generation, request filtering, CORS, and unauthorized response handling
- Added refresh-token persistence, rotation, revocation, and reuse detection
- Redesigned user authentication fields and added the refresh tokens migration
- Added controller and service tests for authentication and token behavior

### Impact

Users can now register, log in, refresh their session, and access protected API endpoints with a secure token-based flow.
