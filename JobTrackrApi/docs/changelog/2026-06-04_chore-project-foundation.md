***

## `2026-06-04` — Spring Boot project foundation added

**Type:** `chore`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

The project needed its initial backend structure, build tooling, and contributor guidance. Without this foundation, feature work would lack a consistent way to build, run, and understand the API.

### Solution

Added the Maven wrapper, Spring Boot `pom.xml`, repository ignore rules, and project documentation. The commit also introduced architecture notes and agent instructions so future changes could follow the same conventions.

### What Changed

- Added Maven wrapper files and project `pom.xml`
- Added `.gitignore` and `.gitattributes`
- Added `AGENTS.md` development instructions
- Added initial database architecture documentation

### Impact

The backend now has a runnable Spring Boot foundation and clear development conventions.
