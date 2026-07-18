"""Canonical CV Pydantic schema used across drafting, validation, and rendering."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator


class ContactInfo(BaseModel):
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None
    location: str | None = None

    @model_validator(mode="after")
    def require_email_or_phone(self) -> ContactInfo:
        # Soft check here; hard gate is in validation node
        return self


class ExperienceItem(BaseModel):
    company: str
    title: str
    start_date: str | None = None
    end_date: str | None = None
    location: str | None = None
    bullets: list[str] = Field(default_factory=list)

    @field_validator("company", "title")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class EducationItem(BaseModel):
    institution: str
    degree: str | None = None
    field: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    details: list[str] = Field(default_factory=list)

    @field_validator("institution")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped


class ProjectItem(BaseModel):
    name: str
    description: str | None = None
    technologies: list[str] = Field(default_factory=list)
    url: str | None = None
    bullets: list[str] = Field(default_factory=list)


class CanonicalCV(BaseModel):
    """Single-column ATS-safe CV representation. No photos/age/nationality."""

    full_name: str
    contact: ContactInfo = Field(default_factory=ContactInfo)
    professional_summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    output_language: str = Field(
        default="en",
        description="BCP-47-ish language code used for rendering (e.g. en, es, fr).",
    )

    @field_validator("full_name")
    @classmethod
    def _name_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("full_name is required")
        return stripped

    def has_contact_channel(self) -> bool:
        return bool(self.contact.email or self.contact.phone)
