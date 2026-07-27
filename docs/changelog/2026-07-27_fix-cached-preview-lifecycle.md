## `2026-07-27` — Harden the cached DOCX preview lifecycle

**Type:** `fix`
**Branch:** `feature/documents-route-redesign-and-doc-preview`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Cached DOCX previews needed clearer guarantees under concurrent opens, abandoned requests, conversion failures, and source deletion so derived preview objects cannot weaken Base CV or Generated CV lifecycle reliability.

### Solution

Documented and covered in-instance conversion coalescing, in-flight retry after failure, and post-disconnect cache warming for Base CV DOCX previews. Generated CV deletion now schedules both the canonical object and the deterministic preview key for durable cleanup, including when an Application is removed.

### What Changed

- Covered Base CV DOCX coalescing, failure retry, disconnect warming, and active-generation delete protection
- Skipped preview cache warm when the source Base CV disappears during conversion
- Scheduled Generated CV preview keys alongside canonical objects on delete
- Retried preview-key cleanup failures through the existing storage cleanup worker path

### Impact

Preview caching now behaves safely under concurrency and deletion without blocking users from removing documents or retrying failed previews.
