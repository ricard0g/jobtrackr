# ngrok Dev Tunnel (Phone Testing)

Use this workflow when a user wants to open the **JobTrackr frontend on a phone** (or any external device) while running the app locally in a cloud agent environment with the **mock API** enabled.

This setup runs:

- Vite dev server with `VITE_API_MOCKING=true` (MSW, no real backend)
- ngrok HTTPS tunnel to the Vite port

## Prerequisites

1. **Dependencies installed**

   ```bash
   npm install
   ```

2. **ngrok authtoken from the user**

   ngrok will not start without one. Ask the user for their authtoken if it is not already available as a secret or env var.

   ```bash
   ngrok config add-authtoken "<USER_AUTHTOKEN>"
   ```

   Never commit authtokens, store them in repo files, or repeat them in PR descriptions or summaries.

3. **Code prerequisites (required for tunneling to work)**

   Two small dev-only changes must be present in the working tree:

   **`vite.config.ts`** — allow tunnel hostnames (otherwise Vite returns 403):

   ```ts
   server: {
     allowedHosts: [".ngrok-free.app", ".ngrok.app"],
   },
   ```

   **`src/lib/api-config.ts`** — when mocking, use same-origin relative API paths instead of `http://localhost:8080`:

   ```ts
   const isMocking = import.meta.env.VITE_API_MOCKING === "true";

   const resolvedOrigin = (
     isMocking
       ? ""
       : (configuredOrigin ??
           legacyApiUrl?.replace(/\/api\/v1\/?$/, "") ??
           "http://localhost:8080")
   ).replace(/\/$/, "");

   export const API_BASE_URL = resolvedOrigin ? `${resolvedOrigin}/api/v1` : "/api/v1";
   export const AUTH_BASE_URL = resolvedOrigin ? `${resolvedOrigin}/auth` : "/auth";
   ```

   **Why:** On a phone, `localhost:8080` refers to the phone itself, not the dev machine. MSW intercepts same-origin `/auth` and `/api/v1` requests served through the ngrok URL. Without this, the login page may load but form submit fails with **Error 500** (`Failed to fetch`).

## Start the stack

Use **tmux** for long-running processes.

### 1. Vite dev server

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s vite-dev-server -c /workspace \
  -- bash -lc 'env VITE_API_MOCKING=true npm run dev'
```

Notes:

- Use `VITE_API_MOCKING=true` (not `VITE_MOCK_API`).
- Do **not** pass `--host 127.0.0.1`. Default Vite binds to `localhost`.
- Wait until `http://localhost:5173/` returns HTTP 200.

### 2. ngrok tunnel

**Important:** Point ngrok at `localhost:5173`, not `5173` or `127.0.0.1:5173`.

On this environment, Vite listens on `localhost` (often IPv6 `::1` only). Tunneling to `127.0.0.1:5173` causes connection refused even though Vite is running.

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s ngrok-tunnel -c /workspace \
  -- bash -lc 'ngrok http localhost:5173'
```

### 3. Read the public URL

```bash
curl -s http://127.0.0.1:4040/api/tunnels \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(t['public_url'] for t in d['tunnels'] if t['public_url'].startswith('https')))"
```

### 4. Verify before handing off to the user

```bash
# App HTML
curl -s -o /dev/null -w "%{http_code}\n" "$NGROK_URL/" -H "ngrok-skip-browser-warning: true"

# MSW service worker (must be JavaScript, not HTML)
curl -sI "$NGROK_URL/mockServiceWorker.js" -H "ngrok-skip-browser-warning: true" | grep -i content-type
```

Expect `200` for the app and `text/javascript` for the service worker.

## Tell the user

Share the ngrok `https://` URL and these phone steps:

1. Open the URL in the mobile browser.
2. On the ngrok free-tier warning page, tap **Visit Site** (required on first visit so the service worker can register).
3. Log in with the demo account documented in [`mock-service-worker.md`](../mock-service-worker.md#demo-account).
4. If the page looks stale after a restart, hard-refresh.

## Restarting

```bash
# Stop
tmux -f /exec-daemon/tmux.portal.conf kill-session -t vite-dev-server 2>/dev/null
tmux -f /exec-daemon/tmux.portal.conf kill-session -t ngrok-tunnel 2>/dev/null

# Start again (same commands as above)
```

The ngrok URL changes on each ngrok restart (free plan).

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| ngrok `authentication failed` | No authtoken configured | Ask user for authtoken; run `ngrok config add-authtoken` |
| Tunnel returns empty / connection refused | ngrok targets `127.0.0.1:5173` but Vite is on `localhost:5173` | Use `ngrok http localhost:5173` |
| App loads locally but tunnel gets **403** | Vite host check blocks ngrok hostname | Add `server.allowedHosts: [".ngrok-free.app", ".ngrok.app"]` in `vite.config.ts` |
| Login page loads, submit shows **Error 500** | API calls go to `http://localhost:8080` on the phone | Use relative `/auth` and `/api/v1` paths when `VITE_API_MOCKING=true` |
| Blank page / MSW registration error | ngrok interstitial serves HTML instead of `mockServiceWorker.js` | User must tap **Visit Site** on ngrok warning, then reload |
| `bash: nv: command not found` in tmux | Partial/corrupted `send-keys` in tmux | Kill sessions and recreate with `bash -lc '…'` one-shot commands |

## Optional: automated login check

After the user taps through the ngrok interstitial (or in Playwright by clicking **Visit Site**), login should POST to `/auth/login` on the ngrok origin and redirect to `/`. MSW console logs should show `POST /auth/login (200 OK)`.

## Related docs

- [`mock-service-worker.md`](../mock-service-worker.md) — mock API env var, demo account, persistence
- [`AGENTS.md`](../../AGENTS.md) — React Router Data Mode conventions for this repo
