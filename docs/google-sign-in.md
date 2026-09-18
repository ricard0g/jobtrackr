# Google Sign-In operations

Google Sign-In is an identity-provider-only OpenID Connect flow. It stays dark until an operator enables it with a Web OAuth client. Real client secrets must never enter Git, fixtures, issue text, or logs.

Cloudflare Access remains an independent outer admission gate. It is not part of JobTrackr identity semantics.

## Configuration

| Variable | Role |
|---|---|
| `GOOGLE_AUTH_ENABLED` | Master switch. Default `false`. |
| `GOOGLE_OAUTH_CLIENT_ID` | Backend-only Web client id. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Backend-only Web client secret. |
| `JOBTRACKR_PUBLIC_ORIGIN` | The SPA's externally visible origin. No path, query, or fragment. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Exact backend callback registered with Google: `/api/v1/auth/oauth2/callback/google`. |

Enabling with a missing, blank, non-origin public origin, or a redirect URI that is not that exact callback fails startup. Disabling later preserves every Identity Link and leaves password sign-in working. Google-only Users receive `oauthResult=unavailable` until the provider is re-enabled.

Templates: `.env.example` (host-run), `.env.compose.example` (local Compose), `.env.vps.example` (VPS). Copy them; do not put real credentials in the committed files.

## Supported development origins

Use one External Google Cloud project in Testing for development. Register these JavaScript origins and redirect URIs on that project's Web client. Random `*.trycloudflare.com` quick-tunnel hostnames are not supported.

| Workflow | Origin | Redirect URI |
|---|---|---|
| Host-run localhost | `http://localhost:5173` | `http://localhost:8080/api/v1/auth/oauth2/callback/google` |
| Full Compose | `http://127.0.0.1:18080` | `http://127.0.0.1:18080/api/v1/auth/oauth2/callback/google` |
| Stable tunnel | `https://test.ricardoguzdev.com` | `https://test.ricardoguzdev.com/api/v1/auth/oauth2/callback/google` |

Host-run is split-origin: the SPA is on port 5173 and Google redirects to the API on port 8080. Compose and the stable tunnel are same-origin through Nginx. Set `CORS_ALLOWED_ORIGINS` to the same value as `JOBTRACKR_PUBLIC_ORIGIN` when the browser origin differs from the API. On the HTTPS tunnel, set `JWT_REFRESH_COOKIE_SECURE=true` and do not set `JWT_REFRESH_COOKIE_ALLOW_INSECURE`.

## Production stays dark

Use a second External Google Cloud project and Web client for production. Do not copy the development client into production configuration.

Keep `GOOGLE_AUTH_ENABLED=false` on a production hostname until all of the following are ready for In production status:

- exact production hostname
- consent-screen branding
- support contact
- homepage URL
- privacy-policy URL

Existing Users with password sign-in need no identity backfill.

## Single replica

OAuth handshake state uses an in-memory servlet session (`JOBTRACKR_OAUTH_SESSION`). Authentication rate limits use in-memory Caffeine storage. Run one backend replica. Multiple replicas need a shared Spring Session store and a shared rate-limit store (or an equivalent design) before horizontal scaling. A backend restart safely expires in-flight Google flows.

## Logging

Callback responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Application logs record event, outcome, purpose, known User ID, and correlation ID. They must not contain callback query strings, authorization codes, provider errors, tokens, or secrets.

Frontend Nginx logs the Google callback with `$uri` (no query). Host Nginx turns access logging off for that exact path. Tomcat access logs stay disabled; the configured pattern omits query strings if they are turned on later.

## Manual smoke

Exercise real Google through the stable tunnel with [Google Sign-In smoke](acceptance/google-sign-in-smoke.md) before considering this path releasable. Automated tests never call live Google.
