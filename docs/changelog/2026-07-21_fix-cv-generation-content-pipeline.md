## `2026-07-21` — CV generation now produces structured content

**Type:** `fix`
**Branch:** `feature/candidate-evidence-pipeline`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Successful CV generations could contain only a candidate name and contact details. The service was using its deterministic test provider in local user flows, and its quality checks accepted structurally empty documents.

### Solution

User-facing generation now requires Gemini. A dedicated model-backed Candidate Evidence stage structures the Base CV before job-specific drafting, completeness gates reject sparse outputs, and bounded thinking keeps generation within the request deadline.

### What Changed

- Restricted the fake provider to explicitly enabled automated tests
- Added structured Candidate Evidence interpretation before drafting
- Replaced the retired Gemini 2.0 Flash default with low-latency Gemini 3.1 Flash-Lite
- Bounded model thinking and output tokens, with per-stage latency and token telemetry
- Rejected structurally empty evidence and canonical CVs

### Impact

Users now receive a substantively structured CV or a clear generation failure instead of a misleading two-line artifact.
