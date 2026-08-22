#!/usr/bin/env python3
"""Assert VPS host publications from `docker compose ps --format json`."""

from __future__ import annotations

import json
import sys
from typing import Any

INTERNAL = ("postgres", "cv-generation", "gotenberg", "backend")


def _records(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    if not text:
        return []
    if text.startswith("["):
        data = json.loads(text)
        return list(data)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def _published(publishers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    published: list[dict[str, Any]] = []
    for publisher in publishers:
        port = publisher.get("PublishedPort") or 0
        url = str(publisher.get("URL") or "")
        if port and url not in {"", "0"}:
            published.append(publisher)
    return published


def validate_publications(records: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    by_name = {str(item.get("Service") or item.get("Name") or ""): item for item in records}
    if "frontend" not in by_name:
        errors.append("frontend is not running")
        return errors

    frontend = _published(by_name["frontend"].get("Publishers") or [])
    if len(frontend) != 1:
        errors.append("frontend must publish exactly one host port, found %s" % frontend)
    else:
        publisher = frontend[0]
        url = str(publisher.get("URL") or "")
        target = publisher.get("TargetPort")
        if url != "127.0.0.1":
            errors.append("frontend publishes on %s; it must bind 127.0.0.1" % url)
        if target != 80:
            errors.append("frontend host mapping target was %s, expected 80" % target)

    for name in INTERNAL:
        item = by_name.get(name)
        if item is None:
            errors.append("%s is not running" % name)
            continue
        published = _published(item.get("Publishers") or [])
        if published:
            errors.append("%s publishes a host port: %s" % (name, published))
    return errors


def _sample() -> list[dict[str, Any]]:
    return [
        {
            "Service": "frontend",
            "Publishers": [
                {"URL": "127.0.0.1", "TargetPort": 80, "PublishedPort": 18080, "Protocol": "tcp"}
            ],
        },
        {"Service": "postgres", "Publishers": [{"URL": "", "TargetPort": 5432, "PublishedPort": 0}]},
        {"Service": "cv-generation", "Publishers": []},
        {"Service": "gotenberg", "Publishers": []},
        {"Service": "backend", "Publishers": []},
    ]


def self_test() -> None:
    errors = validate_publications(_sample())
    if errors:
        raise SystemExit("self-test expected unpublished internals to pass: %s" % errors)

    leaked = _sample()
    leaked[1]["Publishers"] = [
        {"URL": "127.0.0.1", "TargetPort": 5432, "PublishedPort": 5432, "Protocol": "tcp"}
    ]
    errors = validate_publications(leaked)
    if not any("postgres" in error and "host port" in error for error in errors):
        raise SystemExit("self-test expected published postgres to fail: %s" % errors)

    public = _sample()
    public[0]["Publishers"][0]["URL"] = "0.0.0.0"
    errors = validate_publications(public)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected all-interface frontend to fail: %s" % errors)

    ipv6 = _sample()
    ipv6[0]["Publishers"][0]["URL"] = "::1"
    errors = validate_publications(ipv6)
    if not any("127.0.0.1" in error for error in errors):
        raise SystemExit("self-test expected IPv6 loopback frontend to fail: %s" % errors)

    bogus = _sample()
    bogus[1]["Publishers"] = [{"URL": "0", "TargetPort": 5432, "PublishedPort": 0}]
    errors = validate_publications(bogus)
    if errors:
        raise SystemExit("self-test expected compose port phantom 0 binding to pass: %s" % errors)

    print("vps host-port checker self-test passed")


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    raw = sys.stdin.read()
    errors = validate_publications(_records(raw))
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("vps host publications are loopback-only for frontend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
