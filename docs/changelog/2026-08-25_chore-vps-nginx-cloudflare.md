***

## `2026-08-25` — Route the VPS stack through host Nginx and Cloudflare Access

**Type:** `chore`
**Branch:** `feature/full-containerization-services`
**Status:** `🔄 In Progress`

***

### Problem / Goal

The VPS Compose stack published a loopback frontend, but operators had no sanitized path from that mapping through host Nginx, a named Cloudflare Tunnel, and Zero Trust Access. Without that edge, HTTPS cookies, hostname origin rules, and the later direct-HTTPS cutover would be guessed rather than documented.

### Solution

Sanitized system-Nginx and cloudflared examples now sit in front of the existing loopback frontend. cloudflared targets host Nginx, not a container. The runbook covers Access as an admission gate, forwarded HTTPS headers, UFW versus Docker publishing, closed public ports, and the later outer-edge HTTPS change.

### What Changed

- Added loopback-only system Nginx and placeholder cloudflared examples
- Validated that cloudflared cannot target the Docker frontend port
- Documented Access, public-hostname checks, UFW, and the direct-HTTPS boundary

### Impact

An operator can put JobTrackr on a Cloudflare Access HTTPS hostname without publishing a Docker port on the VPS public interfaces, and without replacing JobTrackr login.
