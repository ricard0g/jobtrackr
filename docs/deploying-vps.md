# Deploy JobTrackr on a VPS

This is the standalone VPS path. It pulls immutable frontend, backend, and CV Generation images from GHCR, keeps PostgreSQL on an external volume, and publishes exactly one loopback frontend entrypoint.

It is not host-run Spring/Vite, not local full Compose, and not the later host Nginx / Cloudflare Access edge. Those local workflows stay in [Running Locally](running-locally.md). Image coordinates and tag policy are in [Publishing Images](releasing-images.md).

An operator does not need the Git checkout, Java, Node, or Python build toolchains on the VPS. Docker Engine and the Compose file plus a sanitized environment file are enough.

## Topology

Five Compose services share a private user-defined bridge network named `jobtrackr`:

| Service | Image | Host ports |
|---|---|---|
| frontend | `ghcr.io/ricard0g/jobtrackr/frontend:sha-<commit>` | `127.0.0.1:${JOBTRACKR_PORT:-18080}` → container `80` |
| backend | `ghcr.io/ricard0g/jobtrackr/backend:sha-<commit>` | none |
| postgres | `postgres:16` | none |
| cv-generation | `ghcr.io/ricard0g/jobtrackr/cv-generation:sha-<commit>` | none |
| gotenberg | `gotenberg/gotenberg:8.34.0-libreoffice` | none |

`18080` is an arbitrary high-port default. Change `JOBTRACKR_PORT` if another site already uses it. The host bind is hardcoded to IPv4 `127.0.0.1` in `docker-compose.vps.yml`. It is the Docker-owned loopback mapping, not a port on which system Nginx also listens.

Services listen on all container interfaces so the Compose network can reach them. Exposure is restricted by publishing only the frontend to `127.0.0.1`. Do not publish backend, PostgreSQL, CV Generation, or Gotenberg, and do not assume UFW will hide an all-interface Docker mapping.

The backend image already processes `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For`. Frontend Nginx forwards those headers when an outer HTTPS hop is present. Set `JOBTRACKR_PUBLIC_ORIGIN` and `CORS_ALLOWED_ORIGINS` to the public HTTPS hostname you will put in front of this loopback entrypoint. Set `JWT_REFRESH_COOKIE_SECURE=true`. Do not set `JWT_REFRESH_COOKIE_ALLOW_INSECURE` on the VPS.

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

Copy `docker-compose.vps.yml` and `.env.vps.example` onto the VPS. You do not need the rest of the repository.

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

## Teardown

Stop containers without deleting the database:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps down
```

Do not add `-v` unless you intend to remove Compose-owned resources. The external volume `jobtrackr_pgdata` is not removed by normal teardown. Destroying it is a separate command and loses application state.

Host Nginx, Cloudflare Tunnel, Zero Trust Access, update, rollback, backup, and restore are follow-on VPS operations. They do not change this inner Compose topology.
