## `2026-07-21` — Local CV generation and application loading unblocked

**Type:** `fix`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Local development could not reliably load applications or start CV generation. Applications without tags could also fail to load, and browser requests using the idempotency header could be rejected before reaching the API.

### Solution

Aligned authentication and HTTP-client behavior between the Spring API and Python CV generation service. The application data and CORS handling now support the local Generate workflow.

### What Changed

- Aligned Spring-to-Python service authentication for local runs
- Corrected local CV-generation HTTP client behavior
- Allowed untagged applications to load
- Permitted `Idempotency-Key` CORS preflight requests

### Impact

Developers can load all applications and exercise CV generation locally without browser or service-integration failures.
