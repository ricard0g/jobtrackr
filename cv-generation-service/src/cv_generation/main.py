"""FastAPI application entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from cv_generation import __version__
from cv_generation.api import generate, health
from cv_generation.models.errors import ErrorBody, ErrorCode, ServiceError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("cv_generation")


def create_app() -> FastAPI:
    app = FastAPI(
        title="JobTrackr CV Generation Service",
        version=__version__,
        description="Stateless ATS-safe CV generation microservice",
    )

    @app.exception_handler(ServiceError)
    async def service_error_handler(_request: Request, exc: ServiceError) -> JSONResponse:
        body = exc.to_body()
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(exclude_none=True),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=ErrorBody(
                code=ErrorCode.INVALID_REQUEST,
                message="Request validation failed",
                details={"errors": exc.errors()},
            ).model_dump(exclude_none=True),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ErrorBody(
                code=ErrorCode.INTERNAL_ERROR,
                message="Internal server error",
            ).model_dump(exclude_none=True),
        )

    app.include_router(health.router)
    app.include_router(generate.router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    from cv_generation.config import get_settings

    settings = get_settings()
    uvicorn.run(
        "cv_generation.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
