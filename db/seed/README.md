# Seed Data

Commit sanitized, deterministic development seed data here.

Keep raw local database exports in `db/dumps/`; that directory is ignored by Git.
If you need a committed seed for cloud agents, derive it from a reviewed dump and remove personal data, refresh tokens, production-like secrets, and anything you do not want in GitHub.

`dev.sql` is intentionally run by `scripts/db-seed-dev.sh`; it is not a Flyway migration.
