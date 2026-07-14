***

## `2026-07-10` — Single ngrok tunnel for cloud phone testing added

**Type:** `feature`
**Branch:** `main`
**Status:** `✅ Merged`

***

### Problem / Goal

Phone testing in cloud environments required separate, fragile frontend and API exposure steps.

### Solution

Added Nginx routing and tunnel scripts so one ngrok tunnel can serve the cloud development flow.

### What Changed

- Added Nginx configurations for cloud development.
- Added commands to start and stop the cloud tunnel.
- Updated CORS, CSRF, frontend, and development guidance for the tunnel.

### Impact

Mobile devices can test the cloud-hosted app through one stable tunnel.
