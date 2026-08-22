#!/usr/bin/env python3
"""Validate a VPS environment mapping without printing secret values."""

from __future__ import annotations

import copy
import re
import sys
from typing import Mapping

PLACEHOLDER_PREFIX = "replace-with-"
ACCOUNT_PLACEHOLDER = "YOUR_ACCOUNT_ID"
SHA_TAG = re.compile(r"^sha-[0-9a-f]{40}$")
HIGH_PORT = re.compile(r"^[1-9][0-9]{3,4}$")
GHCR_IMAGE = "ghcr.io/ricard0g/jobtrackr/%s:%s"
REQUIRED = (
    "JOBTRACKR_RELEASE_TAG",
    "JOBTRACKR_FRONTEND_IMAGE",
    "JOBTRACKR_BACKEND_IMAGE",
    "JOBTRACKR_CV_GENERATION_IMAGE",
    "JOBTRACKR_PORT",
    "JOBTRACKR_PUBLIC_ORIGIN",
    "CORS_ALLOWED_ORIGINS",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "JWT_SIGNING_KEY",
    "JWT_REFRESH_COOKIE_SECURE",
    "CV_GENERATION_SERVICE_TOKEN",
    "GOOGLE_AI_API_KEY",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
)
IMAGE_KEYS = {
    "JOBTRACKR_FRONTEND_IMAGE": "frontend",
    "JOBTRACKR_BACKEND_IMAGE": "backend",
    "JOBTRACKR_CV_GENERATION_IMAGE": "cv-generation",
}


def _blank(value: str | None) -> bool:
    return value is None or not str(value).strip()


def _placeholder(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith(PLACEHOLDER_PREFIX) or ACCOUNT_PLACEHOLDER in stripped


def validate_env(values: Mapping[str, str]) -> list[str]:
    errors: list[str] = []
    present = {key: str(values.get(key, "")).strip() for key in REQUIRED}

    for key, value in present.items():
        if _blank(value):
            errors.append("%s is missing" % key)
        elif _placeholder(value):
            errors.append("%s still has a template placeholder" % key)

    tag = present.get("JOBTRACKR_RELEASE_TAG", "")
    if tag and not SHA_TAG.match(tag):
        errors.append("JOBTRACKR_RELEASE_TAG must be an immutable sha-<40-char-commit> tag")

    if tag and SHA_TAG.match(tag):
        for key, service in IMAGE_KEYS.items():
            image = present.get(key, "")
            expected = GHCR_IMAGE % (service, tag)
            if image and image != expected:
                errors.append("%s must be %s" % (key, expected))

    host = str(values.get("JOBTRACKR_PUBLISH_HOST", "127.0.0.1")).strip()
    if host != "127.0.0.1":
        errors.append("JOBTRACKR_PUBLISH_HOST must be 127.0.0.1")

    port = present.get("JOBTRACKR_PORT", "")
    if port and (not HIGH_PORT.match(port) or int(port) < 1024):
        errors.append("JOBTRACKR_PORT must be a configurable high port; 18080 is the documented default")

    if present.get("CORS_ALLOWED_ORIGINS") and present.get("JOBTRACKR_PUBLIC_ORIGIN"):
        if present["CORS_ALLOWED_ORIGINS"] != present["JOBTRACKR_PUBLIC_ORIGIN"]:
            errors.append("CORS_ALLOWED_ORIGINS must match JOBTRACKR_PUBLIC_ORIGIN")

    if present.get("JWT_REFRESH_COOKIE_SECURE") and present.get("JWT_REFRESH_COOKIE_SECURE") != "true":
        errors.append("JWT_REFRESH_COOKIE_SECURE must be true on the VPS")

    allow_insecure = str(values.get("JWT_REFRESH_COOKIE_ALLOW_INSECURE", "")).strip().lower()
    if allow_insecure == "true":
        errors.append("JWT_REFRESH_COOKIE_ALLOW_INSECURE must not be true on the VPS")

    signing_key = present.get("JWT_SIGNING_KEY", "")
    if signing_key and not _placeholder(signing_key) and len(signing_key.encode("utf-8")) < 32:
        errors.append("JWT_SIGNING_KEY must be at least 32 bytes")

    return errors


def _sample_env() -> dict[str, str]:
    tag = "sha-0123456789abcdef0123456789abcdef01234567"
    return {
        "JOBTRACKR_RELEASE_TAG": tag,
        "JOBTRACKR_FRONTEND_IMAGE": "ghcr.io/ricard0g/jobtrackr/frontend:" + tag,
        "JOBTRACKR_BACKEND_IMAGE": "ghcr.io/ricard0g/jobtrackr/backend:" + tag,
        "JOBTRACKR_CV_GENERATION_IMAGE": "ghcr.io/ricard0g/jobtrackr/cv-generation:" + tag,
        "JOBTRACKR_PUBLISH_HOST": "127.0.0.1",
        "JOBTRACKR_PORT": "18080",
        "JOBTRACKR_PUBLIC_ORIGIN": "https://jobtrackr.example.test",
        "CORS_ALLOWED_ORIGINS": "https://jobtrackr.example.test",
        "POSTGRES_DB": "jobtrackr",
        "POSTGRES_USER": "jobtrackr_app",
        "POSTGRES_PASSWORD": "vps-db-password-not-a-placeholder",
        "JWT_SIGNING_KEY": "vps-signing-key-at-least-32-bytes",
        "JWT_REFRESH_COOKIE_SECURE": "true",
        "CV_GENERATION_SERVICE_TOKEN": "vps-service-token-not-a-placeholder",
        "GOOGLE_AI_API_KEY": "vps-gemini-key-not-a-placeholder",
        "R2_ENDPOINT": "https://example.eu.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY_ID": "vps-r2-access-key",
        "R2_SECRET_ACCESS_KEY": "vps-r2-secret",
        "R2_BUCKET": "jobtrackr-vps",
    }


def self_test() -> None:
    good = _sample_env()
    errors = validate_env(good)
    if errors:
        raise SystemExit("self-test expected a valid VPS env to pass: %s" % errors)

    missing = copy.deepcopy(good)
    secret = missing["POSTGRES_PASSWORD"]
    missing["POSTGRES_PASSWORD"] = ""
    errors = validate_env(missing)
    if not any(error == "POSTGRES_PASSWORD is missing" for error in errors):
        raise SystemExit("self-test expected missing POSTGRES_PASSWORD to fail: %s" % errors)
    if any(secret in error for error in errors):
        raise SystemExit("self-test leaked a secret value: %s" % errors)

    placeholder = copy.deepcopy(good)
    placeholder["GOOGLE_AI_API_KEY"] = "replace-with-vps-gemini-key"
    errors = validate_env(placeholder)
    if not any(error == "GOOGLE_AI_API_KEY still has a template placeholder" for error in errors):
        raise SystemExit("self-test expected Gemini placeholder to fail: %s" % errors)
    if any("replace-with-vps-gemini-key" in error for error in errors):
        raise SystemExit("self-test leaked a placeholder value: %s" % errors)

    account = copy.deepcopy(good)
    account["R2_ENDPOINT"] = "https://YOUR_ACCOUNT_ID.eu.r2.cloudflarestorage.com"
    errors = validate_env(account)
    if not any(error == "R2_ENDPOINT still has a template placeholder" for error in errors):
        raise SystemExit("self-test expected R2 account placeholder to fail: %s" % errors)

    moving_tag = copy.deepcopy(good)
    moving_tag["JOBTRACKR_RELEASE_TAG"] = "main"
    errors = validate_env(moving_tag)
    if not any("immutable" in error for error in errors):
        raise SystemExit("self-test expected moving branch tag to fail: %s" % errors)

    public_host = copy.deepcopy(good)
    public_host["JOBTRACKR_PUBLISH_HOST"] = "0.0.0.0"
    errors = validate_env(public_host)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected all-interface publish host to fail: %s" % errors)

    origin_mismatch = copy.deepcopy(good)
    origin_mismatch["CORS_ALLOWED_ORIGINS"] = "https://other.example.test"
    errors = validate_env(origin_mismatch)
    if not any("JOBTRACKR_PUBLIC_ORIGIN" in error for error in errors):
        raise SystemExit("self-test expected public origin mismatch to fail: %s" % errors)

    insecure = copy.deepcopy(good)
    insecure["JWT_REFRESH_COOKIE_ALLOW_INSECURE"] = "true"
    errors = validate_env(insecure)
    if not any("JWT_REFRESH_COOKIE_ALLOW_INSECURE" in error for error in errors):
        raise SystemExit("self-test expected insecure cookie override to fail: %s" % errors)

    print("vps env validator self-test passed")


def _parse_env_file(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    if len(argv) != 2:
        print("usage: vps_env_validate.py --self-test | <env-file>", file=sys.stderr)
        return 2

    errors = validate_env(_parse_env_file(argv[1]))
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("vps environment is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
