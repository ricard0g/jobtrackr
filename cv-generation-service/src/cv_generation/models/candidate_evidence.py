"""Structured candidate facts interpreted from a Base CV."""

from __future__ import annotations

from pydantic import BaseModel, Field

from cv_generation.models.canonical_cv import (
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
)


class CandidateEvidence(BaseModel):
    """Candidate-provided facts available for truthful CV drafting."""

    full_name: str | None = Field(
        default=None,
        description="Candidate's full name exactly as supported by the source text.",
    )
    contact: ContactInfo = Field(default_factory=ContactInfo)
    professional_summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    spoken_languages: list[str] = Field(default_factory=list)

