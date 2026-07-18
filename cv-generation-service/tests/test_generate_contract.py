"""HTTP contract tests for POST /v1/generate."""

from __future__ import annotations

import json
import uuid


def _spec(**overrides) -> str:
    payload = {
        "output_format": "MARKDOWN",
        "job_description": "Software Engineer\nRequirements: Python experience required.",
        "additional_information": None,
        "correlation_id": str(uuid.uuid4()),
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_generate_requires_auth(client, sample_cv_md):
    response = client.post(
        "/v1/generate",
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={"specification": _spec()},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "UNAUTHORIZED"


def test_generate_rejects_bad_token(client, sample_cv_md):
    response = client.post(
        "/v1/generate",
        headers={"Authorization": "Bearer wrong"},
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={"specification": _spec()},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_generate_success_markdown_binary(client, auth_header, sample_cv_md, sample_jd):
    correlation_id = str(uuid.uuid4())
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={
            "specification": _spec(
                job_description=sample_jd,
                correlation_id=correlation_id,
                output_format="MARKDOWN",
            )
        },
    )
    assert response.status_code == 200, response.text
    assert "text/markdown" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"].lower()
    assert response.headers["X-Model-Id"]
    assert response.headers["X-Workflow-Version"] == "cv-graph-v1"
    body = response.content.decode("utf-8")
    assert "Ada Lovelace" in body
    assert "ada@example.com" in body
    # Must not invent Kubernetes from JD
    assert "Kubernetes" not in body


def test_generate_success_docx(client, auth_header, sample_cv_md, sample_jd):
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={
            "specification": _spec(
                job_description=sample_jd,
                output_format="DOCX",
            )
        },
    )
    assert response.status_code == 200, response.text
    assert "wordprocessingml" in response.headers["content-type"]
    assert response.content[:2] == b"PK"  # zip/docx magic


def test_invalid_specification_json(client, auth_header, sample_cv_md):
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={"specification": "{not-json"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"


def test_invalid_output_format(client, auth_header, sample_cv_md):
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={"specification": _spec(output_format="HTML")},
    )
    assert response.status_code == 400
    assert response.json()["code"] in {"INVALID_GENERATION_FORMAT", "INVALID_REQUEST"}


def test_base_cv_too_large(client, auth_header, monkeypatch):
    from cv_generation.config import clear_settings_cache, get_settings

    monkeypatch.setenv("MAX_BASE_CV_BYTES", "100")
    clear_settings_cache()
    settings = get_settings()
    assert settings.max_base_cv_bytes == 100

    big = b"x" * 200
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", big, "text/markdown")},
        data={"specification": _spec()},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "BASE_CV_TOO_LARGE"
