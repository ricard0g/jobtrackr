# Changelog Entry — `docs/changelog/`

***

## `2026-08-07` — Cloud-agent phone testing switched to Cloudflare Tunnel

**Type:** `chore`
**Branch:** `docs/cloud-agent-cloudflare-tunnel`
**Status:** `🔄 In Progress`

***

### Problem / Goal

Cloud-agent phone previews relied on ngrok, which needed an authtoken and showed an interstitial warning page. Cloudflare quick tunnels are simpler for the same nginx-backed workflow.

### Solution

Replaced the ngrok-based cloud-agent tunnel docs and scripts with Cloudflare Tunnel (`cloudflared`) quick tunnels that expose nginx on `localhost:9080` via a random `*.trycloudflare.com` URL.

### What Changed

- Replaced `ngrok-dev.md` with `cloudflare-tunnel-dev.md` and updated agent/README links
- Updated `cloud-tunnel-up.sh` / `cloud-tunnel-down.sh` to start and stop `cloudflared`
- Allowed `.trycloudflare.com` hostnames in Vite; CORS now targets Cloudflare tunnel origins
- Documented the new workflow in `docs/development.md` and `AGENTS.md`

### Impact

Cloud agents can now share a phone-ready HTTPS URL without configuring ngrok credentials or asking users to dismiss a warning page.
