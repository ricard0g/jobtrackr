## `2026-07-27` — Preview Generated CVs across all Output Formats

**Type:** `feature`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Documents listed Generated CVs but could not preview them. Users had to download each file and open it elsewhere, and DOCX outputs needed the same safe conversion path already used for Base CVs.

### Solution

Added ownership-checked Generated CV preview endpoints that stream PDF and Markdown inline and convert DOCX through Gotenberg with deterministic R2 caching. Documents rows open the shared preview dialog, while Download Original and Delete continue to act on the canonical source.

### What Changed

- Added `GET /api/v1/generated-cvs/{generatedCvId}/preview` with private, no-store streaming
- Reused Gotenberg conversion and Generated CV preview cache keys for DOCX sources
- Wired Documents Generated CV rows into the shared preview dialog
- Mirrored preview behavior in MSW and covered HTTP, service, and route seams

### Impact

Candidates can inspect Generated CVs of every Output Format from Documents without leaving JobTrackr or downloading first.
