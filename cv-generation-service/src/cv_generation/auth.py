"""Service-to-service Bearer token authentication."""

from __future__ import annotations

import secrets

from fastapi import Depends, Header

from cv_generation.config import Settings, get_settings
from cv_generation.models.errors import ErrorCode, ServiceError


def require_service_token(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Validate Authorization: Bearer <CV_GENERATION_SERVICE_TOKEN>."""
    if not authorization or not authorization.startswith("Bearer "):
        raise ServiceError(
            ErrorCode.UNAUTHORIZED,
            "Missing or invalid Authorization header",
            status_code=401,
        )
    token = authorization[7:].strip()
    expected = settings.cv_generation_service_token
    if not expected or not secrets.compare_digest(token, expected):
        raise ServiceError(
            ErrorCode.UNAUTHORIZED,
            "Invalid service token",
            status_code=401,
        )
