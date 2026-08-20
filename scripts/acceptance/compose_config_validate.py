#!/usr/bin/env python3
"""Validate rendered JobTrackr Compose config at the public stack seam."""

from __future__ import annotations

import copy
import json
import sys
from typing import Any

FULL_SERVICES = ("postgres", "cv-generation", "gotenberg", "backend", "frontend")
HOST_RUN_SERVICES = ("postgres", "cv-generation", "gotenberg")
BACKEND_DNS_ENV = {
    "DB_HOST": "postgres",
    "CV_GENERATION_SERVICE_BASE_URL": "cv-generation",
    "GOTENBERG_BASE_URL": "gotenberg",
}
REQUIRED_BACKEND_ENV = (
    "DB_PASSWORD",
    "JWT_SIGNING_KEY",
    "CV_GENERATION_SERVICE_TOKEN",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
)
BACKEND_HEALTH_DEPS = ("postgres", "cv-generation", "gotenberg")


def _env(service: dict[str, Any]) -> dict[str, str]:
    environment = service.get("environment") or {}
    if isinstance(environment, list):
        parsed: dict[str, str] = {}
        for item in environment:
            if isinstance(item, str) and "=" in item:
                key, value = item.split("=", 1)
                parsed[key] = value
        return parsed
    return {str(key): "" if value is None else str(value) for key, value in environment.items()}


def _ports(service: dict[str, Any]) -> list[dict[str, Any]]:
    ports = service.get("ports") or []
    return list(ports)


def _published_host(port: dict[str, Any]) -> str:
    host_ip = port.get("host_ip") or port.get("published_ip") or ""
    if host_ip:
        return str(host_ip)
    return "0.0.0.0"


def _condition(service: dict[str, Any], dependency: str) -> str | None:
    depends_on = service.get("depends_on") or {}
    if isinstance(depends_on, list):
        return "service_started" if dependency in depends_on else None
    spec = depends_on.get(dependency)
    if spec is None:
        return None
    if isinstance(spec, str):
        return spec
    return spec.get("condition")


def validate_interpolation(rendered: str) -> list[str]:
    errors: list[str] = []
    if "${" in rendered:
        errors.append("rendered Compose still contains uninterpolated ${...} placeholders")
    return errors


def validate_host_run(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    services = config.get("services") or {}
    found = tuple(sorted(services))
    expected = tuple(sorted(HOST_RUN_SERVICES))
    if found != expected:
        errors.append("host-run Compose services were %s, expected %s" % (found, expected))
        return errors

    volumes = (config.get("volumes") or {})
    if "jobtrackr_pgdata" not in volumes:
        errors.append("host-run Compose is missing named volume jobtrackr_pgdata")

    postgres = services["postgres"]
    mounts = postgres.get("volumes") or []
    named = [
        mount
        for mount in mounts
        if mount.get("type") == "volume"
        and mount.get("source") == "jobtrackr_pgdata"
        and mount.get("target") == "/var/lib/postgresql/data"
    ]
    if not named:
        errors.append("postgres does not mount named volume jobtrackr_pgdata at /var/lib/postgresql/data")

    for name in HOST_RUN_SERVICES:
        for port in _ports(services[name]):
            host_ip = _published_host(port)
            if host_ip not in {"127.0.0.1", "::1"}:
                errors.append("%s publishes on %s; it must bind 127.0.0.1" % (name, host_ip))
    return errors


def validate_full_stack(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    services = config.get("services") or {}
    found = tuple(sorted(services))
    expected = tuple(sorted(FULL_SERVICES))
    if found != expected:
        errors.append("full-stack Compose services were %s, expected %s" % (found, expected))
        return errors

    errors.extend(validate_host_run({"services": {name: services[name] for name in HOST_RUN_SERVICES}, "volumes": config.get("volumes")}))

    backend = services["backend"]
    frontend = services["frontend"]
    backend_env = _env(backend)

    for key in REQUIRED_BACKEND_ENV:
        value = backend_env.get(key, "").strip()
        if not value:
            errors.append("backend %s is missing after interpolation" % key)

    for key, dns_name in BACKEND_DNS_ENV.items():
        value = backend_env.get(key, "")
        if "localhost" in value or "127.0.0.1" in value:
            errors.append("backend %s uses localhost instead of Compose DNS: %s" % (key, value))
        if dns_name not in value:
            errors.append("backend %s does not use service DNS name %s: %s" % (key, dns_name, value))

    if _ports(backend):
        errors.append("backend publishes host ports; it must stay on the private Compose network")

    for dependency in BACKEND_HEALTH_DEPS:
        condition = _condition(backend, dependency)
        if condition != "service_healthy":
            errors.append("backend health dependency on %s was %s, expected service_healthy" % (dependency, condition))

    frontend_backend = _condition(frontend, "backend")
    if frontend_backend != "service_healthy":
        errors.append("frontend health dependency on backend was %s, expected service_healthy" % frontend_backend)

    frontend_ports = _ports(frontend)
    if len(frontend_ports) != 1:
        errors.append("frontend must publish exactly one loopback host port, found %s" % frontend_ports)
    else:
        port = frontend_ports[0]
        host_ip = _published_host(port)
        target = port.get("target")
        published = str(port.get("published") or "")
        if host_ip not in {"127.0.0.1", "::1"}:
            errors.append("frontend publishes on %s; it must bind 127.0.0.1" % host_ip)
        if target != 80:
            errors.append("frontend host mapping target was %s, expected 80" % target)
        if not published:
            errors.append("frontend host mapping is missing a published port")

    return errors


def validate_rendered(config: dict[str, Any], rendered: str, *, profile: str) -> list[str]:
    errors = validate_interpolation(rendered)
    if profile == "host-run":
        errors.extend(validate_host_run(config))
    elif profile == "full":
        errors.extend(validate_full_stack(config))
    else:
        errors.append("unknown Compose profile %s" % profile)
    return errors


def _healthy_dep(*names: str) -> dict[str, Any]:
    return {name: {"condition": "service_healthy", "required": True} for name in names}


def _loopback_port(target: int, published: str) -> list[dict[str, Any]]:
    return [
        {
            "mode": "ingress",
            "host_ip": "127.0.0.1",
            "target": target,
            "published": published,
            "protocol": "tcp",
        }
    ]


def _sample_full_stack() -> dict[str, Any]:
    return {
        "services": {
            "postgres": {
                "ports": _loopback_port(5432, "5432"),
                "volumes": [
                    {
                        "type": "volume",
                        "source": "jobtrackr_pgdata",
                        "target": "/var/lib/postgresql/data",
                    }
                ]
            },
            "cv-generation": {"ports": _loopback_port(8081, "8081")},
            "gotenberg": {"ports": _loopback_port(3000, "3000")},
            "backend": {
                "environment": {
                    "DB_HOST": "postgres:5432",
                    "DB_PASSWORD": "not-default",
                    "JWT_SIGNING_KEY": "full-stack-compose-signing-key-32bxx",
                    "CV_GENERATION_SERVICE_TOKEN": "compose-token",
                    "CV_GENERATION_SERVICE_BASE_URL": "http://cv-generation:8081",
                    "GOTENBERG_BASE_URL": "http://gotenberg:3000",
                    "R2_ENDPOINT": "https://example.eu.r2.cloudflarestorage.com",
                    "R2_ACCESS_KEY_ID": "placeholder",
                    "R2_SECRET_ACCESS_KEY": "placeholder",
                    "R2_BUCKET": "jobtrackr-smoke",
                },
                "depends_on": _healthy_dep("postgres", "cv-generation", "gotenberg"),
            },
            "frontend": {
                "depends_on": _healthy_dep("backend"),
                "ports": [
                    {
                        "mode": "ingress",
                        "host_ip": "127.0.0.1",
                        "target": 80,
                        "published": "18080",
                        "protocol": "tcp",
                    }
                ],
            },
        },
        "volumes": {"jobtrackr_pgdata": {"name": "jobtrackr_jobtrackr_pgdata"}},
    }


def self_test() -> None:
    good = _sample_full_stack()
    errors = validate_full_stack(good)
    if errors:
        raise SystemExit("self-test expected a valid full-stack config to pass: %s" % errors)

    host_run = {
        "services": {name: good["services"][name] for name in HOST_RUN_SERVICES},
        "volumes": good["volumes"],
    }
    errors = validate_host_run(host_run)
    if errors:
        raise SystemExit("self-test expected host-run config to pass: %s" % errors)

    interpolated = validate_interpolation('{"services": {"backend": {}}}')
    if interpolated:
        raise SystemExit("self-test expected interpolated JSON to pass")
    missing = validate_interpolation('{"image": "${MISSING}"}')
    if not missing:
        raise SystemExit("self-test expected uninterpolated ${MISSING} to fail")

    localhost = copy.deepcopy(good)
    localhost["services"]["backend"]["environment"]["DB_HOST"] = "localhost:5432"
    errors = validate_full_stack(localhost)
    if not any("localhost" in error and "DB_HOST" in error for error in errors):
        raise SystemExit("self-test expected localhost DB_HOST to fail: %s" % errors)

    public_backend = copy.deepcopy(good)
    public_backend["services"]["backend"]["ports"] = [
        {"target": 8080, "published": "8080", "protocol": "tcp"}
    ]
    errors = validate_full_stack(public_backend)
    if not any("backend publishes" in error for error in errors):
        raise SystemExit("self-test expected published backend ports to fail: %s" % errors)

    public_frontend = copy.deepcopy(good)
    public_frontend["services"]["frontend"]["ports"][0]["host_ip"] = "0.0.0.0"
    errors = validate_full_stack(public_frontend)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected all-interface frontend mapping to fail: %s" % errors)

    public_postgres = copy.deepcopy(good)
    public_postgres["services"]["postgres"]["ports"][0]["host_ip"] = "0.0.0.0"
    errors = validate_full_stack(public_postgres)
    if not any("postgres publishes on" in error for error in errors):
        raise SystemExit("self-test expected all-interface postgres mapping to fail: %s" % errors)

    missing_port = copy.deepcopy(good)
    missing_port["services"]["frontend"]["ports"] = []
    errors = validate_full_stack(missing_port)
    if not any("exactly one loopback" in error for error in errors):
        raise SystemExit("self-test expected missing frontend port to fail: %s" % errors)

    empty_secret = copy.deepcopy(good)
    empty_secret["services"]["backend"]["environment"]["JWT_SIGNING_KEY"] = ""
    errors = validate_full_stack(empty_secret)
    if not any("JWT_SIGNING_KEY" in error for error in errors):
        raise SystemExit("self-test expected empty JWT_SIGNING_KEY to fail: %s" % errors)

    weak_health = copy.deepcopy(good)
    weak_health["services"]["backend"]["depends_on"]["postgres"]["condition"] = "service_started"
    errors = validate_full_stack(weak_health)
    if not any("postgres" in error and "service_healthy" in error for error in errors):
        raise SystemExit("self-test expected weak postgres health dependency to fail: %s" % errors)

    print("compose config validator self-test passed")


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    if len(argv) != 3 or argv[1] not in {"host-run", "full"}:
        print("usage: compose_config_validate.py --self-test | {host-run|full} <compose-json>", file=sys.stderr)
        return 2

    profile = argv[1]
    path = argv[2]
    rendered = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    config = json.loads(rendered)
    errors = validate_rendered(config, rendered, profile=profile)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("compose %s config is valid" % profile)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
