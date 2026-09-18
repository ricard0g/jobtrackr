# Google Sign-In smoke

Prove the complete Google Sign-In paths against the stable Cloudflare tunnel at `https://test.ricardoguzdev.com` with the development Google Cloud Web client. MSW, MockMvc, and localhost-only success do not satisfy this checklist.

This is not production enablement. Keep the production Google Cloud project disabled. Cloudflare Access may admit the browser; it is not a JobTrackr session.

## Prerequisites

1. Copy `.env.vps.example` to `.env.vps` on the VPS. Put the **development** client id and secret in that ignored file.
2. Set exact values and do not commit them:

```text
GOOGLE_AUTH_ENABLED=true
JOBTRACKR_PUBLIC_ORIGIN=https://test.ricardoguzdev.com
GOOGLE_OAUTH_REDIRECT_URI=https://test.ricardoguzdev.com/api/v1/auth/oauth2/callback/google
CORS_ALLOWED_ORIGINS=https://test.ricardoguzdev.com
JWT_REFRESH_COOKIE_SECURE=true
```

3. Confirm Google Cloud Testing clients list that origin and redirect URI. Confirm startup succeeds. Incomplete enabled configuration must fail closed.
4. Confirm `GET /api/v1/auth/providers` returns `{ "google": true }`.

## Checklist

Use a private browser window. After each result, confirm the URL shows only an allowlisted `oauthResult` (then the SPA consumes it) and never an authorization code, token, subject, or provider error.

1. **JIT sign-in.** Continue with Google from Create account with an unused Google identity. A User is created with that verified email, no password, and no display name. You land in the application.
2. **Returning sign-in.** Sign out and Continue with Google with the same identity. You return to the same User. Account Settings still shows the same Primary Email.
3. **Explicit linking.** With a separate User who signs in with a password and whose Primary Email matches a different unused Google verified email, connect Google from Account Settings after current-password confirmation. Sign-in Methods shows Connected. Other sessions stay valid.
4. **Fresh-Google password creation.** As a Google-only User, choose Create password, complete Google's fresh authentication, and submit a new password in Account Settings. Other sessions die; this browser stays signed in.
5. **Disconnect.** With both methods enabled, disconnect Google after current-password confirmation. Sign-in Methods offers Connect again. Password sign-in still works.
6. **Cancellation.** Start Google and cancel on Google's page. Return to login or Account Settings with a cancelled banner and a retry path.
7. **Retry.** After cancellation or an expired/replaced flow, start Google again and complete it.
8. **Provider disablement.** Set `GOOGLE_AUTH_ENABLED=false` and restart the backend. Identity Links remain. Password sign-in still works. Continue with Google is hidden. A Google-only User cannot enter and sees unavailable. Re-enable and confirm access returns.

If Google does not return fresh `auth_time` evidence for password creation, leave that path disabled and record the observation. Do not enable production.

## After the run

Set `GOOGLE_AUTH_ENABLED=false` if this host should return to dark. Do not paste client secrets, authorization codes, or tokens into tickets or logs.
