#!/usr/bin/env bash
set -euo pipefail

TMUX_CONF="/exec-daemon/tmux.portal.conf"

tmux_cmd() {
	if [[ -f "$TMUX_CONF" ]]; then
		tmux -f "$TMUX_CONF" "$@"
	else
		tmux "$@"
	fi
}

for session in ngrok-tunnel nginx-proxy vite-dev-server api-dev-server; do
	tmux_cmd kill-session -t "$session" 2>/dev/null || true
done

rm -f /tmp/jobtrackr-nginx.pid /tmp/jobtrackr-nginx-error.log /tmp/jobtrackr-nginx-access.log
rm -rf /tmp/jobtrackr-nginx-client-body /tmp/jobtrackr-nginx-proxy /tmp/jobtrackr-nginx-fastcgi /tmp/jobtrackr-nginx-uwsgi /tmp/jobtrackr-nginx-scgi

echo "Stopped cloud tunnel tmux sessions."
