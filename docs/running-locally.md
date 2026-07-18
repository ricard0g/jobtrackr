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

This also starts the FastAPI CV generation service on `http://localhost:8081` (fake Gemini provider by default).

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
curl http://localhost:8081/health/live
```

Flyway runs automatically when the API starts against a fresh database.

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
