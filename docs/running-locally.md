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

Start Postgres:

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
docker compose --profile full up --build backend
```

The backend listens on container port 8080 and is not published to the host. Readiness is `/actuator/health/readiness`. The `production` profile rejects missing PostgreSQL password, JWT signing key, CV Generation service token, and R2 configuration, and it rejects the documented example JWT signing key.

Prove the image through the container network:

```bash
./scripts/acceptance/backend-container-smoke.sh
```

Keep using `./scripts/dev-api.sh` for everyday code iteration.

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

Use three terminals.

Terminal 1: start Postgres.

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

To restore the existing local snapshot:

```bash
./scripts/db-reset.sh
./scripts/db-restore-dump.sh db/dumps/local-snapshot.dump
```

Do not commit raw files in `db/dumps/`; they may contain personal data.

## Documents Real-Stack Acceptance

To prove Documents against the live API, Postgres, R2, and pinned Gotenberg:

```bash
./scripts/acceptance/documents-real-stack.sh
```

See `docs/acceptance/documents-real-stack.md` for prerequisites, the automated HTTP path, and the manual UI checklist.

## Stopping Services

Stop the API and frontend with `Ctrl+C` in their terminals.

Stop Postgres:

```bash
docker compose down
```

Stop Postgres and delete its local data volume:

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
