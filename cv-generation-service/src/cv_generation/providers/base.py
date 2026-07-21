"""LLM / drafting provider abstractions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from cv_generation.models.canonical_cv import CanonicalCV
from cv_generation.models.candidate_evidence import CandidateEvidence


class DraftingProvider(ABC):
    """Produces or revises a CanonicalCV from evidence + JD targeting hints."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        ...

    @abstractmethod
    def interpret_base_cv(
        self,
        *,
        extracted_text: str,
        deterministic_hints: dict[str, Any],
    ) -> CandidateEvidence:
        """Interpret extracted Base CV text into structured candidate evidence."""
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
