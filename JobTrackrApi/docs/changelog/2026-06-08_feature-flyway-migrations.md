***

## `2026-06-08` — Flyway migrations added

**Type:** `feature`
**Branch:** `feature/flyway-migration-integration`
**Status:** `✅ Merged`

***

### Problem / Goal

The database schema needed a repeatable migration process instead of relying on a loose schema file. This makes local and deployed environments easier to keep in sync.

### Solution

Integrated Flyway into the Maven build and application configuration. The existing schema was moved into the first baseline migration under `db/migration`.

### What Changed

- Added Flyway dependencies to `pom.xml`
- Enabled Flyway configuration in `application.properties`
- Moved `schema.sql` to `V1__baseline_schema.sql`
- Established a versioned migration folder

### Impact

Database changes can now be versioned and applied consistently across environments.
