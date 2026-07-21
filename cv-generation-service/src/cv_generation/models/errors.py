"""Stable API error codes and exception types."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ErrorCode(StrEnum):
    UNAUTHORIZED = "UNAUTHORIZED"
    INVALID_REQUEST = "INVALID_REQUEST"
    INVALID_GENERATION_FORMAT = "INVALID_GENERATION_FORMAT"
    BASE_CV_TOO_LARGE = "BASE_CV_TOO_LARGE"
    BASE_CV_NOT_EXTRACTABLE = "BASE_CV_NOT_EXTRACTABLE"
    MALFORMED_BASE_CV = "MALFORMED_BASE_CV"
    OUTPUT_LANGUAGE_REQUIRED = "OUTPUT_LANGUAGE_REQUIRED"
    DOCUMENT_TOO_LONG = "DOCUMENT_TOO_LONG"
    GENERATION_VALIDATION_FAILED = "GENERATION_VALIDATION_FAILED"
    GENERATION_TIMEOUT = "GENERATION_TIMEOUT"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# Map error codes to default HTTP status codes
ERROR_STATUS: dict[ErrorCode, int] = {
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.INVALID_REQUEST: 400,
    ErrorCode.INVALID_GENERATION_FORMAT: 400,
    ErrorCode.BASE_CV_TOO_LARGE: 413,
    ErrorCode.BASE_CV_NOT_EXTRACTABLE: 422,
    ErrorCode.MALFORMED_BASE_CV: 422,
    ErrorCode.OUTPUT_LANGUAGE_REQUIRED: 422,
    ErrorCode.DOCUMENT_TOO_LONG: 413,
    ErrorCode.GENERATION_VALIDATION_FAILED: 422,
    ErrorCode.GENERATION_TIMEOUT: 504,
    ErrorCode.PROVIDER_RATE_LIMITED: 429,
    ErrorCode.PROVIDER_UNAVAILABLE: 503,
    ErrorCode.INTERNAL_ERROR: 500,
}


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    details: dict[str, Any] | None = Field(default=None)


class ServiceError(Exception):
    """Raised inside the service; converted to JSON by the exception handler."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code or ERROR_STATUS.get(code, 500)
        self.details = details

    def to_body(self) -> ErrorBody:
        return ErrorBody(code=self.code, message=self.message, details=self.details)
