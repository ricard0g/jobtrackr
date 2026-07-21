"""Provider factory."""

from __future__ import annotations

from cv_generation.config import Settings
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.providers.base import DraftingProvider
from cv_generation.providers.fake import FakeProvider


def build_provider(settings: Settings) -> DraftingProvider:
    if settings.is_fake:
        if not settings.cv_generation_allow_fake_provider:
            raise ServiceError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "Fake CV generation is test-only; configure a real drafting provider",
            )
        return FakeProvider(model_id="fake-cv-v1")

    from cv_generation.providers.gemini import GeminiProvider

    return GeminiProvider(
        api_key=settings.resolved_gemini_api_key or "",
        model_id=settings.cv_generation_model_id,
    )
