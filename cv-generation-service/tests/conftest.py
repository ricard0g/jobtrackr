"""Shared pytest fixtures — always use fake provider."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Force fake provider before settings are loaded
os.environ["CV_GENERATION_PROVIDER"] = "fake"
os.environ["CV_GENERATION_SERVICE_TOKEN"] = "test-service-token"
os.environ["CV_GENERATION_MODEL_ID"] = "fake-cv-v1"
os.environ["CV_GENERATION_WORKFLOW_VERSION"] = "cv-graph-v1"

from cv_generation.config import clear_settings_cache  # noqa: E402
from cv_generation.main import create_app  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _reset_settings():
    clear_settings_cache()
    os.environ["CV_GENERATION_PROVIDER"] = "fake"
    os.environ["CV_GENERATION_SERVICE_TOKEN"] = "test-service-token"
    clear_settings_cache()
    yield
    clear_settings_cache()


@pytest.fixture
def auth_header() -> dict[str, str]:
    return {"Authorization": "Bearer test-service-token"}


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


@pytest.fixture
def sample_cv_md() -> bytes:
    return (FIXTURES / "sample_base_cv.md").read_bytes()


@pytest.fixture
def sample_jd() -> str:
    return (
        "Software Engineer\n\n"
        "Requirements:\n"
        "- Experience with Python and FastAPI\n"
        "- Familiarity with PostgreSQL and Docker\n"
        "- Strong collaboration skills\n"
        "- Kubernetes experience preferred\n"
    )
