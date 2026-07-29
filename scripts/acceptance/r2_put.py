#!/usr/bin/env python3
"""Upload a file to Cloudflare R2 using SigV4 (stdlib only)."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _signing_key(secret: str, date_stamp: str, region: str, service: str) -> bytes:
    k_date = _sign(("AWS4" + secret).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    return _sign(k_service, "aws4_request")


def put_object(
    *,
    endpoint: str,
    bucket: str,
    access_key: str,
    secret_key: str,
    object_key: str,
    body: bytes,
    content_type: str,
    region: str = "auto",
) -> None:
    parsed = urlparse(endpoint.rstrip("/"))
    host = parsed.netloc
    amz_date = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    date_stamp = amz_date[:8]
    payload_hash = hashlib.sha256(body).hexdigest()
    canonical_uri = f"/{bucket}/{object_key}"
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        [
            "PUT",
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signature = hmac.new(
        _signing_key(secret_key, date_stamp, region, "s3"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )
    url = f"{parsed.scheme}://{host}{canonical_uri}"
    request = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Content-Type": content_type,
            "Host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            "Authorization": authorization,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"R2 put failed with HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"R2 put failed with HTTP {exc.code}: {detail}") from exc


def head_object(
    *,
    endpoint: str,
    bucket: str,
    access_key: str,
    secret_key: str,
    object_key: str,
    region: str = "auto",
) -> bool:
    parsed = urlparse(endpoint.rstrip("/"))
    host = parsed.netloc
    amz_date = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    date_stamp = amz_date[:8]
    payload_hash = hashlib.sha256(b"").hexdigest()
    canonical_uri = f"/{bucket}/{object_key}"
    canonical_headers = (
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        [
            "HEAD",
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signature = hmac.new(
        _signing_key(secret_key, date_stamp, region, "s3"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )
    url = f"{parsed.scheme}://{host}{canonical_uri}"
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={
            "Host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            "Authorization": authorization,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status == 200
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return False
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"R2 head failed with HTTP {exc.code}: {detail}") from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=os.environ.get("R2_ENDPOINT", ""))
    parser.add_argument("--bucket", default=os.environ.get("R2_BUCKET", ""))
    parser.add_argument("--access-key", default=os.environ.get("R2_ACCESS_KEY_ID", ""))
    parser.add_argument("--secret-key", default=os.environ.get("R2_SECRET_ACCESS_KEY", ""))
    parser.add_argument("--key", required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--content-type", required=True)
    args = parser.parse_args()
    if not all([args.endpoint, args.bucket, args.access_key, args.secret_key]):
        print("Missing R2 configuration", file=sys.stderr)
        return 1
    body = open(args.file, "rb").read()
    put_object(
        endpoint=args.endpoint,
        bucket=args.bucket,
        access_key=args.access_key,
        secret_key=args.secret_key,
        object_key=args.key,
        body=body,
        content_type=args.content_type,
    )
    print(args.key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
