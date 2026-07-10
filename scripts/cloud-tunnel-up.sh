#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMUX_CONF="/exec-daemon/tmux.portal.conf"
MOCK_MODE=false

usage() {
	cat <<'EOF'
Usage: ./scripts/cloud-tunnel-up.sh [--mock]

Start Postgres (full stack only), API, Vite, nginx, and ngrok for phone testing.

  --mock   Vite + MSW only (no Postgres/API); uses config/nginx/cloud-dev-mock.conf

Requires: nginx, ngrok, docker, npm, java
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
			ngrok)
				echo "Install ngrok and configure an authtoken (see docs/cloud-agent/ngrok-dev.md)." >&2
				;;
			docker)
				echo "Docker is required for Postgres in full-stack mode." >&2
				;;
		esac
		exit 1
	fi
}

require_cmd nginx
require_cmd ngrok
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

get_ngrok_url() {
	curl -sf http://127.0.0.1:4040/api/tunnels \
		| python3 -c "import sys,json; d=json.load(sys.stdin); print(next(t['public_url'] for t in d['tunnels'] if t['public_url'].startswith('https')))"
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

kill_session ngrok-tunnel
tmux_cmd new-session -d -s ngrok-tunnel -c "$ROOT_DIR" -- \
	bash -lc 'ngrok http localhost:9080'

NGROK_URL=""
for ((i = 1; i <= 30; i++)); do
	if NGROK_URL="$(get_ngrok_url 2>/dev/null || true)" && [[ -n "$NGROK_URL" ]]; then
		break
	fi
	sleep 1
done

if [[ -z "$NGROK_URL" ]]; then
	echo "Failed to read ngrok public URL from http://127.0.0.1:4040/api/tunnels" >&2
	exit 1
fi

NGROK_HOST="$(python3 -c "from urllib.parse import urlparse; print(urlparse('$NGROK_URL').hostname)")"
echo "ngrok URL: $NGROK_URL"
echo "ngrok host: $NGROK_HOST"

start_vite_session "export VITE_HMR_HOST='$NGROK_HOST'; "
wait_for_url "http://localhost:5173/" "Vite (HMR host)"

echo ""
echo "Cloud tunnel is up."
echo "  Public URL: $NGROK_URL"
if [[ "$MOCK_MODE" == true ]]; then
	echo "  Mode: mock API (MSW)"
else
	echo "  Mode: full stack (Postgres + API + Vite)"
	echo "  Seed login: agent@example.test / dev-password"
fi
echo ""
echo "Verify:"
echo "  curl -s -o /dev/null -w '%{http_code}\n' '$NGROK_URL/' -H 'ngrok-skip-browser-warning: true'"
if [[ "$MOCK_MODE" == false ]]; then
	echo "  curl -s '$NGROK_URL/auth/csrf' -H 'ngrok-skip-browser-warning: true'"
fi
echo ""
echo "Stop with: ./scripts/cloud-tunnel-down.sh"
