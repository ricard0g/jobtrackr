## `2026-07-21` — CV generation dependencies and Gemini configuration documented

**Type:** `chore`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The CV generation service did not commit its resolved `uv` dependency lockfile, making repeatable installs less certain. The example environment file also needed a clear Gemini-key placeholder that could not be mistaken for a real credential.

### Solution

Committed the service's `uv.lock` file and documented an empty Gemini API-key placeholder in the local environment example. The fake provider remains the default for local development and CI.

### What Changed

- Added the CV generation service's resolved `uv.lock` file
- Added an explicitly empty `GOOGLE_AI_API_KEY` placeholder in `.env.example`
- Kept `GEMINI_API_KEY` documented as an optional alternative
- Avoided including any credential in tracked configuration

### Impact

Developers get reproducible CV-service dependency installs and safe, clear guidance for opting into Gemini.
