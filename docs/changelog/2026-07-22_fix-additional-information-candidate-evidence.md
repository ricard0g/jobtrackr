## `2026-07-22` — Include additional information in Candidate Evidence

**Type:** `fix`
**Branch:** `feature/candidate-evidence-pipeline`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Users could supply employment history only in `additional_information`, but Candidate Evidence interpretation looked at the Base CV alone. The completeness gate then rejected generation even when the combined input was valid.

### Solution

Interpretation now receives `additional_information` as authoritative source material alongside the Base CV. Deterministic hints also cover additions, and merge keeps projects plus key/value overrides before validation.

### What Changed

- Passed `additional_information` into `interpret_base_cv` for model-backed structuring
- Built deterministic hints from Base CV plus user additions
- Merged projects from additions and kept KV overrides authoritative
- Added regression coverage for free-form and section-structured additions

### Impact

Now users can complete sparse Base CVs with free-form additions and still get a structured Generated CV instead of a false extractability failure.
