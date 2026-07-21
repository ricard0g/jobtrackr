## `2026-07-18` — Async CV generation hardened after review

**Type:** `fix`
**Branch:** `cursor/fix-cv-generation-review-182c`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Review of the asynchronous CV workflow identified concurrency, cleanup, validation, and UI edge cases. These could cause incorrect state changes, unsafe document handling, or inconsistent status updates outside the normal success path.

### Solution

Hardened the workflow without changing its normal user flow. The changes establish safer deletion and finalization behavior, enforce worker lease ownership, strengthen document and timeout limits, and correct frontend update behavior.

### What Changed

- Made application deletion and generation cancellation safe for active work
- Finalized uploads outside database locks with compensation on failure
- Enforced worker lease ownership and supported parallel workers
- Added DOCX, page-count, timeout, and request-validation protections
- Fixed frontend cascade handling and failure correlation IDs

### Impact

CV generation remains reliable when work is cancelled, retried, processed in parallel, or receives invalid input.
