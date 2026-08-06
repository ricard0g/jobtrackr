"""Post-render verification."""

from __future__ import annotations

import io
import re

from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import OutputFormat

# Final safety net. One-page densification is enforced earlier via draft prompts +
# validate→revise budget checks; verify only catches runaway renders.
_MAX_PAGES = 1
_MAX_NON_PDF_CHARS = 12_000


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

    if output_format == OutputFormat.PDF:
        page_count = _pdf_page_count(data)
        verify_one_page_layout(page_count, artifact="PDF")
    elif len(text) > _MAX_NON_PDF_CHARS:
        raise ServiceError(
            ErrorCode.DOCUMENT_TOO_LONG,
            "Rendered document exceeds length budget",
        )


def verify_one_page_layout(
    page_count: int | None,
    *,
    artifact: str = "document",
) -> None:
    """Enforce the ATS one-page contract from a PDF layout proxy page count.

    Used for PDF bytes directly and for DOCX/Markdown via a PDF render of the
    same canonical CV (layout proxy).
    """
    if page_count is None:
        raise ServiceError(
            ErrorCode.GENERATION_VALIDATION_FAILED,
            f"Rendered {artifact} could not be verified",
        )
    if page_count > _MAX_PAGES:
        raise ServiceError(
            ErrorCode.DOCUMENT_TOO_LONG,
            f"Rendered {artifact} exceeds {_MAX_PAGES} page",
        )


def pdf_page_count(data: bytes) -> int | None:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return len(reader.pages)
    except Exception:  # noqa: BLE001
        return None


def _pdf_page_count(data: bytes) -> int | None:
    return pdf_page_count(data)


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
