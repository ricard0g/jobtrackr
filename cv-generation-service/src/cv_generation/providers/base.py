"""LLM / drafting provider abstractions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from cv_generation.models.canonical_cv import CanonicalCV


class DraftingProvider(ABC):
    """Produces or revises a CanonicalCV from evidence + JD targeting hints."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        ...

    @abstractmethod
    def draft(
        self,
        *,
        evidence: dict[str, Any],
        jd_analysis: dict[str, Any],
        output_language: str,
    ) -> CanonicalCV:
        ...

    @abstractmethod
    def revise(
        self,
        *,
        current: CanonicalCV,
        evidence: dict[str, Any],
        jd_analysis: dict[str, Any],
        validation_issues: list[str],
        output_language: str,
    ) -> CanonicalCV:
        ...
