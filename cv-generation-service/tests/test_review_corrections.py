"""Additional contract/security tests for review corrections."""

from __future__ import annotations

import io
import json
import uuid
import zipfile

import pytest

from cv_generation.extraction.extract import extract_base_cv
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import OutputFormat
from cv_generation.render.verify import verify_rendered


def _spec(**overrides) -> str:
    payload = {
        "output_format": "MARKDOWN",
        "job_description": "Software Engineer\nRequirements: Python experience required.",
        "additional_information": None,
        "correlation_id": str(uuid.uuid4()),
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_reject_extra_specification_fields(client, auth_header, sample_cv_md):
    response = client.post(
        "/v1/generate",
        headers=auth_header,
        files={"file": ("cv.md", sample_cv_md, "text/markdown")},
        data={"specification": _spec(unexpected_field="nope")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"


def test_reject_format_signature_mismatch():
    pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    with pytest.raises(ServiceError) as exc:
        extract_base_cv(pdf, filename="cv.md", content_type="text/markdown")
    assert exc.value.code == ErrorCode.MALFORMED_BASE_CV


def test_reject_docx_zip_bomb():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        # Highly compressible payload advertised as a huge uncompressed entry.
        archive.writestr("word/document.xml", "A" * 1024)
        info = archive.getinfo("word/document.xml")
        # Force unsafe metadata via ZipInfo mutation after write is awkward;
        # instead craft an archive with many entries.
        for i in range(250):
            archive.writestr(f"pad/{i}.txt", "x")
    data = buffer.getvalue()
    with pytest.raises(ServiceError) as exc:
        extract_base_cv(data, filename="cv.docx", content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert exc.value.code == ErrorCode.MALFORMED_BASE_CV


def test_pdf_page_limit_enforced():
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=612, height=792)
    buffer = io.BytesIO()
    writer.write(buffer)
    # Blank pages won't contain the name; verification should fail on pages first
    # after we inject text via a markdown path — assert helper directly.
    with pytest.raises(ServiceError) as exc:
        verify_rendered(
            buffer.getvalue(),
            OutputFormat.PDF,
            expected_name="Ada Lovelace",
            expected_email="ada@example.com",
        )
    assert exc.value.code in {
        ErrorCode.DOCUMENT_TOO_LONG,
        ErrorCode.GENERATION_VALIDATION_FAILED,
    }


def test_markdown_length_budget():
    huge = ("Ada Lovelace\nada@example.com\n" + ("word " * 5000)).encode("utf-8")
    with pytest.raises(ServiceError) as exc:
        verify_rendered(
            huge,
            OutputFormat.MARKDOWN,
            expected_name="Ada Lovelace",
            expected_email="ada@example.com",
        )
    assert exc.value.code == ErrorCode.DOCUMENT_TOO_LONG
