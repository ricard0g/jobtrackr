#!/usr/bin/env python3
"""Validate rendered JobTrackr Compose config at the public stack seam."""

from __future__ import annotations

import copy
import json
import re
import sys
from typing import Any

FULL_SERVICES = ("postgres", "cv-generation", "gotenberg", "backend", "frontend")
HOST_RUN_SERVICES = ("postgres", "cv-generation", "gotenberg")
VPS_INTERNAL_SERVICES = ("postgres", "cv-generation", "gotenberg", "backend")
VPS_NETWORK = "jobtrackr"
VPS_VOLUME = "jobtrackr_pgdata"
VPS_RESTART_POLICIES = {"unless-stopped"}
GHCR_SHA_IMAGE = re.compile(
    r"^ghcr\.io/ricard0g/jobtrackr/(frontend|backend|cv-generation):sha-[0-9a-f]{40}$"
)
APPLICATION_IMAGES = {
    "frontend": "frontend",
    "backend": "backend",
    "cv-generation": "cv-generation",
}
GEMINI_KEYS = ("GOOGLE_AI_API_KEY", "GEMINI_API_KEY")
R2_KEYS = ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
JWT_KEYS = ("JWT_SIGNING_KEY",)
DB_PASSWORD_KEYS = ("POSTGRES_PASSWORD", "DB_PASSWORD")
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


def _service_networks(service: dict[str, Any]) -> set[str]:
    networks = service.get("networks") or {}
    if isinstance(networks, list):
        return {str(name) for name in networks}
    return {str(name) for name in networks}


def _has_build(service: dict[str, Any]) -> bool:
    build = service.get("build")
    if not build:
        return False
    if isinstance(build, str):
        return bool(build.strip())
    return True


def _is_external_volume(spec: dict[str, Any] | None) -> bool:
    if not spec:
        return False
    external = spec.get("external")
    if external is True:
        return True
    return isinstance(external, dict) and bool(external)


def _has_healthcheck(service: dict[str, Any]) -> bool:
    healthcheck = service.get("healthcheck") or {}
    test = healthcheck.get("test")
    return bool(test)


def _has_start_period(service: dict[str, Any]) -> bool:
    healthcheck = service.get("healthcheck") or {}
    return bool(healthcheck.get("start_period"))


def _has_log_rotation(service: dict[str, Any]) -> bool:
    logging = service.get("logging") or {}
    options = logging.get("options") or {}
    driver = str(logging.get("driver") or "")
    max_size = str(options.get("max-size") or "")
    max_file = str(options.get("max-file") or "")
    return driver == "json-file" and bool(max_size) and bool(max_file)


def _image_service_name(image: str) -> str | None:
    match = GHCR_SHA_IMAGE.match(image)
    if match is None:
        return None
    return match.group(1)


def validate_vps(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    services = config.get("services") or {}
    found = tuple(sorted(services))
    expected = tuple(sorted(FULL_SERVICES))
    if found != expected:
        errors.append("VPS Compose services were %s, expected %s" % (found, expected))
        return errors

    volumes = config.get("volumes") or {}
    volume = volumes.get(VPS_VOLUME)
    if volume is None:
        errors.append("VPS Compose is missing named volume %s" % VPS_VOLUME)
    else:
        explicit_name = str(volume.get("name") or "")
        if explicit_name != VPS_VOLUME:
            errors.append("VPS PostgreSQL volume name was %s, expected %s" % (explicit_name, VPS_VOLUME))
        if not _is_external_volume(volume):
            errors.append("VPS PostgreSQL volume %s must be external" % VPS_VOLUME)

    networks = config.get("networks") or {}
    if VPS_NETWORK not in networks:
        errors.append("VPS Compose is missing user-defined network %s" % VPS_NETWORK)
    else:
        driver = str((networks.get(VPS_NETWORK) or {}).get("driver") or "bridge")
        if driver != "bridge":
            errors.append("VPS network %s driver was %s, expected bridge" % (VPS_NETWORK, driver))

    postgres = services["postgres"]
    mounts = postgres.get("volumes") or []
    named = [
        mount
        for mount in mounts
        if mount.get("type") == "volume"
        and mount.get("source") == VPS_VOLUME
        and mount.get("target") == "/var/lib/postgresql/data"
    ]
    if not named:
        errors.append("postgres does not mount named volume %s at /var/lib/postgresql/data" % VPS_VOLUME)

    for name, service in services.items():
        if _has_build(service):
            errors.append("%s has a repository build context; VPS Compose must pull images" % name)
        if name in APPLICATION_IMAGES:
            image = str(service.get("image") or "")
            expected_service = APPLICATION_IMAGES[name]
            actual_service = _image_service_name(image)
            if actual_service != expected_service:
                errors.append(
                    "%s image %s is not ghcr.io/ricard0g/jobtrackr/%s with an immutable sha- tag"
                    % (name, image, expected_service)
                )
        restart = str(service.get("restart") or "")
        if restart not in VPS_RESTART_POLICIES:
            errors.append("%s restart policy was %s, expected unless-stopped" % (name, restart or "missing"))
        if not _has_log_rotation(service):
            errors.append("%s is missing bounded json-file log rotation" % name)
        if not _has_healthcheck(service):
            errors.append("%s is missing a health check" % name)
        if name in {"backend", "cv-generation", "postgres", "gotenberg"} and not _has_start_period(service):
            errors.append("%s health check is missing a startup grace period" % name)
        attached = _service_networks(service)
        if VPS_NETWORK not in attached or attached - {VPS_NETWORK}:
            errors.append("%s must attach only to user-defined network %s, found %s" % (name, VPS_NETWORK, attached))

    for name in VPS_INTERNAL_SERVICES:
        if _ports(services[name]):
            errors.append("%s publishes a host port; it must stay on the private Compose network" % name)

    frontend_ports = _ports(services["frontend"])
    if len(frontend_ports) != 1:
        errors.append("frontend must publish exactly one loopback host port, found %s" % frontend_ports)
    else:
        port = frontend_ports[0]
        host_ip = _published_host(port)
        target = port.get("target")
        published = str(port.get("published") or "")
        if host_ip != "127.0.0.1":
            errors.append("frontend publishes on %s; it must bind 127.0.0.1" % host_ip)
        if target != 80:
            errors.append("frontend host mapping target was %s, expected 80" % target)
        if not published:
            errors.append("frontend host mapping is missing a published port")

    backend = services["backend"]
    frontend = services["frontend"]
    cv_generation = services["cv-generation"]
    backend_env = _env(backend)
    cv_env = _env(cv_generation)
    postgres_env = _env(postgres)
    frontend_env = _env(frontend)
    gotenberg_env = _env(services["gotenberg"])

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

    if backend_env.get("SPRING_PROFILES_ACTIVE") != "production":
        errors.append("backend SPRING_PROFILES_ACTIVE was %s, expected production" % backend_env.get("SPRING_PROFILES_ACTIVE"))
    if backend_env.get("JWT_REFRESH_COOKIE_SECURE") != "true":
        errors.append("backend JWT_REFRESH_COOKIE_SECURE was %s, expected true" % backend_env.get("JWT_REFRESH_COOKIE_SECURE"))
    if (backend_env.get("JWT_REFRESH_COOKIE_ALLOW_INSECURE") or "false").lower() == "true":
        errors.append("backend JWT_REFRESH_COOKIE_ALLOW_INSECURE must not be true on the VPS")
    if not backend_env.get("CORS_ALLOWED_ORIGINS", "").strip():
        errors.append("backend CORS_ALLOWED_ORIGINS is missing after interpolation")

    if cv_env.get("CV_GENERATION_PROFILE") != "production":
        errors.append("cv-generation CV_GENERATION_PROFILE was %s, expected production" % cv_env.get("CV_GENERATION_PROFILE"))
    gemini_present = any(cv_env.get(key, "").strip() for key in GEMINI_KEYS)
    if not gemini_present:
        errors.append("cv-generation is missing GOOGLE_AI_API_KEY / GEMINI_API_KEY")
    if not cv_env.get("CV_GENERATION_SERVICE_TOKEN", "").strip():
        errors.append("cv-generation CV_GENERATION_SERVICE_TOKEN is missing after interpolation")
    if not postgres_env.get("POSTGRES_PASSWORD", "").strip():
        errors.append("postgres POSTGRES_PASSWORD is missing after interpolation")

    for name, env in (
        ("backend", backend_env),
        ("postgres", postgres_env),
        ("frontend", frontend_env),
        ("gotenberg", gotenberg_env),
    ):
        for key in GEMINI_KEYS:
            if env.get(key, "").strip():
                errors.append("%s must not receive %s; Gemini stays on cv-generation" % (name, key))

    for name, env in (
        ("cv-generation", cv_env),
        ("postgres", postgres_env),
        ("frontend", frontend_env),
        ("gotenberg", gotenberg_env),
    ):
        for key in R2_KEYS:
            if env.get(key, "").strip():
                errors.append("%s must not receive %s; R2 stays on the backend" % (name, key))

    for name, env in (
        ("cv-generation", cv_env),
        ("postgres", postgres_env),
        ("frontend", frontend_env),
        ("gotenberg", gotenberg_env),
    ):
        for key in JWT_KEYS:
            if env.get(key, "").strip():
                errors.append("%s must not receive %s; JWT stays on the backend" % (name, key))

    if postgres_env.get("CV_GENERATION_SERVICE_TOKEN", "").strip() or frontend_env.get(
        "CV_GENERATION_SERVICE_TOKEN", ""
    ).strip() or gotenberg_env.get("CV_GENERATION_SERVICE_TOKEN", "").strip():
        errors.append("CV_GENERATION_SERVICE_TOKEN must reach only backend and cv-generation")

    for name, env in (
        ("cv-generation", cv_env),
        ("frontend", frontend_env),
        ("gotenberg", gotenberg_env),
    ):
        for key in DB_PASSWORD_KEYS:
            if env.get(key, "").strip():
                errors.append("%s must not receive %s; database credentials stay on postgres and backend" % (name, key))

    for dependency in BACKEND_HEALTH_DEPS:
        condition = _condition(backend, dependency)
        if condition != "service_healthy":
            errors.append("backend health dependency on %s was %s, expected service_healthy" % (dependency, condition))

    frontend_backend = _condition(frontend, "backend")
    if frontend_backend != "service_healthy":
        errors.append("frontend health dependency on backend was %s, expected service_healthy" % frontend_backend)

    return errors


def validate_rendered(config: dict[str, Any], rendered: str, *, profile: str) -> list[str]:
    errors = validate_interpolation(rendered)
    if profile == "host-run":
        errors.extend(validate_host_run(config))
    elif profile == "full":
        errors.extend(validate_full_stack(config))
    elif profile == "vps":
        errors.extend(validate_vps(config))
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


def _vps_runtime(*, start_period: str) -> dict[str, Any]:
    return {
        "restart": "unless-stopped",
        "logging": {
            "driver": "json-file",
            "options": {"max-size": "10m", "max-file": "3"},
        },
        "healthcheck": {
            "test": ["CMD-SHELL", "true"],
            "interval": "10s",
            "timeout": "5s",
            "retries": 10,
            "start_period": start_period,
        },
        "networks": {VPS_NETWORK: None},
    }


def _sample_vps_stack() -> dict[str, Any]:
    sha = "0123456789abcdef0123456789abcdef01234567"
    postgres = _vps_runtime(start_period="10s")
    postgres["volumes"] = [
        {
            "type": "volume",
            "source": VPS_VOLUME,
            "target": "/var/lib/postgresql/data",
        }
    ]
    postgres["environment"] = {"POSTGRES_PASSWORD": "vps-db-password"}
    cv_generation = _vps_runtime(start_period="20s")
    cv_generation["image"] = "ghcr.io/ricard0g/jobtrackr/cv-generation:sha-" + sha
    cv_generation["environment"] = {
        "CV_GENERATION_PROFILE": "production",
        "CV_GENERATION_SERVICE_TOKEN": "vps-service-token",
        "GOOGLE_AI_API_KEY": "vps-gemini-key",
    }
    gotenberg = _vps_runtime(start_period="10s")
    backend = _vps_runtime(start_period="60s")
    backend["image"] = "ghcr.io/ricard0g/jobtrackr/backend:sha-" + sha
    backend["environment"] = {
        "SPRING_PROFILES_ACTIVE": "production",
        "DB_HOST": "postgres:5432",
        "DB_PASSWORD": "vps-db-password",
        "JWT_SIGNING_KEY": "vps-signing-key-at-least-32-bytes",
        "JWT_REFRESH_COOKIE_SECURE": "true",
        "CV_GENERATION_SERVICE_TOKEN": "vps-service-token",
        "CV_GENERATION_SERVICE_BASE_URL": "http://cv-generation:8081",
        "GOTENBERG_BASE_URL": "http://gotenberg:3000",
        "R2_ENDPOINT": "https://example.eu.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY_ID": "vps-r2-access-key",
        "R2_SECRET_ACCESS_KEY": "vps-r2-secret",
        "R2_BUCKET": "jobtrackr-vps",
        "CORS_ALLOWED_ORIGINS": "https://jobtrackr.example.test",
    }
    backend["depends_on"] = _healthy_dep("postgres", "cv-generation", "gotenberg")
    frontend = _vps_runtime(start_period="5s")
    frontend["image"] = "ghcr.io/ricard0g/jobtrackr/frontend:sha-" + sha
    frontend["depends_on"] = _healthy_dep("backend")
    frontend["ports"] = [
        {
            "mode": "ingress",
            "host_ip": "127.0.0.1",
            "target": 80,
            "published": "18080",
            "protocol": "tcp",
        }
    ]
    return {
        "services": {
            "postgres": postgres,
            "cv-generation": cv_generation,
            "gotenberg": gotenberg,
            "backend": backend,
            "frontend": frontend,
        },
        "volumes": {VPS_VOLUME: {"name": VPS_VOLUME, "external": True}},
        "networks": {VPS_NETWORK: {"name": VPS_NETWORK, "driver": "bridge"}},
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

    vps = _sample_vps_stack()
    errors = validate_vps(vps)
    if errors:
        raise SystemExit("self-test expected a valid VPS config to pass: %s" % errors)

    built = copy.deepcopy(vps)
    built["services"]["frontend"]["build"] = {"context": "./jobtrackr-web"}
    errors = validate_vps(built)
    if not any("build" in error for error in errors):
        raise SystemExit("self-test expected VPS build context to fail: %s" % errors)

    local_tag = copy.deepcopy(vps)
    local_tag["services"]["backend"]["image"] = "jobtrackr-backend:local"
    errors = validate_vps(local_tag)
    if not any("immutable" in error or "sha-" in error or "ghcr.io" in error for error in errors):
        raise SystemExit("self-test expected local backend image tag to fail: %s" % errors)

    published_internal = copy.deepcopy(vps)
    published_internal["services"]["postgres"]["ports"] = _loopback_port(5432, "5432")
    errors = validate_vps(published_internal)
    if not any("postgres" in error and "host port" in error for error in errors):
        raise SystemExit("self-test expected VPS postgres host port to fail: %s" % errors)

    public_edge = copy.deepcopy(vps)
    public_edge["services"]["frontend"]["ports"][0]["host_ip"] = "0.0.0.0"
    errors = validate_vps(public_edge)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected VPS all-interface frontend mapping to fail: %s" % errors)

    ipv6_edge = copy.deepcopy(vps)
    ipv6_edge["services"]["frontend"]["ports"][0]["host_ip"] = "::1"
    errors = validate_vps(ipv6_edge)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected VPS IPv6 loopback frontend mapping to fail: %s" % errors)

    project_volume = copy.deepcopy(vps)
    project_volume["volumes"]["jobtrackr_pgdata"] = {"name": "jobtrackr_jobtrackr_pgdata"}
    errors = validate_vps(project_volume)
    if not any("external" in error for error in errors):
        raise SystemExit("self-test expected non-external VPS volume to fail: %s" % errors)

    leaked_gemini = copy.deepcopy(vps)
    leaked_gemini["services"]["backend"]["environment"]["GOOGLE_AI_API_KEY"] = "leaked"
    errors = validate_vps(leaked_gemini)
    if not any("GOOGLE_AI_API_KEY" in error for error in errors):
        raise SystemExit("self-test expected Gemini key on backend to fail: %s" % errors)

    leaked_r2 = copy.deepcopy(vps)
    leaked_r2["services"]["cv-generation"]["environment"]["R2_SECRET_ACCESS_KEY"] = "leaked"
    errors = validate_vps(leaked_r2)
    if not any("R2_" in error for error in errors):
        raise SystemExit("self-test expected R2 credentials on CV Generation to fail: %s" % errors)

    no_restart = copy.deepcopy(vps)
    no_restart["services"]["backend"]["restart"] = "no"
    errors = validate_vps(no_restart)
    if not any("restart" in error for error in errors):
        raise SystemExit("self-test expected missing VPS restart policy to fail: %s" % errors)

    no_logs = copy.deepcopy(vps)
    no_logs["services"]["frontend"]["logging"] = {}
    errors = validate_vps(no_logs)
    if not any("log" in error for error in errors):
        raise SystemExit("self-test expected missing VPS log rotation to fail: %s" % errors)

    default_net = copy.deepcopy(vps)
    for name in FULL_SERVICES:
        default_net["services"][name]["networks"] = {"default": None}
    default_net["networks"] = {"default": {"name": "jobtrackr_default"}}
    errors = validate_vps(default_net)
    if not any("network" in error for error in errors):
        raise SystemExit("self-test expected default Compose network to fail: %s" % errors)

    print("compose config validator self-test passed")


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    if len(argv) != 3 or argv[1] not in {"host-run", "full", "vps"}:
        print("usage: compose_config_validate.py --self-test | {host-run|full|vps} <compose-json>", file=sys.stderr)
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
