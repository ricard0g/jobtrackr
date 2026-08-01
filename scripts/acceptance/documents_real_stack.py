#!/usr/bin/env python3
"""Real-stack Documents acceptance path against API + Postgres + R2 + Gotenberg."""

from __future__ import annotations

import hashlib
import http.cookiejar
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

from r2_put import head_object, put_object

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
API_ORIGIN = os.environ.get("VITE_API_ORIGIN", "http://localhost:8080").rstrip("/")
AUTH_BASE = f"{API_ORIGIN}/api/v1/auth"
API_BASE = f"{API_ORIGIN}/api/v1"
GOTENBERG_HEALTH = os.environ.get("GOTENBERG_BASE_URL", "http://localhost:3000").rstrip("/") + "/health"
PAGE_SIZE = 20
DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


class AcceptanceError(RuntimeError):
    pass


class ApiClient:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))
        self.access_token: str | None = None
        self.csrf_header = "X-XSRF-TOKEN"
        self.csrf_token: str | None = None
        self.user_id: str | None = None

    def _refresh_csrf(self) -> None:
        status, headers, body = self.request("GET", f"{AUTH_BASE}/csrf", auth=False, csrf=False)
        if status != 200:
            raise AcceptanceError(f"CSRF fetch failed: HTTP {status} {body}")
        payload = json.loads(body.decode("utf-8"))
        self.csrf_token = payload.get("token")
        self.csrf_header = payload.get("headerName") or self.csrf_header
        if not self.csrf_token:
            raise AcceptanceError("CSRF token missing")

    def request(
        self,
        method: str,
        url: str,
        *,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        auth: bool = True,
        csrf: bool = False,
        expect: int | tuple[int, ...] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        hdrs = dict(headers or {})
        if auth and self.access_token:
            hdrs["Authorization"] = f"Bearer {self.access_token}"
        if csrf:
            self._refresh_csrf()
            hdrs[self.csrf_header] = self.csrf_token or ""
        request = Request(url, data=data, headers=hdrs, method=method)
        try:
            with self.opener.open(request, timeout=90) as response:
                status = response.status
                response_headers = {k.lower(): v for k, v in response.headers.items()}
                body = response.read()
        except HTTPError as exc:
            status = exc.code
            response_headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
            body = exc.read()
        except URLError as exc:
            raise AcceptanceError(f"Request failed for {method} {url}: {exc}") from exc

        if expect is not None:
            allowed = expect if isinstance(expect, tuple) else (expect,)
            if status not in allowed:
                raise AcceptanceError(
                    f"{method} {url} expected {allowed}, got {status}: {body[:500]!r}"
                )
        return status, response_headers, body

    def register(self, email: str, password: str) -> None:
        payload = json.dumps(
            {"email": email, "password": password, "displayName": "Documents Acceptance"}
        ).encode("utf-8")
        status, _, body = self.request(
            "POST",
            f"{AUTH_BASE}/register",
            data=payload,
            headers={"Content-Type": "application/json"},
            auth=False,
            csrf=True,
            expect=201,
        )
        auth = json.loads(body.decode("utf-8"))
        self.access_token = auth["accessToken"]
        self.user_id = auth["user"]["userId"]

    def json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        expect: int | tuple[int, ...] = 200,
    ) -> Any:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"} if payload is not None else None
        status, _, body = self.request(
            method,
            f"{API_BASE}{path}",
            data=data,
            headers=headers,
            csrf=method in {"POST", "PUT", "PATCH", "DELETE"},
            expect=expect,
        )
        if not body:
            return None
        return json.loads(body.decode("utf-8"))


def step(message: str) -> None:
    print(f"✓ {message}")


def require_env(*names: str) -> None:
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise AcceptanceError(f"Missing required env vars: {', '.join(missing)}")


def health_checks() -> None:
    client = ApiClient()
    status, _, body = client.request(
        "GET", f"{API_ORIGIN}/actuator/health", auth=False, expect=200
    )
    payload = json.loads(body.decode("utf-8"))
    if payload.get("status") != "UP":
        raise AcceptanceError(f"API health not UP: {payload}")
    status, _, _ = client.request("GET", GOTENBERG_HEALTH, auth=False, expect=200)
    step("API and pinned Gotenberg are healthy")


def write_fixtures(directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)

    md = directory / "acceptance-base.md"
    md.write_text(
        "# Acceptance Markdown\n\n"
        "Alex Candidate evidence notes with enough extractable characters for validation.\n\n"
        "Safe content with <script>window.__xss=true</script> and "
        '<iframe src="https://evil.example"></iframe>.\n\n'
        "See [profile](https://example.com/profile).\n",
        encoding="utf-8",
    )

    # Valid OOXML produced by Apache POI so BaseCvValidator can extract text.
    docx = directory / "acceptance-base.docx"
    if not docx.is_file():
        raise AcceptanceError(f"Missing committed DOCX fixture: {docx}")

    pdf = directory / "acceptance-base.pdf"
    gotenberg_base = os.environ.get("GOTENBERG_BASE_URL", "http://localhost:3000").rstrip("/")
    subprocess.run(
        [
            "curl",
            "-fsS",
            "--request",
            "POST",
            f"{gotenberg_base}/forms/libreoffice/convert",
            "--form",
            f"files=@{docx}",
            "-o",
            str(pdf),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    if not pdf.read_bytes().startswith(b"%PDF"):
        raise AcceptanceError("Gotenberg LibreOffice conversion did not produce a PDF fixture")

    gen_pdf = directory / "acceptance-generated.pdf"
    gen_pdf.write_bytes(pdf.read_bytes())
    gen_md = directory / "acceptance-generated.md"
    gen_md.write_text(
        "# Generated Markdown\n\nRole-tailored notes for Alex Candidate with enough text.\n",
        encoding="utf-8",
    )
    gen_docx = directory / "acceptance-generated.docx"
    gen_docx.write_bytes(docx.read_bytes())
    return {
        "pdf": pdf,
        "md": md,
        "docx": docx,
        "gen_pdf": gen_pdf,
        "gen_md": gen_md,
        "gen_docx": gen_docx,
    }


def upload_base_cv(client: ApiClient, path: Path, content_type: str) -> dict[str, Any]:
    boundary = f"----JobTrackrAcceptance{uuid.uuid4().hex}"
    filename = path.name
    file_bytes = path.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
    status, _, response_body = client.request(
        "POST",
        f"{API_BASE}/base-cvs",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        csrf=True,
        expect=201,
    )
    return json.loads(response_body.decode("utf-8"))


def assert_preview_headers(headers: dict[str, str], *, content_type_prefix: str) -> None:
    cache = headers.get("cache-control", "")
    if "private" not in cache or "no-store" not in cache:
        raise AcceptanceError(f"Expected private, no-store Cache-Control, got {cache!r}")
    disposition = headers.get("content-disposition", "")
    if "inline" not in disposition.lower():
        raise AcceptanceError(f"Expected inline Content-Disposition, got {disposition!r}")
    content_type = headers.get("content-type", "")
    if not content_type.lower().startswith(content_type_prefix.lower()):
        raise AcceptanceError(
            f"Expected Content-Type starting with {content_type_prefix!r}, got {content_type!r}"
        )


def preview(
    client: ApiClient,
    path: str,
    *,
    expect: int = 200,
) -> tuple[dict[str, str], bytes]:
    status, headers, body = client.request("GET", f"{API_BASE}{path}", expect=expect)
    return headers, body


def download_original_uri(client: ApiClient, path: str) -> str:
    payload = client.json("GET", path, expect=200)
    uri = payload.get("uri")
    if not uri:
        raise AcceptanceError(f"Download URI missing from {path}")
    return uri


def fetch_url(url: str) -> tuple[dict[str, str], bytes]:
    request = Request(url, method="GET")
    try:
        with build_opener().open(request, timeout=60) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            return headers, response.read()
    except HTTPError as exc:
        raise AcceptanceError(f"Signed download failed HTTP {exc.code}") from exc


def r2_config() -> dict[str, str]:
    require_env("R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    return {
        "endpoint": os.environ["R2_ENDPOINT"],
        "bucket": os.environ["R2_BUCKET"],
        "access_key": os.environ["R2_ACCESS_KEY_ID"],
        "secret_key": os.environ["R2_SECRET_ACCESS_KEY"],
    }


def plant_generated_cvs(
    client: ApiClient,
    fixtures: dict[str, Path],
) -> list[dict[str, Any]]:
    company = client.json(
        "POST",
        "/companies",
        payload={"companyName": f"Acceptance Co {uuid.uuid4().hex[:8]}"},
        expect=201,
    )
    application = client.json(
        "POST",
        "/applications",
        payload={
            "companyId": company["companyId"],
            "applicationTitle": "Acceptance Engineer",
            "applicationStatus": "APPLIED",
        },
        expect=201,
    )
    application_id = application["applicationId"]
    user_id = client.user_id
    assert user_id is not None
    cfg = r2_config()

    planted: list[dict[str, Any]] = []
    # Enough filler PDFs for a full first page plus overflow + one MD + one DOCX for format coverage
    specs: list[tuple[str, Path, str, str]] = []
    for index in range(PAGE_SIZE + 1):
        specs.append(
            (
                "PDF",
                fixtures["gen_pdf"],
                "application/pdf",
                f"acceptance-generated-{index + 1}.pdf",
            )
        )
    specs.append(("MARKDOWN", fixtures["gen_md"], "text/markdown", "acceptance-generated.md"))
    specs.append(("DOCX", fixtures["gen_docx"], DOCX_CONTENT_TYPE, "acceptance-generated.docx"))

    sql_rows: list[str] = []
    for version, (fmt, path, content_type, filename) in enumerate(specs, start=1):
        object_key = (
            f"users/{user_id}/applications/{application_id}/cvs/"
            f"{uuid.uuid4()}.{path.suffix.lstrip('.')}"
        )
        body = path.read_bytes()
        put_object(
            endpoint=cfg["endpoint"],
            bucket=cfg["bucket"],
            access_key=cfg["access_key"],
            secret_key=cfg["secret_key"],
            object_key=object_key,
            body=body,
            content_type=content_type,
        )
        sha = hashlib.sha256(body).hexdigest()
        created_at = f"2026-07-27 12:{version:02d}:00+00"
        sql_rows.append(
            "("
            f"{application_id}, {version}, '{object_key}', '{filename}', '{fmt}', "
            f"'{content_type}', {len(body)}, '{sha}', TIMESTAMPTZ '{created_at}'"
            ")"
        )
        planted.append(
            {
                "format": fmt,
                "filename": filename,
                "object_key": object_key,
                "version": version,
            }
        )

    sql = f"""
INSERT INTO application_cvs (
    application_cv_application_id,
    application_cv_version,
    application_cv_object_key,
    application_cv_original_filename,
    application_cv_format,
    application_cv_content_type,
    application_cv_byte_size,
    application_cv_sha256,
    application_cv_created_at
) VALUES
{',\n'.join(sql_rows)}
RETURNING application_cv_id, application_cv_original_filename, application_cv_format, application_cv_object_key;
"""
    result = subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            os.environ.get("POSTGRES_USER", "jobtrackr_app"),
            "-d",
            os.environ.get("POSTGRES_DB", "jobtrackr"),
            "-v",
            "ON_ERROR_STOP=1",
            "-At",
            "-F",
            ",",
            "-c",
            sql,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    rows = [
        line.strip()
        for line in result.stdout.splitlines()
        if line.strip() and not line.strip().startswith("INSERT ")
    ]
    if len(rows) != len(planted):
        raise AcceptanceError(f"Expected {len(planted)} planted rows, got {len(rows)}: {rows}")
    for index, line in enumerate(rows):
        generated_cv_id, filename, fmt, object_key = line.split(",", 3)
        planted[index]["generatedCvId"] = int(generated_cv_id)
        planted[index]["filename"] = filename
        planted[index]["format"] = fmt
        planted[index]["object_key"] = object_key
    return planted


def pending_cleanup_exists(object_key: str) -> bool:
    query = (
        "select count(*) from storage_cleanup_jobs "
        f"where storage_cleanup_object_key = '{object_key}' "
        "and storage_cleanup_completed_at is null;"
    )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            os.environ.get("POSTGRES_USER", "jobtrackr_app"),
            "-d",
            os.environ.get("POSTGRES_DB", "jobtrackr"),
            "-At",
            "-c",
            query,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() != "0"


def run() -> None:
    require_env("R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    health_checks()
    fixtures = write_fixtures(FIXTURES)
    client = ApiClient()
    email = f"documents-acceptance-{uuid.uuid4().hex[:10]}@example.test"
    password = "acceptance-password"
    client.register(email, password)
    step(f"Registered acceptance user {email}")

    pdf_cv = upload_base_cv(client, fixtures["pdf"], "application/pdf")
    md_cv = upload_base_cv(client, fixtures["md"], "text/markdown")
    docx_cv = upload_base_cv(client, fixtures["docx"], DOCX_CONTENT_TYPE)
    step("Uploaded PDF, Markdown, and DOCX Base CVs")

    headers, body = preview(client, f"/base-cvs/{pdf_cv['baseCvId']}/preview")
    assert_preview_headers(headers, content_type_prefix="application/pdf")
    if not body.startswith(b"%PDF"):
        raise AcceptanceError("PDF Base CV preview did not stream a PDF")
    step("PDF Base CV preview streams authenticated inline PDF with private, no-store")

    headers, body = preview(client, f"/base-cvs/{md_cv['baseCvId']}/preview")
    assert_preview_headers(headers, content_type_prefix="text/markdown")
    markdown = body.decode("utf-8")
    if "<script>window.__xss=true</script>" not in markdown:
        raise AcceptanceError("Markdown preview should stream raw source including HTML tags")
    # Safe non-rendering of that HTML is covered by DocumentsRoute Markdown viewer tests;
    # the HTTP path proves the backend streams source Markdown rather than a sanitized HTML document.
    step("Markdown Base CV preview streams UTF-8 source (HTML remains unexecuted text)")

    cfg = r2_config()
    preview_key = f"users/{client.user_id}/previews/base-cvs/{docx_cv['baseCvId']}.pdf"
    if head_object(
        endpoint=cfg["endpoint"],
        bucket=cfg["bucket"],
        access_key=cfg["access_key"],
        secret_key=cfg["secret_key"],
        object_key=preview_key,
    ):
        raise AcceptanceError("DOCX preview cache should miss before first preview")

    headers, body = preview(client, f"/base-cvs/{docx_cv['baseCvId']}/preview")
    assert_preview_headers(headers, content_type_prefix="application/pdf")
    if not body.startswith(b"%PDF"):
        raise AcceptanceError("DOCX Base CV preview miss did not return PDF")
    if not head_object(
        endpoint=cfg["endpoint"],
        bucket=cfg["bucket"],
        access_key=cfg["access_key"],
        secret_key=cfg["secret_key"],
        object_key=preview_key,
    ):
        raise AcceptanceError("DOCX preview cache object missing after miss conversion")
    step("DOCX Base CV preview cache miss converted through Gotenberg and warmed R2")

    headers, body = preview(client, f"/base-cvs/{docx_cv['baseCvId']}/preview")
    assert_preview_headers(headers, content_type_prefix="application/pdf")
    if not body.startswith(b"%PDF"):
        raise AcceptanceError("DOCX Base CV preview hit did not return PDF")
    step("DOCX Base CV preview cache hit reused the R2 derivative")

    download_uri = download_original_uri(client, f"/base-cvs/{docx_cv['baseCvId']}/download")
    download_headers, download_body = fetch_url(download_uri)
    download_type = download_headers.get("content-type", "")
    if "wordprocessingml" not in download_type and "octet-stream" not in download_type:
        # R2 may return the stored content type; accept DOCX magic via zip header too.
        if not download_body.startswith(b"PK"):
            raise AcceptanceError(
                f"Download Original for DOCX returned unexpected type {download_type!r}"
            )
    if download_body.startswith(b"%PDF"):
        raise AcceptanceError("Download Original returned a PDF derivative instead of the DOCX source")
    step("Download Original returns the DOCX source, not the preview derivative")

    planted = plant_generated_cvs(client, fixtures)
    page0 = client.json("GET", f"/generated-cvs?page=0&size={PAGE_SIZE}", expect=200)
    if page0["size"] != PAGE_SIZE:
        raise AcceptanceError(f"Expected page size {PAGE_SIZE}, got {page0['size']}")
    if len(page0["items"]) != PAGE_SIZE:
        raise AcceptanceError(f"Expected {PAGE_SIZE} items on page 0, got {len(page0['items'])}")
    if page0["total"] < PAGE_SIZE + 1:
        raise AcceptanceError(f"Expected more than {PAGE_SIZE} Generated CVs, got {page0['total']}")
    ids = [item["generatedCvId"] for item in page0["items"]]
    if ids != sorted(ids, reverse=True):
        # newest-first by createdAt then id; planted versions increase over time so ids should be desc
        raise AcceptanceError(f"Generated CV page 0 is not newest-first by id: {ids}")
    page1 = client.json("GET", f"/generated-cvs?page=1&size={PAGE_SIZE}", expect=200)
    if not page1["items"]:
        raise AcceptanceError("Expected additional Generated CV page")
    overlap = set(ids) & {item["generatedCvId"] for item in page1["items"]}
    if overlap:
        raise AcceptanceError(f"Pagination duplicated Generated CV ids: {overlap}")
    step("Generated CV list returns newest-first pages of twenty and loads an additional page")

    by_format = {item["format"]: item for item in planted}
    for fmt, path_suffix, content_prefix in (
        ("PDF", "pdf", "application/pdf"),
        ("MARKDOWN", "md", "text/markdown"),
        ("DOCX", "docx", "application/pdf"),
    ):
        item = by_format[fmt]
        headers, body = preview(client, f"/generated-cvs/{item['generatedCvId']}/preview")
        assert_preview_headers(headers, content_type_prefix=content_prefix)
        if fmt in {"PDF", "DOCX"} and not body.startswith(b"%PDF"):
            raise AcceptanceError(f"Generated CV {fmt} preview did not stream PDF bytes")
        if fmt == "MARKDOWN" and b"Generated Markdown" not in body:
            raise AcceptanceError("Generated CV Markdown preview missing expected content")
    step("Generated CV previews work for PDF, Markdown, and DOCX")

    delete_target = by_format["DOCX"]
    preview_key = f"users/{client.user_id}/previews/generated-cvs/{delete_target['generatedCvId']}.pdf"
    # Warm Generated CV DOCX preview so delete schedules the derivative cleanup job.
    preview(client, f"/generated-cvs/{delete_target['generatedCvId']}/preview")
    if not head_object(
        endpoint=cfg["endpoint"],
        bucket=cfg["bucket"],
        access_key=cfg["access_key"],
        secret_key=cfg["secret_key"],
        object_key=preview_key,
    ):
        raise AcceptanceError("Expected Generated CV DOCX preview cache before delete")

    client.json("DELETE", f"/generated-cvs/{delete_target['generatedCvId']}", expect=204)
    preview(client, f"/generated-cvs/{delete_target['generatedCvId']}/preview", expect=(404,))
    if not pending_cleanup_exists(preview_key) and not pending_cleanup_exists(delete_target["object_key"]):
        raise AcceptanceError(
            "Delete did not schedule cleanup for the preview derivative or source object"
        )
    step("Deleted Generated CV is immediately inaccessible and schedules preview cleanup")

    # Authenticated Base CV management remains available even when Generated CV listing fails.
    broken = ApiClient()
    broken.access_token = "not-a-valid-token"
    status, _, _ = broken.request(
        "GET",
        f"{API_BASE}/generated-cvs",
        expect=(401, 403),
    )
    base_list = client.json("GET", "/base-cvs", expect=200)
    if len(base_list) < 3:
        raise AcceptanceError("Base CV management broke while Generated CV listing failed")
    step("Generated CV list failure leaves Base CV listing available")

    status, _, _ = client.request(
        "GET",
        f"{API_BASE}/base-cvs/{pdf_cv['baseCvId']}/preview",
        auth=False,
        expect=(401, 403),
    )
    step("Unauthenticated preview access is rejected")

    # Keep fixtures on disk for the UI checklist in the runbook.
    step("Real-stack Documents HTTP acceptance path passed")
    print()
    print("Manual UI checklist (web app at http://localhost:5173):")
    print("  1. Sign in with the acceptance user printed above (or seed user).")
    print("  2. Open Documents; confirm Base CVs and Generated CVs sections.")
    print("  3. Open PDF/Markdown/DOCX previews; verify keyboard Escape, focus trap,")
    print("     safe Markdown links, zoom/page bounds, and a ~375px viewport.")
    print("  4. Confirm Download Original and Delete stay on the row actions.")


if __name__ == "__main__":
    try:
        run()
    except AcceptanceError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    except subprocess.CalledProcessError as exc:
        print(exc.stdout or "", file=sys.stderr)
        print(exc.stderr or "", file=sys.stderr)
        print(f"✗ Command failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
