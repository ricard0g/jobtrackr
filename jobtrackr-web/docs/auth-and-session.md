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

Base path: `/auth`

| Method | Path | Body | Response | Notes |
| --- | --- | --- | --- | --- |
| GET | `/csrf` | none | Spring `CsrfToken` JSON | Frontend reads `headerName` and `token`. |
| POST | `/register` | `RegisterRequestDto` | `201 AuthResponse` | Sets refresh cookie. CSRF ignored. |
| POST | `/login` | `LoginRequestDto` | `200 AuthResponse` | Sets refresh cookie. CSRF ignored. |
| POST | `/refresh` | none | `200 AuthResponse` | Rotates refresh token cookie. Requires CSRF in current frontend. |
| POST | `/logout` | none | `204` | Revokes refresh token if present and clears cookie. Requires CSRF in current frontend. |

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
- Refresh cookie path is `/auth`.
- Refresh cookie name, secure flag, and SameSite are driven by backend `JwtProperties`.
- Refresh token rotation happens on every `/auth/refresh`.

## CSRF

Backend CSRF config:

- CSRF cookie name: `XSRF-TOKEN`
- CSRF header name: `X-XSRF-TOKEN`
- Cookie path: `/`
- Cookie is not HttpOnly.
- Requests with a Bearer `Authorization` header are ignored by CSRF.
- `/auth/register`, `/auth/login`, and `/actuator/health` are ignored by CSRF.

Frontend behavior:

- `getCsrfToken()` calls `/auth/csrf` with `credentials: "include"`.
- Refresh and logout call `getCsrfToken()` and include the CSRF header.
- Login and register do not include CSRF.

## Session Bootstrap

`requireSession()` calls `refreshSession()`.

If refresh succeeds:

- Access token is updated in memory.
- Root loader can fetch protected resources.

If refresh fails:

- User is redirected to `/auth/login`.

## Auth Migration Notes

- Keep auth/session code centralized in `src/lib/api.ts` or split into a dedicated auth API module.
- Add English fallback messages in `parseApiError` callers.
- Consider redirecting authenticated users away from `/auth/login` and `/auth/register` once session detection is robust.
- Keep `credentials: "include"` for auth endpoints that need cookies.
- Do not put refresh tokens in frontend storage.

