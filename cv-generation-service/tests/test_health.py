"""Health endpoint tests."""

from __future__ import annotations

from cv_generation.config import clear_settings_cache


def _reload_settings(monkeypatch, **env: str | None) -> None:
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    clear_settings_cache()


def test_live(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_fake_provider(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["provider"] == "fake"


def test_fake_provider_is_not_ready_without_test_override(client, monkeypatch):
    _reload_settings(monkeypatch, CV_GENERATION_ALLOW_FAKE_PROVIDER="false")

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "fake provider is test-only",
    }


def test_fake_provider_is_not_ready_in_production_even_when_allowed(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="fake",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="true",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="production-service-token",
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "fake provider is test-only",
    }


def test_ready_rejects_missing_gemini_key_for_real_provider(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="production-service-token",
        GOOGLE_AI_API_KEY=None,
        GEMINI_API_KEY=None,
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "GOOGLE_AI_API_KEY / GEMINI_API_KEY missing",
    }


def test_ready_rejects_blank_gemini_key_for_real_provider(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="production-service-token",
        GOOGLE_AI_API_KEY="   ",
        GEMINI_API_KEY=None,
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "GOOGLE_AI_API_KEY / GEMINI_API_KEY missing",
    }


def test_ready_rejects_default_service_token_outside_local_and_test(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="dev-service-token",
        GOOGLE_AI_API_KEY="placeholder-gemini-key",
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles",
    }


def test_ready_rejects_blank_service_token_outside_local_and_test(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="   ",
        GOOGLE_AI_API_KEY="placeholder-gemini-key",
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "CV_GENERATION_SERVICE_TOKEN must be set to a non-default value outside local/test profiles",
    }


def test_ready_accepts_valid_production_provider_configuration(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="production-service-token",
        GOOGLE_AI_API_KEY="placeholder-gemini-key",
    )

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "provider": "gemini",
        "reason": "ok",
    }


def test_ready_allows_default_token_in_local_profile(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER="gemini",
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="local",
        CV_GENERATION_SERVICE_TOKEN="dev-service-token",
        GOOGLE_AI_API_KEY="placeholder-gemini-key",
    )

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["provider"] == "gemini"


def test_ready_defaults_to_gemini_when_provider_is_unset(client, monkeypatch):
    _reload_settings(
        monkeypatch,
        CV_GENERATION_PROVIDER=None,
        CV_GENERATION_ALLOW_FAKE_PROVIDER="false",
        CV_GENERATION_PROFILE="production",
        CV_GENERATION_SERVICE_TOKEN="production-service-token",
        GOOGLE_AI_API_KEY="placeholder-gemini-key",
    )

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["provider"] == "gemini"
