"""LangGraph workflow state."""

from __future__ import annotations

from typing import Any, TypedDict

from cv_generation.models.canonical_cv import CanonicalCV
from cv_generation.models.specification import OutputFormat


class GraphState(TypedDict, total=False):
    # Inputs
    base_cv_bytes: bytes
    filename: str | None
    content_type: str | None
    job_description: str
    additional_information: str | None
    output_format: OutputFormat
    correlation_id: str
    max_extracted_chars: int
    max_revisions: int

    # Intermediate
    extracted_text: str
    source_format: str
    evidence: dict[str, Any]
    jd_analysis: dict[str, Any]
    output_language: str
    language_uncertain: bool

    canonical_cv: CanonicalCV | None
    validation_issues: list[str]
    revision_count: int
    needs_revision: bool

    # Outputs
    rendered_bytes: bytes
    content_type_out: str
    filename_out: str
    model_id: str
    error_code: str | None
    error_message: str | None
