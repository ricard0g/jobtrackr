# JobTrackr

JobTrackr is a job-search workspace for tracking applications, companies, interviews, follow-up tasks, tags, saved views, and CV/job-description references from one place.

The app is built as a monorepo with a Spring Boot API, a Vite/React web client, PostgreSQL persistence, and Flyway-managed schema migrations.

## What It Supports

- Track job applications across a Kanban-style pipeline.
- Manage global and user-scoped companies.
- Tag applications by stack, modality, priority, and company type.
- Store interview steps, status history, and follow-up tasks.
- Keep references to CV versions and captured job descriptions.
- Run with deterministic development data for local work and cloud agents.

## Repository Layout

```text
JobTrackrApi/     Spring Boot API and Flyway migrations
jobtrackr-web/    Vite/React frontend
db/               Seed and local database dump locations
docs/             Root project documentation
scripts/          Local development and database helper scripts
```

## Documentation

- [Development Setup](docs/development.md): run the full stack, reset the DB, restore local snapshots, and seed cloud-agent-safe data.
- [Docs Index](docs/README.md): root documentation entry point.
- [Project Changelog](docs/changelog/): commit-based records for project changes not covered by the API changelog.

Subproject-specific notes remain in `JobTrackrApi/docs/` and `jobtrackr-web/docs/`.
