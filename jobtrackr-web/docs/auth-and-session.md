# Auth And Session Context

Backend source:

- `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/controller/AuthController.java`
- `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/service/AuthService.java`
- `../../JobTrackrApi/src/main/java/com/ricard0g/jobtrackr_api/config/security`

Frontend source:

- `src/lib/api.ts`
- `src/routes/auth-data.ts`
- `src/routes/auth.tsx`
- `src/routes/app-data.ts`

## Auth Endpoints

Base path: `/api/v1/auth`

| Method | Path | Body | Response | Notes |
| --- | --- | --- | --- | --- |
| GET | `/providers` | none | `{ google: boolean }` | Public. `google` is true only when Google Sign-In is enabled with valid backend config. |
| GET | `/csrf` | none | Spring `CsrfToken` JSON | Frontend reads `headerName` and `token`. |
| POST | `/register` | `RegisterRequestDto` | `201 AuthResponse` | Sets refresh cookie. CSRF ignored. |
| POST | `/login` | `LoginRequestDto` | `200 AuthResponse` | Sets refresh cookie. CSRF ignored. |
| POST | `/refresh` | none | `200 AuthResponse` | Rotates refresh token cookie. Requires CSRF in current frontend. |
| POST | `/logout` | none | `204` | Revokes refresh token if present and clears cookie. Requires CSRF in current frontend. |
| GET | `/oauth2/authorization/google` | none | `302` to Google | Present when Google is enabled. Starts a purpose-bound OAuth session and requests `prompt=select_account`. |
| GET | `/oauth2/callback/google` | none | `302` to the SPA | Completes Google Sign-In. Success returns to an allowlisted path with no tokens in the URL. Failure uses `oauthResult` codes only. |

## DTOs

`LoginRequestDto`:

```ts
type LoginRequest = {
  email: string; // @NotNull @Email
  password: string; // @NotNull
};
```

`RegisterRequestDto`:

```ts
type RegisterRequest = {
  email: string; // @NotNull @Email
  password: string; // @NotNull @Size(min=8, max=72)
  displayName?: string | null;
};
```

`AuthResponse`:

```ts
type AuthResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: User;
};
```

## Token Model

- Access token is a JWT returned in the JSON response.
- Frontend stores access token in module memory via `setAccessToken`.
- API calls to `/api/v1/**` send `Authorization: Bearer <token>`.
- Refresh token is an HttpOnly cookie written by the backend.
- Refresh cookie path is `/api/v1/auth`.
- Refresh cookie name, secure flag, and SameSite are driven by backend `JwtProperties`.
- Refresh token rotation happens on every `/api/v1/auth/refresh`.
- CSRF cookie path is `/api/v1/`.

## CSRF

Backend CSRF config:

- CSRF cookie name: `XSRF-TOKEN`
- CSRF header name: `X-XSRF-TOKEN`
- Cookie path: `/`
- Cookie is not HttpOnly.
- Requests with a Bearer `Authorization` header are ignored by CSRF.
- `/api/v1/auth/register`, `/api/v1/auth/login`, and `/actuator/health` are ignored by CSRF.

Frontend behavior:

- `getCsrfToken()` calls `/api/v1/auth/csrf` with `credentials: "include"`.
- Refresh and logout call `getCsrfToken()` and include the CSRF header.
- Login and register do not include CSRF.

## Session Bootstrap

`requireSession()` calls `refreshSession()`.

If refresh succeeds:

- Access token is updated in memory.
- Root loader can fetch protected resources.

If refresh fails:

- User is redirected to `/auth/login`.

## Google Sign-In

Google is hidden until `GET /api/v1/auth/providers` reports `{ google: true }`. The login and register screens then show a “Continue with Google” link to `${AUTH_BASE_URL}/oauth2/authorization/google`. The frontend never loads Google JavaScript; `prompt=select_account` is added by the backend.

Callback failures return only allowlisted `oauthResult` codes (`cancelled`, `expired`, `unavailable`, `failed`, and `conflict` reserved for linking). The auth loader consumes that query parameter and keeps a persistent banner. Success redirects to `/`, `/documents`, or `/settings/account` with no tokens in the URL.

## Auth Migration Notes

- Keep auth/session code centralized in `src/lib/api.ts` or split into a dedicated auth API module.
- Add English fallback messages in `parseApiError` callers.
- Consider redirecting authenticated users away from `/auth/login` and `/auth/register` once session detection is robust.
- Keep `credentials: "include"` for auth endpoints that need cookies.
- Do not put refresh tokens in frontend storage.

