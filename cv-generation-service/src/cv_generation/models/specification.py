"""Request specification models."""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class OutputFormat(StrEnum):
    PDF = "PDF"
    DOCX = "DOCX"
    MARKDOWN = "MARKDOWN"


class GenerationSpecification(BaseModel):
    """Parsed from the multipart `specification` JSON string."""

    output_format: OutputFormat
    job_description: str = Field(min_length=1)
    additional_information: str | None = None
    correlation_id: UUID

    @field_validator("job_description")
    @classmethod
    def _strip_jd(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("job_description must not be empty")
        return stripped

    @field_validator("additional_information")
    @classmethod
    def _strip_additional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
