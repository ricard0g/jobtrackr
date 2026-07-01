***

## `2026-07-01` — CSRF filter protection enabled

**Type:** `feature`
**Branch:** `feature/csrf-filter-protection`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The API disabled CSRF protection entirely, leaving cookie-authenticated auth endpoints (`/auth/refresh`, `/auth/logout`) exposed to cross-site request forgery. Refresh tokens are sent automatically by the browser, so a malicious site could trigger token rotation or logout on behalf of a logged-in user.

### Solution

Enabled Spring Security CSRF validation using a cookie-based `CookieCsrfTokenRepository` (no database storage). Bearer JWT requests bypass CSRF since browsers do not auto-send `Authorization` headers. Cookie-based auth endpoints require a valid CSRF token obtained from `GET /auth/csrf`.

### What Changed

- Added `CsrfConfig` with `CookieCsrfTokenRepository` (`XSRF-TOKEN` cookie, `X-XSRF-TOKEN` header)
- Enabled CSRF in `SecurityConfig` with Bearer/login/register/health exemptions
- Added `RestAccessDeniedHandler` returning JSON `403` with code `CSRF_TOKEN_INVALID`
- Added `GET /auth/csrf` bootstrap endpoint for the SPA
- Updated CORS to allow and expose CSRF headers
- Added `SecurityCsrfIntegrationTest` covering CSRF enforcement and Bearer bypass

### Impact

Cookie-based session refresh and logout are now protected against CSRF. The SPA must call `GET /auth/csrf` (with credentials) before `POST /auth/refresh` or `POST /auth/logout`, then send the returned token in the `headerName` response field (typically `X-CSRF-TOKEN` or `X-XSRF-TOKEN`). Bearer-authenticated API calls are unchanged.
