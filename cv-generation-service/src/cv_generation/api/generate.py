"""POST /v1/generate — multipart CV generation."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from cv_generation.auth import require_service_token
from cv_generation.config import Settings, get_settings
from cv_generation.graph.workflow import run_generation
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import GenerationSpecification, OutputFormat
from cv_generation.providers import build_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["generate"])


@router.post(
    "/generate",
    dependencies=[Depends(require_service_token)],
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/pdf": {},
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {},
                "text/markdown": {},
            },
            "description": "Generated CV document bytes",
        },
        400: {"description": "Invalid request"},
        401: {"description": "Unauthorized"},
        413: {"description": "Payload too large"},
        422: {"description": "Generation / extraction validation failed"},
        429: {"description": "Provider rate limited"},
        503: {"description": "Provider unavailable"},
        504: {"description": "Generation timeout"},
    },
)
async def generate(
    file: Annotated[UploadFile, File(description="Base CV (pdf/docx/md)")],
    specification: Annotated[str, Form(description="JSON GenerationSpecification")],
    settings: Settings = Depends(get_settings),
) -> Response:
    try:
        spec_data = json.loads(specification)
    except json.JSONDecodeError as exc:
        raise ServiceError(
            ErrorCode.INVALID_REQUEST,
            "specification must be valid JSON",
        ) from exc

    try:
        spec = GenerationSpecification.model_validate(spec_data)
    except Exception as exc:  # noqa: BLE001 — pydantic ValidationError
        message = str(exc)
        if "output_format" in message.lower():
            raise ServiceError(
                ErrorCode.INVALID_GENERATION_FORMAT,
                "Invalid output_format",
            ) from exc
        if "extra" in message.lower() and "forbid" in message.lower():
            raise ServiceError(
                ErrorCode.INVALID_REQUEST,
                "specification contains unexpected fields",
            ) from exc
        raise ServiceError(
            ErrorCode.INVALID_REQUEST,
            "Invalid specification",
        ) from exc

    if len(spec.job_description) > settings.max_job_description_chars:
        raise ServiceError(
            ErrorCode.DOCUMENT_TOO_LONG,
            f"job_description exceeds {settings.max_job_description_chars} characters",
        )
    if (
        spec.additional_information
        and len(spec.additional_information) > settings.max_additional_info_chars
    ):
        raise ServiceError(
            ErrorCode.DOCUMENT_TOO_LONG,
            f"additional_information exceeds {settings.max_additional_info_chars} characters",
        )

    # Bound memory before reading the full body when Content-Length is present.
    if file.size is not None and file.size > settings.max_base_cv_bytes:
        raise ServiceError(
            ErrorCode.BASE_CV_TOO_LARGE,
            f"Base CV exceeds {settings.max_base_cv_bytes} bytes",
        )

    raw = await file.read(settings.max_base_cv_bytes + 1)
    if len(raw) > settings.max_base_cv_bytes:
        raise ServiceError(
            ErrorCode.BASE_CV_TOO_LARGE,
            f"Base CV exceeds {settings.max_base_cv_bytes} bytes",
        )
    if not raw:
        raise ServiceError(ErrorCode.MALFORMED_BASE_CV, "Base CV file is empty")

    provider = build_provider(settings)
    cancel_event = threading.Event()

    async def _run():
        return await asyncio.to_thread(
            run_generation,
            provider=provider,
            base_cv_bytes=raw,
            filename=file.filename,
            content_type=file.content_type,
            job_description=spec.job_description,
            additional_information=spec.additional_information,
            output_format=OutputFormat(spec.output_format),
            correlation_id=str(spec.correlation_id),
            workflow_version=settings.cv_generation_workflow_version,
            max_extracted_chars=settings.max_extracted_text_chars,
            max_revisions=settings.max_ai_revisions,
            cancel_event=cancel_event,
        )

    try:
        result = await asyncio.wait_for(
            _run(),
            timeout=settings.cv_generation_request_timeout_seconds,
        )
    except TimeoutError as exc:
        cancel_event.set()
        logger.warning(
            "Generation timed out correlation_id=%s",
            spec.correlation_id,
        )
        raise ServiceError(
            ErrorCode.GENERATION_TIMEOUT,
            "Generation exceeded request timeout",
        ) from exc

    disposition = f"attachment; filename=\"{result.filename}\"; filename*=UTF-8''{quote(result.filename)}"
    return Response(
        content=result.content,
        media_type=result.content_type,
        headers={
            "Content-Disposition": disposition,
            "X-Model-Id": result.model_id,
            "X-Workflow-Version": result.workflow_version,
            "X-Correlation-Id": str(spec.correlation_id),
        },
    )
