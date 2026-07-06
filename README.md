# JobTrackr

Monorepo for the JobTrackr Spring Boot API and Vite web app.

## Layout

```text
JobTrackrApi/     Spring Boot API and Flyway migrations
jobtrackr-web/    Vite/React frontend
db/               Local seed/dump helpers
scripts/          Monorepo development scripts
```

## Local Setup

```bash
cp .env.example .env
./scripts/dev-up.sh
./scripts/dev-api.sh
./scripts/dev-web.sh
```

The API runs on `http://localhost:8080`.
The web app runs on `http://localhost:5173`.

Flyway migrations live in `JobTrackrApi/src/main/resources/db/migration`.
The database schema is recreated from those migrations whenever the API starts against a fresh database.

## Database Portability

Use `./scripts/db-dump-local-pg.sh` to export a full PostgreSQL snapshot from the existing `local-pg` Docker container into `db/dumps/local-snapshot.dump`.

`db/dumps/` is intentionally ignored by Git because local database dumps may contain personal data, password hashes, or other sensitive state. Commit a sanitized seed file under `db/seed/` only when it is safe for cloud agents and GitHub.

To rebuild a local database from an exact snapshot:

```bash
./scripts/db-reset.sh
./scripts/db-restore-dump.sh db/dumps/local-snapshot.dump
```

Do not run the API before restoring a full snapshot unless you intentionally want the restore script to replace the schema Flyway created.

## Development Seed

For a safe cloud-agent dataset, run the explicit seed after Flyway has created the schema:

```bash
cp .env.example .env
./scripts/dev-up.sh
```

Start the API once so Flyway creates the schema:

```bash
./scripts/dev-api.sh
```

Then run the seed from another shell:

```bash
./scripts/db-seed-dev.sh
```

The seed is not a Flyway migration. It is intentionally opt-in and guarded by `JOBTRACKR_SEED_ENV=dev`, `local`, or `cloud-agent`.

Seed login:

```text
agent@example.test / dev-password
```

The committed seed file is `db/seed/dev.sql`. It contains fake users, user-scoped companies/tags, applications across every Kanban status, interviews, tasks, status history, saved views, and fake CV/job-description references.
