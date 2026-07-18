"""Extraction unit tests."""

from __future__ import annotations

import pytest

from cv_generation.extraction.extract import extract_base_cv
from cv_generation.models.errors import ErrorCode, ServiceError


def test_extract_markdown(sample_cv_md):
    result = extract_base_cv(sample_cv_md, filename="cv.md", content_type="text/markdown")
    assert "Ada Lovelace" in result.text
    assert "ada@example.com" in result.text
    assert result.source_format.value == "markdown"


def test_reject_empty():
    with pytest.raises(ServiceError) as exc:
        extract_base_cv(b"", filename="cv.md")
    assert exc.value.code == ErrorCode.MALFORMED_BASE_CV


def test_reject_scanned_like_pdf():
    # Minimal valid-ish PDF with almost no text (image-only heuristic)
    # Use a tiny PDF that pypdf can open but has no extractable text
    pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n"
        b"0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
        b"trailer<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF\n"
    )
    with pytest.raises(ServiceError) as exc:
        extract_base_cv(pdf, filename="scanned.pdf", content_type="application/pdf")
    assert exc.value.code in {
        ErrorCode.BASE_CV_NOT_EXTRACTABLE,
        ErrorCode.MALFORMED_BASE_CV,
    }


def test_reject_whitespace_only_md():
    with pytest.raises(ServiceError) as exc:
        extract_base_cv(b"   \n\n  ", filename="empty.md")
    assert exc.value.code == ErrorCode.BASE_CV_NOT_EXTRACTABLE
