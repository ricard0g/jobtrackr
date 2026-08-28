import json
import os
import re
import sys
import urllib.error
import urllib.request

ORIGIN = os.environ.get("JOBTRACKR_APP_ORIGIN", "http://frontend").rstrip("/")


def get(url):
    request = urllib.request.Request(url)
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.read().decode(), dict(response.headers)


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

status, body, _ = get(ORIGIN + "/api/v1/auth/csrf")
if status != 200:
    sys.exit("csrf through nginx returned HTTP %s: %s" % (status, body))
payload = json.loads(body)
if not payload.get("token") or not payload.get("headerName"):
    sys.exit("csrf through nginx did not return a token: %s" % body)

try:
    get(ORIGIN + "/api/v1/does-not-exist")
    sys.exit("missing API route unexpectedly succeeded")
except urllib.error.HTTPError as exc:
    error_type = exc.headers.get("Content-Type") or ""
    if exc.code == 404 and "text/html" in error_type:
        sys.exit("missing API route fell through to the SPA shell")
    if exc.code not in (401, 403, 404):
        sys.exit("missing API route returned HTTP %s: %s" % (exc.code, exc.read().decode()))

print("frontend container smoke passed")
