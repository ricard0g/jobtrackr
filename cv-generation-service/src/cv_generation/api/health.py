"""Health endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from cv_generation.config import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
def ready(settings: Settings = Depends(get_settings)) -> JSONResponse:
    ok, reason = settings.readiness_ok()
    if not ok:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": reason},
        )
    return JSONResponse(
        status_code=200,
        content={
            "status": "ready",
            "provider": settings.cv_generation_provider,
            "reason": reason,
        },
    )
