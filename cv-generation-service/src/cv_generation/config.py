"""Application configuration and documented limits."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["fake", "gemini"]
ProfileName = Literal["local", "test", "production"]
_PERMISSIVE_PROFILES = frozenset({"local", "test"})
_DEV_DEFAULT_SERVICE_TOKEN = "dev-service-token"


class Settings(BaseSettings):
    """Runtime settings. Limits are documented here for operators."""

    model_config = SettingsConfigDict(
        extra="ignore",
    )

    # Auth
    cv_generation_service_token: str = Field(
        default="dev-service-token",
        alias="CV_GENERATION_SERVICE_TOKEN",
        description="Bearer token expected from the JobTrackr API.",
    )
    cv_generation_profile: ProfileName = Field(
        default="local",
        alias="CV_GENERATION_PROFILE",
        description="local/test allow the documented default token; production does not.",
    )

    # Provider
    cv_generation_provider: ProviderName = Field(
        default="gemini",
        alias="CV_GENERATION_PROVIDER",
    )
    cv_generation_allow_fake_provider: bool = Field(
        default=False,
        alias="CV_GENERATION_ALLOW_FAKE_PROVIDER",
        description="Test-only escape hatch; must remain false in user-facing environments.",
    )
    google_ai_api_key: str | None = Field(default=None, alias="GOOGLE_AI_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    cv_generation_model_id: str = Field(
        default="gemini-3.1-flash-lite",
        alias="CV_GENERATION_MODEL_ID",
    )
    cv_generation_workflow_version: str = Field(
        default="cv-graph-v2",
        alias="CV_GENERATION_WORKFLOW_VERSION",
    )

    # Hard request deadline (seconds). Cancel event stops work between graph stages.
    cv_generation_request_timeout_seconds: float = Field(
        default=300.0,
        alias="CV_GENERATION_REQUEST_TIMEOUT_SECONDS",
        ge=5.0,
        le=600.0,
        description="Five-minute default hard deadline per generation attempt.",
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

    @field_validator("cv_generation_provider", "cv_generation_profile", mode="before")
    @classmethod
    def _normalize_lower(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @property
    def resolved_gemini_api_key(self) -> str | None:
        key = self.google_ai_api_key or self.gemini_api_key
        if key is None:
            return None
        stripped = key.strip()
        return stripped or None

    @property
    def is_fake(self) -> bool:
        return self.cv_generation_provider == "fake"

    @property
    def is_local_or_test(self) -> bool:
        return self.cv_generation_profile in _PERMISSIVE_PROFILES

    def readiness_ok(self) -> tuple[bool, str]:
        """Return whether this process can perform user-facing generation."""
        if self.is_fake:
            if self.cv_generation_allow_fake_provider and self.is_local_or_test:
                return True, "fake provider explicitly enabled for tests"
            return False, "fake provider is test-only"
        token = self.cv_generation_service_token.strip()
        if not self.is_local_or_test and (
            not token or token == _DEV_DEFAULT_SERVICE_TOKEN
        ):
            return (
                False,
                "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles",
            )
        if not token:
            return False, "CV_GENERATION_SERVICE_TOKEN missing"
        if not self.resolved_gemini_api_key:
            return False, "GOOGLE_AI_API_KEY / GEMINI_API_KEY missing"
        return True, "ok"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
