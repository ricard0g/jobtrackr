# ngrok Dev Tunnel (Phone Testing)

Use this workflow when a user wants to open **JobTrackr on a phone** (or any external device) from a cloud agent environment through a **single ngrok HTTPS tunnel**.

nginx reverse-proxies both the Vite frontend and the Spring Boot API behind one origin, so the phone never calls `localhost:8080`.

## Architecture

```mermaid
flowchart LR
  Phone[Phone browser]
  Ngrok[ngrok HTTPS tunnel]
  Nginx[nginx :9080]
  Vite[Vite :5173]
  Api[Spring Boot :8080]
  Db[(Postgres :5432)]

  Phone --> Ngrok
  Ngrok --> Nginx
  Nginx -->|"/" and assets| Vite
  Nginx -->|"/api/v1" and "/auth"| Api
  Api --> Db
```

**Default mode:** full stack (Postgres + API + Vite).

**Mock shortcut:** Vite + MSW only (no backend) via `./scripts/cloud-tunnel-up.sh --mock`.

## Prerequisites

1. **Dependencies installed**

   ```bash
   npm install
   ```

2. **nginx and ngrok available**

   ```bash
   nginx -v
   ngrok version
   ```

   If nginx is missing: `sudo apt-get install -y nginx` (or your platform equivalent).

3. **ngrok authtoken from the user**

   ngrok will not start without one. Ask the user for their authtoken if it is not already available as a secret or env var.

   ```bash
   ngrok config add-authtoken "<USER_AUTHTOKEN>"
   ```

   Never commit authtokens, store them in repo files, or repeat them in PR descriptions or summaries.

4. **Code prerequisites (required for tunneling to work)**

   **`vite.config.ts`** — allow tunnel hostnames and optional HMR through ngrok:

   ```ts
   server: {
     allowedHosts: [".ngrok-free.app", ".ngrok.app"],
     hmr: process.env.VITE_HMR_HOST
       ? { host: process.env.VITE_HMR_HOST, protocol: "wss", clientPort: 443 }
       : true,
   },
   ```

   **`src/lib/api-config.ts`** — use same-origin relative API paths when mocking or when `VITE_API_ORIGIN` is empty:

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

   **Why:** On a phone, `localhost:8080` refers to the phone itself. Through nginx, `/auth` and `/api/v1` hit the real API on the same ngrok origin. Without relative paths, login may fail with **Error 500** (`Failed to fetch`).

## Quick start

From the repo root:

```bash
./scripts/cloud-tunnel-up.sh
```

This script:

1. Starts Postgres and the API (full stack)
2. Starts Vite with `VITE_API_MOCKING=false` and `VITE_API_ORIGIN=` (relative API paths)
3. Sets `JWT_REFRESH_COOKIE_SECURE=true` for the HTTPS ngrok origin
4. Starts nginx on `localhost:9080` using [`config/nginx/cloud-dev.conf`](../../../config/nginx/cloud-dev.conf)
5. Starts ngrok: `ngrok http localhost:9080`
6. Restarts Vite with `VITE_HMR_HOST` set from the ngrok hostname

Mock-only shortcut:

```bash
./scripts/cloud-tunnel-up.sh --mock
```

Stop everything:

```bash
./scripts/cloud-tunnel-down.sh
```

## Manual tmux steps

Use **tmux** for long-running processes when not using the script.

### 1. Postgres and API (full stack only)

```bash
./scripts/dev-up.sh
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s api-dev-server -c /workspace \
  -- bash -lc './scripts/dev-api.sh'
```

Wait until `http://localhost:8080/actuator/health` returns `{"status":"UP"}`.

### 2. Vite dev server

Full stack:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s vite-dev-server -c /workspace/jobtrackr-web \
  -- bash -lc 'env VITE_API_MOCKING=false VITE_API_ORIGIN= npm run dev'
```

Mock only:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s vite-dev-server -c /workspace/jobtrackr-web \
  -- bash -lc 'env VITE_API_MOCKING=true npm run dev'
```

Notes:

- Do **not** pass `--host 127.0.0.1`. Default Vite binds to `localhost`.
- Wait until `http://localhost:5173/` returns HTTP 200.

### 3. nginx reverse proxy

Full stack:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s nginx-proxy -c /workspace \
  -- bash -lc "nginx -c '/workspace/config/nginx/cloud-dev.conf' -g 'daemon off;'"
```

Mock only:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s nginx-proxy -c /workspace \
  -- bash -lc "nginx -c '/workspace/config/nginx/cloud-dev-mock.conf' -g 'daemon off;'"
```

Wait until `http://localhost:9080/` returns HTTP 200.

### 4. ngrok tunnel

**Important:** Point ngrok at nginx on `localhost:9080`, not Vite `:5173` or API `:8080`.

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s ngrok-tunnel -c /workspace \
  -- bash -lc 'ngrok http localhost:9080'
```

### 5. Read the public URL

```bash
curl -s http://127.0.0.1:4040/api/tunnels \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(t['public_url'] for t in d['tunnels'] if t['public_url'].startswith('https')))"
```

### 6. Optional: enable Vite HMR through ngrok

Extract the ngrok hostname and restart Vite:

```bash
export NGROK_URL="<https-url-from-step-5>"
export VITE_HMR_HOST="$(python3 -c "from urllib.parse import urlparse; print(urlparse('$NGROK_URL').hostname)")"
tmux -f /exec-daemon/tmux.portal.conf kill-session -t vite-dev-server 2>/dev/null
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s vite-dev-server -c /workspace/jobtrackr-web \
  -- bash -lc "export VITE_HMR_HOST='$VITE_HMR_HOST'; env VITE_API_MOCKING=false VITE_API_ORIGIN= npm run dev"
```

If skipped, the app still works with manual refresh.

## Verify before handing off to the user

```bash
NGROK_URL="<https-url>"

# App HTML
curl -s -o /dev/null -w "%{http_code}\n" "$NGROK_URL/" -H "ngrok-skip-browser-warning: true"

# API routing (full stack)
curl -s "$NGROK_URL/auth/csrf" -H "ngrok-skip-browser-warning: true"

# MSW service worker (mock mode)
curl -sI "$NGROK_URL/mockServiceWorker.js" -H "ngrok-skip-browser-warning: true" | grep -i content-type
```

Expect `200` for the app, JSON for `/auth/csrf` (full stack), and `text/javascript` for the service worker (mock mode).

## Tell the user

Share the ngrok `https://` URL and these phone steps:

1. Open the URL in the mobile browser.
2. On the ngrok free-tier warning page, tap **Visit Site** (required on first visit).
3. Log in:
   - **Full stack:** `agent@example.test` / `dev-password` (see [`docs/development.md`](../../../docs/development.md))
   - **Mock mode:** demo account in [`mock-service-worker.md`](../mock-service-worker.md#demo-account)
4. If the page looks stale after a restart, hard-refresh.

## Restarting

```bash
./scripts/cloud-tunnel-down.sh
./scripts/cloud-tunnel-up.sh
```

The ngrok URL changes on each ngrok restart (free plan).

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| `Missing required command: nginx` | nginx not installed | `sudo apt-get install -y nginx` |
| ngrok `authentication failed` | No authtoken configured | Ask user for authtoken; run `ngrok config add-authtoken` |
| Tunnel returns empty / connection refused | ngrok targets wrong port | Use `ngrok http localhost:9080` (nginx), not `:5173` or `:8080` |
| nginx 502 Bad Gateway | API or Vite not running | Check tmux sessions; verify `localhost:8080/actuator/health` and `localhost:5173/` |
| App loads locally but tunnel gets **403** | Vite host check blocks ngrok hostname | Add `server.allowedHosts: [".ngrok-free.app", ".ngrok.app"]` in `vite.config.ts` |
| Login page loads, submit shows **Error 500** | API calls go to `http://localhost:8080` on the phone | Use `VITE_API_ORIGIN=` (empty) or `VITE_API_MOCKING=true`; route API through nginx |
| Login shows **Invalid email or password** on full stack | Stale MSW service worker from an earlier `--mock` session | Hard-refresh; clear site data; full-stack mode auto-unregisters MSW on load |
| Login succeeds but session drops | Refresh cookie not secure on HTTPS | Set `JWT_REFRESH_COOKIE_SECURE=true` (done by `cloud-tunnel-up.sh`) |
| Blank page / MSW registration error (mock) | ngrok interstitial serves HTML instead of `mockServiceWorker.js` | User must tap **Visit Site** on ngrok warning, then reload |
| HMR does not connect on phone | Vite advertises `localhost` for WebSocket | Restart Vite with `VITE_HMR_HOST=<ngrok-host>` or refresh manually |
| `bash: nv: command not found` in tmux | Partial/corrupted `send-keys` in tmux | Kill sessions and recreate with `bash -lc '…'` one-shot commands |

## Related docs

- [`mock-service-worker.md`](../mock-service-worker.md) — mock API env var, demo account, persistence
- [`AGENTS.md`](../../AGENTS.md) — React Router Data Mode conventions for this repo
- [`docs/development.md`](../../../docs/development.md) — full-stack setup and seed data
