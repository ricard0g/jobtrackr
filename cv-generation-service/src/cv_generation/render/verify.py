"""Post-render verification."""

from __future__ import annotations

import io
import re

from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import OutputFormat


def verify_rendered(
    data: bytes,
    output_format: OutputFormat,
    *,
    expected_name: str,
    expected_email: str | None,
) -> None:
    if not data:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "Rendered document is empty",
        )

    text = _extract_text(data, output_format)
    if not text or len(text.strip()) < 10:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "Rendered document has insufficient text",
        )

    # Name should appear (allow minor whitespace differences)
    name_norm = re.sub(r"\s+", " ", expected_name).strip().lower()
    text_norm = re.sub(r"\s+", " ", text).lower()
    if name_norm and name_norm not in text_norm:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "Rendered document missing candidate name",
        )

    if expected_email and expected_email.lower() not in text_norm:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            "Rendered document missing email",
        )

    # Soft page budget for PDF: warn via failure only if absurdly large
    if output_format == OutputFormat.PDF and len(data) > 5 * 1024 * 1024:
        raise ServiceError(
            ErrorCode.DOCUMENT_TOO_LONG,
            "Rendered PDF exceeds size budget",
        )


def _extract_text(data: bytes, output_format: OutputFormat) -> str:
    if output_format == OutputFormat.MARKDOWN:
        return data.decode("utf-8", errors="replace")

    if output_format == OutputFormat.DOCX:
        from docx import Document

        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)

    if output_format == OutputFormat.PDF:
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception:  # noqa: BLE001
            return ""

    return ""
