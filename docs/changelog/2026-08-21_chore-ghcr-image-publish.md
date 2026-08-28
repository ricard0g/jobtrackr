***

## `2026-08-21` — Publish verified application images to GHCR

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

A verified JobTrackr commit could not be turned into deployable frontend, backend, and CV Generation images. Without GHCR publication, a VPS operator had no immutable revision to pull, and local Compose still rebuilt images instead of proving the artifacts that would be released.

### Solution

GitHub Actions now builds the three application images independently, runs their existing test gates, validates rendered Compose, and smokes the exact prebuilt images before pushing immutable `sha-` tags with `GITHUB_TOKEN`. A moving branch tag may exist for discovery; it is not the rollback identity.

### What Changed

- Added a Release images workflow that publishes to GHCR only after verification and never from pull requests
- Added release smoke that starts Compose with `--no-build` against the built image coordinates
- Documented the three GHCR coordinates, tag policy, publication events, and manual pull verification

### Impact

Operators can pull a specific commit's frontend, backend, and CV Generation images from GHCR instead of building language toolchains on the VPS.
