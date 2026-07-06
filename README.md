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

Use `./scripts/db-dump-local-pg.sh` to export data from the existing `local-pg` Docker container into `db/dumps/local-data.sql`.

`db/dumps/` is intentionally ignored by Git because local database dumps may contain personal data, password hashes, refresh tokens, or other sensitive state. Commit a sanitized seed file under `db/seed/` only when it is safe for cloud agents and GitHub.

To rebuild a local database:

```bash
./scripts/db-reset.sh
./scripts/dev-api.sh
./scripts/db-restore-dump.sh db/dumps/local-data.sql
```

Run the API before restoring a data-only dump so Flyway can create the schema first.
