***

## `2026-07-16` — Base CV upload lock and signed-download flow fixed

**Type:** `fix`
**Branch:** `feature/dashboard-redesign-and-r2-bucket-integration`
**Status:** `✅ Merged`

***

### Problem / Goal

Base CV uploads could evaluate quota and duplicates outside the row lock, and downloads relied on awkward blob/DOM helpers instead of a signed URI response.

### Solution

Moved quota and duplicate checks under the upload lock, returned a signed download URI as JSON, and opened downloads from the Documents UI action using that response.

### What Changed

- Updated Base CV service/controller upload locking and download response handling.
- Simplified the web API client download path and refreshed Documents route behavior.
- Updated API tests, mocks, and Base CV types for the signed-URI flow.

### Impact

Uploads avoid duplicate races, and users can download a base CV through a signed URI without client-side blob workarounds.
