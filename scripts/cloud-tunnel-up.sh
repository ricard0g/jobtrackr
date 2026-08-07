#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMUX_CONF="/exec-daemon/tmux.portal.conf"
CLOUDFLARED_LOG="/tmp/jobtrackr-cloudflared.log"
MOCK_MODE=false

usage() {
	cat <<'EOF'
Usage: ./scripts/cloud-tunnel-up.sh [--mock]

Start Postgres (full stack only), API, Vite, nginx, and a Cloudflare quick tunnel for phone testing.

  --mock   Vite + MSW only (no Postgres/API); uses config/nginx/cloud-dev-mock.conf

Requires: nginx, cloudflared, docker, npm, java
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--mock)
			MOCK_MODE=true
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
	esac
done

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		case "$1" in
			nginx)
				echo "Install nginx (e.g. apt-get install -y nginx) and retry." >&2
				;;
			cloudflared)
				echo "Install cloudflared (see jobtrackr-web/docs/cloud-agent/cloudflare-tunnel-dev.md)." >&2
				;;
			docker)
				echo "Docker is required for Postgres in full-stack mode." >&2
				;;
		esac
		exit 1
	fi
}

require_cmd nginx
require_cmd cloudflared
require_cmd npm
require_cmd java

if [[ "$MOCK_MODE" == false ]]; then
	require_cmd docker
fi

tmux_cmd() {
	if [[ -f "$TMUX_CONF" ]]; then
		tmux -f "$TMUX_CONF" "$@"
	else
		tmux "$@"
	fi
}

kill_session() {
	tmux_cmd kill-session -t "$1" 2>/dev/null || true
}

wait_for_url() {
	local url="$1"
	local label="$2"
	local attempts="${3:-60}"

	for ((i = 1; i <= attempts; i++)); do
		if curl -sf "$url" >/dev/null 2>&1; then
			echo "$label is ready ($url)"
			return 0
		fi
		sleep 2
	done

	echo "Timed out waiting for $label ($url)" >&2
	return 1
}

get_tunnel_url() {
	if [[ ! -f "$CLOUDFLARED_LOG" ]]; then
		return 1
	fi
	grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | head -n1
}

start_vite_session() {
	local extra_env="${1:-}"
	kill_session vite-dev-server

	if [[ "$MOCK_MODE" == true ]]; then
		tmux_cmd new-session -d -s vite-dev-server -c "$ROOT_DIR/jobtrackr-web" -- \
			bash -lc "${extra_env}env VITE_API_MOCKING=true npm run dev"
	else
		tmux_cmd new-session -d -s vite-dev-server -c "$ROOT_DIR/jobtrackr-web" -- \
			bash -lc "${extra_env}env VITE_API_MOCKING=false VITE_API_ORIGIN= npm run dev"
	fi
}

if [[ -f "$ROOT_DIR/.env" ]]; then
	set -a
	# shellcheck disable=SC1091
	. "$ROOT_DIR/.env"
	set +a
fi

export JWT_REFRESH_COOKIE_SECURE=true
export JWT_REFRESH_COOKIE_SAME_SITE=Lax

NGINX_CONFIG="$ROOT_DIR/config/nginx/cloud-dev.conf"
if [[ "$MOCK_MODE" == true ]]; then
	NGINX_CONFIG="$ROOT_DIR/config/nginx/cloud-dev-mock.conf"
	export VITE_API_MOCKING=true
else
	export VITE_API_MOCKING=false
	export VITE_API_ORIGIN=
	"$ROOT_DIR/scripts/dev-up.sh"
fi

if [[ "$MOCK_MODE" == false ]]; then
	kill_session api-dev-server
	tmux_cmd new-session -d -s api-dev-server -c "$ROOT_DIR" -- \
		bash -lc './scripts/dev-api.sh'
	wait_for_url "http://localhost:8080/actuator/health" "API"
fi

start_vite_session ""
wait_for_url "http://localhost:5173/" "Vite"

kill_session nginx-proxy
mkdir -p /tmp/jobtrackr-nginx-client-body /tmp/jobtrackr-nginx-proxy /tmp/jobtrackr-nginx-fastcgi /tmp/jobtrackr-nginx-uwsgi /tmp/jobtrackr-nginx-scgi
tmux_cmd new-session -d -s nginx-proxy -c "$ROOT_DIR" -- \
	bash -lc "nginx -c '$NGINX_CONFIG' -g 'daemon off;'"
wait_for_url "http://localhost:9080/" "nginx"

kill_session cloudflared-tunnel
rm -f "$CLOUDFLARED_LOG"
tmux_cmd new-session -d -s cloudflared-tunnel -c "$ROOT_DIR" -- \
	bash -lc "cloudflared tunnel --url http://localhost:9080 2>&1 | tee '$CLOUDFLARED_LOG'"

TUNNEL_URL=""
for ((i = 1; i <= 45; i++)); do
	if TUNNEL_URL="$(get_tunnel_url 2>/dev/null || true)" && [[ -n "$TUNNEL_URL" ]]; then
		break
	fi
	sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
	echo "Failed to read Cloudflare public URL from $CLOUDFLARED_LOG" >&2
	exit 1
fi

TUNNEL_HOST="$(python3 -c "from urllib.parse import urlparse; print(urlparse('$TUNNEL_URL').hostname)")"
echo "Cloudflare URL: $TUNNEL_URL"
echo "Cloudflare host: $TUNNEL_HOST"

start_vite_session "export VITE_HMR_HOST='$TUNNEL_HOST'; "
wait_for_url "http://localhost:5173/" "Vite (HMR host)"

echo ""
echo "Cloud tunnel is up."
echo "  Public URL: $TUNNEL_URL"
if [[ "$MOCK_MODE" == true ]]; then
	echo "  Mode: mock API (MSW)"
else
	echo "  Mode: full stack (Postgres + API + Vite)"
	echo "  Seed login: agent@example.test / dev-password"
fi
echo ""
echo "Verify:"
echo "  curl -s -o /dev/null -w '%{http_code}\n' '$TUNNEL_URL/'"
if [[ "$MOCK_MODE" == false ]]; then
	echo "  curl -s '$TUNNEL_URL/api/v1/auth/csrf'"
fi
echo ""
echo "Stop with: ./scripts/cloud-tunnel-down.sh"
