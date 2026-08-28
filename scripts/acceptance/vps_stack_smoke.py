#!/usr/bin/env python3
"""Prove the VPS loopback origin: health, SPA routing, and API routing through Nginx."""

from __future__ import annotations

import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ORIGIN = os.environ.get("JOBTRACKR_APP_ORIGIN", "").rstrip("/")
if not ORIGIN:
    sys.exit("JOBTRACKR_APP_ORIGIN is required")


def get(url: str) -> tuple[int, str, dict[str, str]]:
    request = Request(url)
    with urlopen(request, timeout=15) as response:
        return response.status, response.read().decode(), dict(response.headers)


def request_json(method: str, url: str) -> tuple[int, dict[str, str], bytes]:
    request = Request(url, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read()
    except HTTPError as exc:
        body = exc.read()
        return exc.code, {k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])}, body


status, body, headers = get(ORIGIN + "/health")
if status != 200:
    sys.exit("health returned HTTP %s: %s" % (status, body))
if body.strip() != "ok":
    sys.exit("health body was not ok: %s" % body)

status, body, headers = get(ORIGIN + "/")
if status != 200:
    sys.exit("application shell returned HTTP %s" % status)
content_type = headers.get("Content-Type") or headers.get("content-type") or ""
if "text/html" not in content_type:
    sys.exit("application shell content type was %s" % content_type)
if 'id="root"' not in body or "JobTrackr" not in body:
    sys.exit("application shell did not include the SPA root")

asset = re.search(r'(?:src|href)="(/assets/[^"]+)"', body)
if asset is None:
    sys.exit("application shell did not reference a hashed /assets/ file")

status, _, headers = get(ORIGIN + asset.group(1))
if status != 200:
    sys.exit("static asset returned HTTP %s: %s" % (status, asset.group(1)))
cache_control = headers.get("Cache-Control") or headers.get("cache-control") or ""
if "immutable" not in cache_control:
    sys.exit("static asset cache-control was %s" % cache_control)

status, body, headers = get(
    ORIGIN + "/applications/11111111-1111-1111-1111-111111111111/generate"
)
if status != 200:
    sys.exit("nested React route returned HTTP %s" % status)
content_type = headers.get("Content-Type") or headers.get("content-type") or ""
if "text/html" not in content_type:
    sys.exit("nested React route content type was %s" % content_type)
if 'id="root"' not in body:
    sys.exit("nested React route did not return the application shell")

status, _, csrf_body = request_json("GET", ORIGIN + "/api/v1/auth/csrf")
if status != 200:
    sys.exit("csrf through nginx returned HTTP %s: %s" % (status, csrf_body.decode()))
csrf = json.loads(csrf_body.decode())
if not csrf.get("token") or not csrf.get("headerName"):
    sys.exit("csrf through nginx did not return a token: %s" % csrf_body.decode())

try:
    get(ORIGIN + "/api/v1/does-not-exist")
    sys.exit("missing API route unexpectedly succeeded")
except HTTPError as exc:
    error_type = exc.headers.get("Content-Type") or ""
    if exc.code == 404 and "text/html" in error_type:
        sys.exit("missing API route fell through to the SPA shell")
    if exc.code not in (401, 403, 404):
        sys.exit("missing API route returned HTTP %s: %s" % (exc.code, exc.read().decode()))
except URLError as exc:
    sys.exit("missing API route request failed: %s" % exc)

print("vps origin health, SPA routing, and API routing passed")
