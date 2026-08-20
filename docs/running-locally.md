# Running JobTrackr Locally

This guide is for day-to-day human development in the monorepo.

Run all commands from the repository root unless a step explicitly says otherwise:

```bash
cd /home/ricardo/code/saas/jobtrackr
```

## First-Time Setup

Create your local environment file:

```bash
cp .env.example .env
```

That file is for host-run Spring Boot and Vite. Full Compose uses a separate sanitized file:

```bash
cp .env.compose.example .env.compose
```

Replace the Compose placeholders before starting the five-service stack. Do not copy host-run `localhost` URLs or the documented default PostgreSQL password into `.env.compose`.

Start Postgres, CV Generation, and Gotenberg for host-run development:

```bash
./scripts/dev-up.sh
```

The first backend or frontend run may download dependencies.

## Run Only The Frontend

Use this when working on UI with mocked API data:

```bash
VITE_API_MOCKING=true ./scripts/dev-web.sh
```

The web app runs at:

```text
http://localhost:5173
```

Use this mode when you do not need the real Spring Boot API or Postgres-backed data.

## Run Only The Backend

Start Postgres:

```bash
./scripts/dev-up.sh
```

This also starts the FastAPI CV generation service on `http://localhost:8081`. User-facing CV generation requires the Gemini provider and a configured Google AI API key.

DOCX preview conversion uses the pinned Gotenberg LibreOffice service on `http://localhost:3000`. If Postgres and CV generation are already running, start only Gotenberg:

```bash
./scripts/dev-gotenberg.sh
```

Start the API:

```bash
./scripts/dev-api.sh
```

The API runs at:

```text
http://localhost:8080
```

Health check:

```bash
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/health/readiness
curl http://localhost:8081/health/live
curl http://localhost:3000/health
```

Flyway runs automatically when the API starts against a fresh database.

Host-development `.env` values (`DB_HOST=localhost:5432`, `CV_GENERATION_SERVICE_BASE_URL=http://localhost:8081`, `GOTENBERG_BASE_URL=http://localhost:3000`) are for this workflow. They are not valid inside the Compose network.

## Run The Backend Container

This is optional and separate from host-run Spring Boot. The image runs the API, Flyway, and the embedded generation, storage-cleanup, and purge workers as one process against Compose DNS names.

```bash
docker compose --profile full --env-file .env.compose up --build backend
```

The backend listens on container port 8080 and is not published to the host. Readiness is `/actuator/health/readiness`. The `production` profile rejects missing PostgreSQL password, JWT signing key, CV Generation service token, and R2 configuration, and it rejects the documented example JWT signing key and PostgreSQL password.

Prove the image through the container network:

```bash
./scripts/acceptance/backend-container-smoke.sh
```

To exercise the backend together with the published frontend, use [Run The Full Compose Stack](#run-the-full-compose-stack). Keep using `./scripts/dev-api.sh` for everyday code iteration.

## Run The CV Generation Container

This is the production-shaped FastAPI image. A clean build runs the service pytest suite, then starts as a non-root process that reads only environment variables.

```bash
docker compose up --build cv-generation
```

Liveness is `/health/live`. Readiness is `/health/ready` and fails when Gemini configuration is missing or when the documented default service token is used outside local/test. Local Compose sets `CV_GENERATION_PROFILE=local`. The release image itself defaults to `production`.

The fake provider is off unless you set `CV_GENERATION_ALLOW_FAKE_PROVIDER=true`. Do not use that setting for user-facing generation.

Prove the image:

```bash
./scripts/acceptance/cv-generation-container-smoke.sh
```

Keep using `./scripts/dev-cv-gen.sh` or the Compose service from `./scripts/dev-up.sh` for everyday iteration.

## Run The Frontend Container

This is optional and separate from host-run Vite. The image type-checks, builds the production bundle with mocking disabled and an empty API origin, and serves it with Nginx as a same-origin entrypoint for the SPA and `/api/v1`.

```bash
docker compose --profile full up --build frontend
```

Nginx listens on container port 80. The full Compose profile publishes it on loopback `127.0.0.1:18080` by default. Health is `/health`. Nested React Router paths return the application shell. `/api/v1` is proxied to the `backend` service. Hashed `/assets/` files are cached as immutable. The image does not embed a deployment hostname or secret.

Prove health, static delivery, SPA fallback, and an API request through Nginx:

```bash
./scripts/acceptance/frontend-container-smoke.sh
```

Keep using `./scripts/dev-web.sh` for everyday UI iteration.

## Run The Full Compose Stack

This starts frontend, backend, PostgreSQL, CV Generation, and Gotenberg as one application. It is the local production-shaped path, not the later VPS/GHCR workflow.

```bash
cp .env.compose.example .env.compose
docker compose --profile full --env-file .env.compose up --build
```

Or:

```bash
./scripts/dev-full.sh
```

The stack uses sanitized `.env.compose` values. Compose injects service DNS names (`postgres`, `cv-generation`, `gotenberg`, `backend`); containers do not call each other through localhost. Health checks order PostgreSQL, CV Generation, Gotenberg, backend, then frontend. Runtime retry in the application still applies after startup.

Open:

```text
http://127.0.0.1:18080
```

The application entrypoint is the frontend on loopback. Change `JOBTRACKR_PORT` in `.env.compose` if 18080 is taken. Backend stays unpublished. PostgreSQL, CV Generation, and Gotenberg still publish host ports so `./scripts/dev-up.sh` can serve the host-run workflow from the same Compose file. Containers reach each other by service DNS, not those host ports.

Host-run Spring Boot and Vite stay available. `./scripts/dev-up.sh` still starts only PostgreSQL, CV Generation, and Gotenberg for that workflow.

Prove the rendered Compose file, the published origin, authentication through frontend Nginx, and PostgreSQL volume persistence:

```bash
./scripts/acceptance/compose-config-validate.sh
./scripts/acceptance/postgres-volume-smoke.sh
./scripts/acceptance/full-stack-smoke.sh
```

Those checks use committed placeholder credentials and do not call the real Gemini API. After the stack is up with real R2 values, run Documents through the same origin:

```bash
JOBTRACKR_APP_ORIGIN=http://127.0.0.1:18080 ./scripts/acceptance/documents-real-stack.sh
```

`JOBTRACKR_APP_ORIGIN` is the acceptance entrypoint. It is not a Vite build variable.

## Run Backend With Seed Data

Start Postgres:

```bash
./scripts/dev-up.sh
```

Start the API in one terminal so Flyway creates the schema:

```bash
./scripts/dev-api.sh
```

In another terminal, run the explicit development seed:

```bash
./scripts/db-seed-dev.sh
```

Seed login:

```text
agent@example.test / dev-password
```

This seed is not a Flyway migration. It only runs when you call the script, and it is guarded by `JOBTRACKR_SEED_ENV` in `.env`.

## Run The Full App

Use **either** host-run terminals **or** the full Compose stack. Do not treat the cloud-agent quick tunnel or a future VPS deployment as this local workflow.

### Host-run (fast iteration)

Use three terminals.

Terminal 1: start Postgres, CV Generation, and Gotenberg.

```bash
./scripts/dev-up.sh
```

Terminal 2: start the API.

```bash
./scripts/dev-api.sh
```

Terminal 3: start the web app.

```bash
./scripts/dev-web.sh
```

Open:

```text
http://localhost:5173
```

If you want deterministic demo data, run this once after the API has started and Flyway has created the schema:

```bash
./scripts/db-seed-dev.sh
```

### Full Compose (production-shaped)

```bash
./scripts/dev-full.sh
```

Open:

```text
http://127.0.0.1:18080
```

## Reset The Local Database

This destroys the local Compose Postgres volume:

```bash
./scripts/db-reset.sh
```

After reset, start the API again so Flyway recreates the schema:

```bash
./scripts/dev-api.sh
```

Then optionally seed the database:

```bash
./scripts/db-seed-dev.sh
```

## Restore Your Local Snapshot

The repository can store ignored local snapshots under `db/dumps/`.

Dump and restore address the Compose `postgres` service, not a fixed container name. Start Postgres first with `./scripts/dev-up.sh` if it is not already running.

To restore the existing local snapshot:

```bash
./scripts/db-reset.sh
./scripts/db-restore-dump.sh db/dumps/local-snapshot.dump
```

Do not commit raw files in `db/dumps/`; they may contain personal data.

## Documents Real-Stack Acceptance

To prove Documents against the live application origin, Postgres, R2, and pinned Gotenberg:

```bash
./scripts/acceptance/documents-real-stack.sh
```

Host-run defaults to `http://localhost:8080`. After starting the full Compose stack, point acceptance at the published frontend:

```bash
JOBTRACKR_APP_ORIGIN=http://127.0.0.1:18080 ./scripts/acceptance/documents-real-stack.sh
```

See `docs/acceptance/documents-real-stack.md` for prerequisites, the automated HTTP path, and the manual UI checklist. Deterministic Compose smoke does not call Gemini.

## Stopping Services

Stop host-run API and frontend with `Ctrl+C` in their terminals.

Stop infrastructure Compose services, or the full stack:

```bash
docker compose down
```

Stop Compose and delete the local PostgreSQL volume:

```bash
docker compose down -v
```

## Git Workflow

Use the root Git repository only.

The monorepo has one `.git` directory at the root:

```text
/home/ricardo/code/saas/jobtrackr/.git
```

Do not commit separately inside `JobTrackrApi/` or `jobtrackr-web/`. Those directories are regular folders now, not separate repositories.

Typical workflow:

```bash
git status
git switch -c feature/my-change
git add JobTrackrApi jobtrackr-web db docs scripts README.md
git commit -m "Describe the change"
```

You can still inspect history for one project or file:

```bash
git log -- JobTrackrApi
git log -- jobtrackr-web
git log -- JobTrackrApi/pom.xml
git log -- jobtrackr-web/package.json
```

When you create the new GitHub repository, add it as the root remote:

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

After that, all future backend, frontend, docs, database seed, and script changes are committed and pushed from the monorepo root.
