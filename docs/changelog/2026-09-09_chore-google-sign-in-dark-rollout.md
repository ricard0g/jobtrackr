***

## `2026-09-09` — Wire Google Sign-In environments and keep production dark

**Type:** `chore`
**Branch:** `feature/google-auth`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Google Sign-In existed in the application, but operators had no committed map of localhost, Compose, and the stable test tunnel, and production could be mistaken for a development client. Callback logging and single-replica session limits also needed an operational record before a real-Google smoke run.

### Solution

Documented the three development origins and redirect URIs against a separate development Google Cloud project, kept production disabled until consent metadata exists, and fail-closed incomplete enabled configuration. Callback responses and reverse-proxy logs omit authorization codes; in-memory OAuth sessions and rate limits stay single-replica.

### What Changed

- Documented host-run, Compose, and `https://test.ricardoguzdev.com` Google client URIs without committing secrets
- Hid Google actions when the provider is disabled while preserving Identity Links and password sign-in
- Added the stable-tunnel smoke checklist covering JIT, link, return, password creation, disconnect, cancel, retry, and disablement

### Impact

Operators can exercise Google Sign-In in supported development environments and keep production dark until its own hostname and consent screen are ready.
