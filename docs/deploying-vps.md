# Deploy JobTrackr on a VPS

This is the standalone VPS path. It pulls immutable frontend, backend, and CV Generation images from GHCR, keeps PostgreSQL on an external volume, and publishes exactly one loopback frontend entrypoint. Host-managed system Nginx and cloudflared then expose that entrypoint on a Cloudflare Access-protected HTTPS hostname.

It is not host-run Spring/Vite, not local full Compose, and not the cloud-agent quick tunnel. Those local workflows stay in [Running Locally](running-locally.md). Image coordinates and tag policy are in [Publishing Images](releasing-images.md). This runbook does not install or rewrite Cloudflare, UFW, system Nginx, or systemd. Copy the sanitized examples, then change those host services yourself.

An operator does not need the Git checkout, Java, Node, or Python build toolchains on the VPS. Docker Engine, the Compose file, and a sanitized environment file start the inner stack. The host-edge examples are optional copies onto already-installed system Nginx and cloudflared.

## Topology

Five Compose services share a private user-defined bridge network named `jobtrackr`:

| Service | Image | Host ports |
|---|---|---|
| frontend | `ghcr.io/ricard0g/jobtrackr/frontend:sha-<commit>` | `127.0.0.1:${JOBTRACKR_PORT:-18080}` → container `80` |
| backend | `ghcr.io/ricard0g/jobtrackr/backend:sha-<commit>` | none |
| postgres | `postgres:16` | none |
| cv-generation | `ghcr.io/ricard0g/jobtrackr/cv-generation:sha-<commit>` | none |
| gotenberg | `gotenberg/gotenberg:8.34.0-libreoffice` | none |

`18080` is an arbitrary high-port default. Change `JOBTRACKR_PORT` if another site already uses it. The host bind is hardcoded to IPv4 `127.0.0.1` in `docker-compose.vps.yml`. It is the Docker-owned loopback mapping, not a port on which system Nginx also listens. System Nginx uses a different loopback origin, `127.0.0.1:18081` in the sanitized example, and proxies to `JOBTRACKR_PORT`.

Services listen on all container interfaces so the Compose network can reach them. That is not a host publication. Exposure is restricted by publishing only the frontend to `127.0.0.1`. Do not publish backend, PostgreSQL, CV Generation, or Gotenberg, and do not assume UFW will hide an all-interface Docker mapping. See [Loopback publishing and UFW](#loopback-publishing-and-ufw).

The backend image already processes `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For`. System Nginx and frontend Nginx must forward those headers so Spring sees the Cloudflare HTTPS hostname. Set `JOBTRACKR_PUBLIC_ORIGIN` and `CORS_ALLOWED_ORIGINS` to that exact `https://` origin. Set `JWT_REFRESH_COOKIE_SECURE=true`. Do not set `JWT_REFRESH_COOKIE_ALLOW_INSECURE` on the VPS.

## Secrets

Least scope inside Compose:

- Gemini (`GOOGLE_AI_API_KEY`) reaches CV Generation only
- R2 credentials reach the backend only
- PostgreSQL credentials reach PostgreSQL and the backend
- The shared CV Generation service token reaches the backend and CV Generation only
- The frontend image receives no secrets

Production startup fails if PostgreSQL password, JWT signing key, service token, Gemini key, or R2 settings are missing or still set to documented placeholders. Compose itself also refuses to interpolate those required variables when they are unset.

Keep every real environment file out of Git. `.env`, `.env.compose`, and `.env.vps` are ignored. Committed templates are `.env.example`, `.env.compose.example`, and `.env.vps.example` only.

## Prerequisites

- A current Docker Engine with Compose v2 on the VPS
- Disk for PostgreSQL in the named volume `jobtrackr_pgdata`
- Outbound access to GHCR, Cloudflare R2, and Gemini
- A verified `sha-<40-character-commit>` tag from [Publishing Images](releasing-images.md)
- Host-managed system Nginx and cloudflared already installed if you are attaching the Access-protected hostname. This repository does not install them.

Copy `docker-compose.vps.yml` and `.env.vps.example` onto the VPS. For the Access-protected hostname, also copy `config/nginx/vps-system.conf` and `config/cloudflared/config.example.yml`. You do not need the rest of the repository.

## GitHub Container Registry

Packages may be private. Authenticate with a token that has `read:packages`. Put the token in a `600` file and pass it on stdin so it does not appear in the shell history, process list, or runbook examples:

```bash
install -m 600 /dev/null /home/deploy/.ghcr-token
# Write the token into that file with an editor. Do not cat, echo, or copy it into commands.
docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin < /home/deploy/.ghcr-token
```

Replace the username. Do not commit the token file.

## Environment file

```bash
cp .env.vps.example .env.vps
chmod 600 .env.vps
chown deploy:deploy .env.vps
```

Replace every `replace-with-` value, `YOUR_ACCOUNT_ID`, and `sha-REPLACE_WITH_40_CHAR_COMMIT`. Use the same immutable `sha-` tag on all three image coordinates. Set `JOBTRACKR_PUBLISH_HOST=127.0.0.1` and a high `JOBTRACKR_PORT` (default `18080`).

Validate without printing secret values:

```bash
python3 scripts/acceptance/vps_env_validate.py .env.vps
```

The checker reports missing or placeholder **names** only. It does not print the values.

## External volume

Create the PostgreSQL volume before the first `compose up`. Compose will not create an `external` volume, and a later `docker compose down` that does not explicitly delete this volume will leave the data in place:

```bash
docker volume create jobtrackr_pgdata
```

Application image replacement is not a database reset. Deleting or renaming `jobtrackr_pgdata` is a separate, destructive operation.

## Start

From the directory that contains `docker-compose.vps.yml` and `.env.vps`:

```bash
./scripts/vps-up.sh
```

Or equivalently:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps pull
docker compose -f docker-compose.vps.yml --env-file .env.vps up --no-build -d --wait
```

`./scripts/vps-up.sh` validates `.env.vps`, requires `600` or `400` permissions on Linux, creates `jobtrackr_pgdata` if needed, pulls images, and waits for health. It does not build from source.

The loopback origin is:

```text
http://127.0.0.1:18080
```

## Health, logs, and smoke

Inspect service health. Do not dump environment files into logs or tickets:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps ps
docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=100 backend
```

Confirm only the frontend is published, and only on loopback:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps port frontend 80
docker compose -f docker-compose.vps.yml --env-file .env.vps ps --format json
```

`port frontend 80` should print `127.0.0.1:18080` (or your `JOBTRACKR_PORT`). The `ps` publishers for postgres, backend, CV Generation, and Gotenberg should have no host port. `docker compose port` on an unpublished service can print `invalid IP:0`; that is not a host mapping.

From the VPS, check the loopback entrypoint, a nested React route, and API routing through frontend Nginx:

```bash
curl -fsS http://127.0.0.1:18080/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/applications/11111111-1111-1111-1111-111111111111/generate
curl -fsS http://127.0.0.1:18080/api/v1/auth/csrf
```

With prebuilt images loaded locally, the automated check is:

```bash
export JOBTRACKR_FRONTEND_IMAGE=ghcr.io/ricard0g/jobtrackr/frontend:sha-<commit>
export JOBTRACKR_BACKEND_IMAGE=ghcr.io/ricard0g/jobtrackr/backend:sha-<commit>
export JOBTRACKR_CV_GENERATION_IMAGE=ghcr.io/ricard0g/jobtrackr/cv-generation:sha-<commit>
./scripts/acceptance/vps-stack-smoke.sh
```

That smoke uses a disposable external volume name. It does not delete `jobtrackr_pgdata`.

Creating a Generated CV with the real Gemini provider is an operator check after R2 and Gemini credentials are configured. Deterministic CI does not call Gemini.

## Host edge

During the tunnel-only phase, public ports 80 and 443 stay closed. Cloudflare reaches the VPS through cloudflared. cloudflared must target host Nginx, not the frontend container:

```text
browser
  -- HTTPS --> Cloudflare Access (admission only)
  -- HTTPS --> Cloudflare Tunnel
  -- HTTP  --> system Nginx 127.0.0.1:18081
  -- HTTP  --> Docker frontend 127.0.0.1:${JOBTRACKR_PORT:-18080}
  -- HTTP  --> frontend Nginx (SPA + /api/v1)
  -- HTTP  --> backend  (private Compose network)
```

`18081` is an arbitrary system-Nginx loopback port. It is independent of `JOBTRACKR_PORT`. Do not point cloudflared at `127.0.0.1:18080`.

Sanitized examples:

- `config/nginx/vps-system.conf`
- `config/cloudflared/config.example.yml`

Replace `jobtrackr.example.test`, `REPLACE_WITH_TUNNEL_UUID`, and any credential paths before copying. Do not commit the filled-in host copies.

## System Nginx

System Nginx remains the shared gateway for every site on the VPS. JobTrackr is one `server` block. Copy the example into `sites-available`, enable it, then test and reload with the host's own Nginx tooling. Repository scripts must not write `/etc/nginx` or call `systemctl`.

The example listens on `127.0.0.1:18081` and proxies the complete hostname to `http://127.0.0.1:18080`. If you changed `JOBTRACKR_PORT`, change `proxy_pass` to match. Do not add a `listen` on `18080`, `80`, or `443` for this tunnel-only site.

The example sets `Host`, `X-Forwarded-Host`, `X-Forwarded-For`, and `X-Forwarded-Proto https`. The hop from cloudflared to system Nginx is HTTP, so `$scheme` would be wrong. Frontend Nginx already passes those headers through to Spring. Together they preserve the public hostname, the client chain, and the external HTTPS scheme so secure refresh and CSRF cookies are issued for `https://jobtrackr.example.test`.

`JOBTRACKR_PUBLIC_ORIGIN` and `CORS_ALLOWED_ORIGINS` in `.env.vps` must be that same `https://` origin. Spring already uses `server.forward-headers-strategy=framework`.

## Cloudflare Tunnel

Create a named tunnel and DNS route in the Cloudflare dashboard. Put the tunnel id and credentials file path into a host copy of `config/cloudflared/config.example.yml`. The ingress hostname must match `JOBTRACKR_PUBLIC_ORIGIN` without the scheme. The origin URL must be the system-Nginx loopback listener, such as `http://127.0.0.1:18081`.

Do not target `http://127.0.0.1:18080`, `http://frontend:80`, or any other Compose service. The later direct-HTTPS cutover keeps this same Nginx boundary.

This repository does not run `cloudflared login`, write `/etc/cloudflared`, or change host systemd units.

## Cloudflare Access

Put a Zero Trust Access application on the same hostname. Access is an outer admission gate: it decides who may reach the site at all. After Access admits a browser, the user still signs in to JobTrackr. JobTrackr authorization, CSRF, and refresh cookies are unchanged.

Do not trust `Cf-Access-Jwt-Assertion` or other Cloudflare identity headers as JobTrackr authentication. Do not disable JobTrackr login because Access is enabled.

Use placeholders for account, policy, and allowed-email values in any notes you keep next to the VPS. Do not commit those values.

## Public hostname verification

Keep host ports 80 and 443 closed for this phase. From the VPS, confirm they are not listening on public addresses, and that only the two JobTrackr loopback origins exist:

```bash
sudo ss -lnt
```

You should see `127.0.0.1:18081` (system Nginx) and `127.0.0.1:18080` (or your `JOBTRACKR_PORT`). You should not see `0.0.0.0:80`, `*:443`, or an all-interface Docker mapping.

From the VPS, the system-Nginx origin must serve the SPA, a nested React route, and the API:

```bash
curl -fsS -H "Host: jobtrackr.example.test" http://127.0.0.1:18081/health
curl -fsS -o /dev/null -w "%{http_code}\n" -H "Host: jobtrackr.example.test" http://127.0.0.1:18081/
curl -fsS -o /dev/null -w "%{http_code}\n" -H "Host: jobtrackr.example.test" \
  http://127.0.0.1:18081/applications/11111111-1111-1111-1111-111111111111/generate
curl -fsS -H "Host: jobtrackr.example.test" http://127.0.0.1:18081/api/v1/auth/csrf
```

Through the protected public hostname, after Cloudflare Access has admitted this client, the same four checks must hit JobTrackr over HTTPS. An Access login page or 302 to Cloudflare is not a pass:

```bash
curl -fsS https://jobtrackr.example.test/health
curl -fsS -o /dev/null -w "%{http_code}\n" https://jobtrackr.example.test/
curl -fsS -o /dev/null -w "%{http_code}\n" \
  https://jobtrackr.example.test/applications/11111111-1111-1111-1111-111111111111/generate
curl -fsS https://jobtrackr.example.test/api/v1/auth/csrf
```

`/health` must return `ok`, not Cloudflare HTML. Then sign in to JobTrackr in the browser and confirm a refresh cookie and CSRF cookie are stored for the `https://` origin with the Secure flag. An Access session is not a JobTrackr session.

Replace `jobtrackr.example.test` with your hostname. Do not paste Access cookies, JWTs, or environment values into tickets or logs.

## Loopback publishing and UFW

A process listening on `0.0.0.0` *inside a container* is reachable on the Docker bridge. That is required so frontend Nginx can reach `backend:8080`. It is not a host port.

A Docker *host mapping* of `0.0.0.0:18080->80` publishes that container on every VPS interface. UFW does not reliably hide that mapping: Docker installs its own iptables rules, so an all-interface publish can be reachable even when UFW looks closed. The VPS Compose file therefore hardcodes `127.0.0.1:${JOBTRACKR_PORT:-18080}:80`. Do not change that bind to `0.0.0.0`. Use a current Docker Engine.

System Nginx is a host process. Bind it to `127.0.0.1:18081` so only cloudflared on the same machine can reach it. Binding host Nginx on `0.0.0.0:18081` would expose the site without going through Cloudflare Access whenever that port is reachable.

## Later direct HTTPS

Direct HTTPS is an outer-edge change. Do not change `docker-compose.vps.yml`, the loopback frontend mapping, the private Compose network, or the external PostgreSQL volume.

When you are ready, you will:

- Give system Nginx certificates and a public `listen` on 443 (and 80 only for ACME if you need it)
- Open host firewall policy for those public ports
- Stop sending the JobTrackr hostname through the tunnel, or retire that tunnel route

Until then, leave 80 and 443 closed and keep cloudflared pointed at the loopback Nginx origin. Update, rollback, backup, and restore stay follow-on operations and also leave this inner topology alone.

## Teardown

Stop containers without deleting the database:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps down
```

Do not add `-v` unless you intend to remove Compose-owned resources. The external volume `jobtrackr_pgdata` is not removed by normal teardown. Destroying it is a separate command and loses application state.

Stopping Compose does not stop host Nginx or cloudflared. Update, rollback, backup, and restore are follow-on VPS operations. They do not change this inner Compose topology.
