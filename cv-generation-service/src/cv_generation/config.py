"""Application configuration and documented limits."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["fake", "gemini"]


class Settings(BaseSettings):
    """Runtime settings. Limits are documented here for operators."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Auth
    cv_generation_service_token: str = Field(
        default="dev-service-token",
        alias="CV_GENERATION_SERVICE_TOKEN",
        description="Bearer token expected from the JobTrackr API.",
    )

    # Provider
    cv_generation_provider: ProviderName = Field(
        default="fake",
        alias="CV_GENERATION_PROVIDER",
    )
    google_ai_api_key: str | None = Field(default=None, alias="GOOGLE_AI_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    cv_generation_model_id: str = Field(
        default="gemini-2.0-flash",
        alias="CV_GENERATION_MODEL_ID",
    )
    cv_generation_workflow_version: str = Field(
        default="cv-graph-v1",
        alias="CV_GENERATION_WORKFLOW_VERSION",
    )

    # Soft request timeout (seconds) — soft handling around the graph
    cv_generation_request_timeout_seconds: float = Field(
        default=120.0,
        alias="CV_GENERATION_REQUEST_TIMEOUT_SECONDS",
        ge=5.0,
        le=600.0,
    )

    # Documented limits
    max_base_cv_bytes: int = Field(
        default=10 * 1024 * 1024,
        alias="MAX_BASE_CV_BYTES",
        description="Max uploaded Base CV size (default 10MB).",
    )
    max_job_description_chars: int = Field(
        default=50_000,
        alias="MAX_JOB_DESCRIPTION_CHARS",
    )
    max_additional_info_chars: int = Field(
        default=5_000,
        alias="MAX_ADDITIONAL_INFO_CHARS",
    )
    max_extracted_text_chars: int = Field(
        default=100_000,
        alias="MAX_EXTRACTED_TEXT_CHARS",
    )

    # Revision budget (AI revisions after initial draft)
    max_ai_revisions: int = Field(default=2, alias="MAX_AI_REVISIONS", ge=0, le=5)

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8081, alias="PORT")

    @field_validator("cv_generation_provider", mode="before")
    @classmethod
    def _normalize_provider(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @property
    def resolved_gemini_api_key(self) -> str | None:
        return self.google_ai_api_key or self.gemini_api_key

    @property
    def is_fake(self) -> bool:
        return self.cv_generation_provider == "fake"

    def readiness_ok(self) -> tuple[bool, str]:
        """Return (ready, reason). Fake mode is always ready."""
        if self.is_fake:
            return True, "fake provider"
        if not self.cv_generation_service_token:
            return False, "CV_GENERATION_SERVICE_TOKEN missing"
        if not self.resolved_gemini_api_key:
            return False, "GOOGLE_AI_API_KEY / GEMINI_API_KEY missing"
        return True, "ok"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
