#!/usr/bin/env python3
"""Validate sanitized VPS host-edge Nginx and cloudflared examples.

The seam is the committed example configuration: system Nginx listens on its
own loopback origin and proxies to the Docker frontend mapping; cloudflared
targets that Nginx origin, not a Compose container. Public-hostname Access
checks stay manual. This script never talks to Cloudflare, UFW, or systemd.
"""

from __future__ import annotations

import re
import sys
from urllib.parse import urlparse

DOCKER_FRONTEND_PORT = 18080
PUBLIC_PORTS = {80, 443}
PLACEHOLDER_HOST_SUFFIX = ".example.test"
TUNNEL_PLACEHOLDER = re.compile(r"(REPLACE_WITH_|YOUR_|replace-with-)", re.I)
LISTEN = re.compile(r"^\s*listen\s+([^;]+);", re.M)
PROXY_PASS = re.compile(r"^\s*proxy_pass\s+([^;]+);", re.M)
SET_HEADER = re.compile(r"^\s*proxy_set_header\s+(\S+)\s+([^;]+);", re.M)
SERVER_NAME = re.compile(r"^\s*server_name\s+([^;]+);", re.M)
YAML_KEY = re.compile(r"^(\s*)(?:-\s+)?([A-Za-z0-9_-]+):\s*(.*?)\s*$")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UUID = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.I,
)
JWTISH = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
CF_TOKEN = re.compile(r"\b(cfk_|v1\.0-[A-Za-z0-9_-]{20,})")


def _without_comments(text: str) -> str:
    lines: list[str] = []
    for raw in text.splitlines():
        stripped = raw.split("#", 1)[0].rstrip()
        if stripped.strip():
            lines.append(stripped)
    return "\n".join(lines) + "\n"


def _listen_bindings(nginx: str) -> list[tuple[str, int]]:
    bindings: list[tuple[str, int]] = []
    for match in LISTEN.finditer(_without_comments(nginx)):
        spec = match.group(1).strip()
        tokens = spec.split()
        address = tokens[0] if tokens else ""
        if address.startswith("[") and "]:" in address:
            host, port_text = address.rsplit("]:", 1)
            host = host[1:]
        elif ":" in address:
            host, port_text = address.rsplit(":", 1)
        else:
            host, port_text = "", address
        try:
            port = int(port_text)
        except ValueError:
            continue
        bindings.append((host, port))
    return bindings


def _proxy_targets(nginx: str) -> list[str]:
    return [match.group(1).strip() for match in PROXY_PASS.finditer(_without_comments(nginx))]


def _headers(nginx: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for match in SET_HEADER.finditer(_without_comments(nginx)):
        found[match.group(1).lower()] = match.group(2).strip()
    return found


def _server_names(nginx: str) -> list[str]:
    names: list[str] = []
    for match in SERVER_NAME.finditer(_without_comments(nginx)):
        names.extend(part.strip() for part in match.group(1).split() if part.strip() and part.strip() != "_")
    return names


def _placeholder_leaks(text: str) -> list[str]:
    errors: list[str] = []
    if EMAIL.search(text):
        errors.append("host-edge example contains an email address; use placeholders only")
    if UUID.search(text):
        errors.append("host-edge example contains a UUID; use REPLACE_WITH_TUNNEL_UUID")
    if JWTISH.search(text) or CF_TOKEN.search(text):
        errors.append("host-edge example contains a credential-shaped token")
    return errors


def validate_system_nginx(nginx: str) -> list[str]:
    errors: list[str] = []
    bindings = _listen_bindings(nginx)
    if not bindings:
        errors.append("system Nginx must listen on a host-managed loopback origin")
        return errors

    for host, port in bindings:
        if host != "127.0.0.1":
            errors.append(
                "system Nginx listen %s:%s is not IPv4 loopback; bind 127.0.0.1"
                % (host or "*", port)
            )
        if port in PUBLIC_PORTS:
            errors.append("system Nginx must not listen on public port %s during the tunnel-only phase" % port)
        if port == DOCKER_FRONTEND_PORT:
            errors.append(
                "system Nginx must not listen on Docker frontend port %s; that mapping is JOBTRACKR_PORT"
                % DOCKER_FRONTEND_PORT
            )

    targets = _proxy_targets(nginx)
    if not targets:
        errors.append("system Nginx must proxy the JobTrackr hostname to the loopback frontend mapping")
    else:
        for target in targets:
            parsed = urlparse(target)
            if parsed.scheme != "http" or parsed.hostname != "127.0.0.1":
                errors.append("system Nginx proxy_pass must target http://127.0.0.1:<JOBTRACKR_PORT>, found %s" % target)
                continue
            if parsed.port != DOCKER_FRONTEND_PORT:
                errors.append(
                    "system Nginx proxy_pass port was %s; document 18080 as the arbitrary JOBTRACKR_PORT default"
                    % parsed.port
                )
            if parsed.path not in {"", "/"}:
                errors.append("system Nginx must proxy the complete hostname, not a path prefix: %s" % target)

    headers = _headers(nginx)
    proto = headers.get("x-forwarded-proto", "")
    if proto not in {"https", "$http_x_forwarded_proto"}:
        errors.append(
            "system Nginx must forward external HTTPS via X-Forwarded-Proto https or $http_x_forwarded_proto"
        )
    if "x-forwarded-host" not in headers and headers.get("host") not in {"$host", "$http_host"}:
        errors.append("system Nginx must forward original host via X-Forwarded-Host or Host")
    if "x-forwarded-host" not in headers:
        errors.append("system Nginx must set X-Forwarded-Host so Spring sees the public hostname")
    forwarded_for = headers.get("x-forwarded-for", "")
    if forwarded_for not in {"$proxy_add_x_forwarded_for", "$http_x_forwarded_for"}:
        errors.append("system Nginx must forward the client chain via X-Forwarded-For")
    if headers.get("host") not in {"$host", "$http_host"}:
        errors.append("system Nginx must pass Host $host to the frontend mapping")

    names = _server_names(nginx)
    if not names:
        errors.append("system Nginx server_name must be the placeholder JobTrackr hostname")
    for name in names:
        if not name.endswith(PLACEHOLDER_HOST_SUFFIX):
            errors.append("system Nginx server_name %s must use the .example.test placeholder hostname" % name)

    errors.extend(_placeholder_leaks(nginx))
    return errors


def _yaml_items(text: str) -> list[tuple[int, str, str]]:
    items: list[tuple[int, str, str]] = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        match = YAML_KEY.match(line)
        if match is None:
            continue
        indent = len(match.group(1).replace("\t", "    "))
        items.append((indent, match.group(2), match.group(3)))
    return items


def validate_cloudflared(config: str, *, nginx_listen_port: int | None = None) -> list[str]:
    errors: list[str] = []
    items = _yaml_items(config)
    keys = {key for _, key, _ in items}

    tunnel = next((value for _, key, value in items if key == "tunnel"), "")
    if not tunnel or not TUNNEL_PLACEHOLDER.search(tunnel):
        errors.append("cloudflared tunnel id must be a placeholder such as REPLACE_WITH_TUNNEL_UUID")

    credentials = next((value for _, key, value in items if key == "credentials-file"), "")
    if not credentials or not TUNNEL_PLACEHOLDER.search(credentials):
        errors.append("cloudflared credentials-file must use a placeholder path")
    if re.search(r"/home/(?!YOUR_|REPLACE_WITH_)", credentials):
        errors.append("cloudflared credentials-file home directory must be a placeholder")

    hostnames = [value for _, key, value in items if key == "hostname"]
    if not hostnames:
        errors.append("cloudflared ingress must name the placeholder JobTrackr hostname")
    for hostname in hostnames:
        if not hostname.endswith(PLACEHOLDER_HOST_SUFFIX):
            errors.append("cloudflared hostname %s must use the .example.test placeholder" % hostname)

    services = [value for _, key, value in items if key == "service"]
    http_services = [value for value in services if value.startswith("http://")]
    if not http_services:
        errors.append("cloudflared must target the system-Nginx loopback origin over HTTP")
    expected_port = nginx_listen_port
    for service in http_services:
        parsed = urlparse(service)
        if parsed.hostname != "127.0.0.1":
            errors.append("cloudflared origin must be 127.0.0.1 system Nginx, found %s" % service)
        if parsed.port == DOCKER_FRONTEND_PORT:
            errors.append(
                "cloudflared must not target Docker frontend port %s; target system Nginx instead"
                % DOCKER_FRONTEND_PORT
            )
        if expected_port is not None and parsed.port != expected_port:
            errors.append(
                "cloudflared origin port was %s, expected system Nginx listen port %s"
                % (parsed.port, expected_port)
            )
        if parsed.hostname in {"frontend", "backend", "postgres", "cv-generation", "gotenberg"}:
            errors.append("cloudflared must not target a Compose service DNS name: %s" % service)

    if not any(value == "http_status:404" for value in services):
        errors.append("cloudflared ingress must end with a catch-all http_status:404")

    if "account" in keys or "account-tag" in keys:
        account = next(value for _, key, value in items if key in {"account", "account-tag"})
        if account and not TUNNEL_PLACEHOLDER.search(account):
            errors.append("cloudflared account identifiers must be placeholders")

    errors.extend(_placeholder_leaks(config))
    return errors


def validate_edge(nginx: str, cloudflared: str) -> list[str]:
    errors = validate_system_nginx(nginx)
    listen_ports = [port for host, port in _listen_bindings(nginx) if host == "127.0.0.1"]
    nginx_port = listen_ports[0] if len(listen_ports) == 1 else None
    errors.extend(validate_cloudflared(cloudflared, nginx_listen_port=nginx_port))
    return errors


def _sample_nginx() -> str:
    return """
server {
    listen 127.0.0.1:18081;
    server_name jobtrackr.example.test;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Connection "";
    }
}
"""


def _sample_cloudflared() -> str:
    return """
tunnel: REPLACE_WITH_TUNNEL_UUID
credentials-file: /home/YOUR_DEPLOY_USER/.cloudflared/REPLACE_WITH_TUNNEL_UUID.json

ingress:
  - hostname: jobtrackr.example.test
    service: http://127.0.0.1:18081
  - service: http_status:404
"""


def self_test() -> None:
    good_nginx = _sample_nginx()
    good_tunnel = _sample_cloudflared()
    errors = validate_edge(good_nginx, good_tunnel)
    if errors:
        raise SystemExit("self-test expected valid host-edge examples to pass: %s" % errors)

    public_listen = good_nginx.replace("listen 127.0.0.1:18081;", "listen 80;")
    errors = validate_system_nginx(public_listen)
    if not any("public port 80" in error for error in errors):
        raise SystemExit("self-test expected public Nginx listen to fail: %s" % errors)

    all_interfaces = good_nginx.replace("listen 127.0.0.1:18081;", "listen 18081;")
    errors = validate_system_nginx(all_interfaces)
    if not any("loopback" in error for error in errors):
        raise SystemExit("self-test expected all-interface Nginx listen to fail: %s" % errors)

    docker_listen = good_nginx.replace("listen 127.0.0.1:18081;", "listen 127.0.0.1:18080;")
    errors = validate_system_nginx(docker_listen)
    if not any("18080" in error for error in errors):
        raise SystemExit("self-test expected Nginx listening on JOBTRACKR_PORT to fail: %s" % errors)

    path_prefix = good_nginx.replace("proxy_pass http://127.0.0.1:18080;", "proxy_pass http://127.0.0.1:18080/app;")
    errors = validate_system_nginx(path_prefix)
    if not any("complete hostname" in error for error in errors):
        raise SystemExit("self-test expected path-prefix proxy_pass to fail: %s" % errors)

    missing_proto = good_nginx.replace("proxy_set_header X-Forwarded-Proto https;\n        ", "")
    errors = validate_system_nginx(missing_proto)
    if not any("X-Forwarded-Proto" in error for error in errors):
        raise SystemExit("self-test expected missing X-Forwarded-Proto to fail: %s" % errors)

    http_scheme = good_nginx.replace("proxy_set_header X-Forwarded-Proto https;", "proxy_set_header X-Forwarded-Proto $scheme;")
    errors = validate_system_nginx(http_scheme)
    if not any("X-Forwarded-Proto" in error for error in errors):
        raise SystemExit("self-test expected $scheme forwarded proto to fail: %s" % errors)

    missing_host = good_nginx.replace("proxy_set_header X-Forwarded-Host $host;\n        ", "")
    errors = validate_system_nginx(missing_host)
    if not any("X-Forwarded-Host" in error for error in errors):
        raise SystemExit("self-test expected missing X-Forwarded-Host to fail: %s" % errors)

    missing_for = good_nginx.replace(
        "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        ",
        "",
    )
    errors = validate_system_nginx(missing_for)
    if not any("X-Forwarded-For" in error for error in errors):
        raise SystemExit("self-test expected missing X-Forwarded-For to fail: %s" % errors)

    real_hostname = good_nginx.replace("jobtrackr.example.test", "jobtrackr.my-company.com")
    errors = validate_system_nginx(real_hostname)
    if not any("example.test" in error for error in errors):
        raise SystemExit("self-test expected real hostname to fail: %s" % errors)

    docker_origin = good_tunnel.replace("http://127.0.0.1:18081", "http://127.0.0.1:18080")
    errors = validate_cloudflared(docker_origin, nginx_listen_port=18081)
    if not any("18080" in error for error in errors):
        raise SystemExit("self-test expected cloudflared targeting Docker frontend to fail: %s" % errors)

    container_origin = good_tunnel.replace("http://127.0.0.1:18081", "http://frontend:80")
    errors = validate_cloudflared(container_origin, nginx_listen_port=18081)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected cloudflared Compose DNS origin to fail: %s" % errors)

    real_tunnel = good_tunnel.replace("REPLACE_WITH_TUNNEL_UUID", "11111111-1111-1111-1111-111111111111")
    errors = validate_cloudflared(real_tunnel, nginx_listen_port=18081)
    if not any("placeholder" in error for error in errors):
        raise SystemExit("self-test expected real tunnel UUID to fail: %s" % errors)
    if any("11111111-1111-1111-1111-111111111111" in error for error in errors):
        raise SystemExit("self-test leaked a tunnel UUID: %s" % errors)

    hardcoded_home = good_tunnel.replace(
        "/home/YOUR_DEPLOY_USER/.cloudflared/REPLACE_WITH_TUNNEL_UUID.json",
        "/home/deploy/.cloudflared/REPLACE_WITH_TUNNEL_UUID.json",
    )
    errors = validate_cloudflared(hardcoded_home, nginx_listen_port=18081)
    if not any("home directory" in error for error in errors):
        raise SystemExit("self-test expected hardcoded deploy home to fail: %s" % errors)

    mismatched = good_tunnel.replace("http://127.0.0.1:18081", "http://127.0.0.1:19081")
    errors = validate_edge(good_nginx, mismatched)
    if not any("listen port 18081" in error for error in errors):
        raise SystemExit("self-test expected cloudflared/Nginx port mismatch to fail: %s" % errors)

    print("vps host-edge validator self-test passed")


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    if len(argv) != 3:
        print("usage: vps_edge_validate.py --self-test | <nginx-conf> <cloudflared-yml>", file=sys.stderr)
        return 2

    nginx = open(argv[1], encoding="utf-8").read()
    cloudflared = open(argv[2], encoding="utf-8").read()
    errors = validate_edge(nginx, cloudflared)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("vps host-edge examples are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
