## `2026-07-31` — Unify authentication under the versioned API route

**Type:** `refactor`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Authentication endpoints lived outside the `/api/v1` prefix used by the rest of the backend. That split required special reverse-proxy and Cloudflare tunnel routing, complicating nginx and VPS deployment.

### Solution

Moved login, refresh, logout, CSRF, and related auth handling under the shared `/api/v1` prefix. Updated frontend API configuration, cookies, security rules, documentation, scripts, and integration tests to use the unified route.

### What Changed

- Nested authentication endpoints under `/api/v1`
- Updated CSRF and refresh-token cookie paths and Spring Security matchers
- Pointed the web client and session documentation at the new auth routes
- Removed temporary Cloudflare-specific proxy workarounds
- Updated controller and CSRF integration coverage

### Impact

JobTrackr can route all backend traffic through one versioned API prefix, simplifying reverse-proxy and production deployment configuration.
