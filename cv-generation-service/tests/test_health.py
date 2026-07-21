"""Health endpoint tests."""

from __future__ import annotations


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
    from cv_generation.config import clear_settings_cache

    monkeypatch.setenv("CV_GENERATION_ALLOW_FAKE_PROVIDER", "false")
    clear_settings_cache()

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "reason": "fake provider is test-only",
    }
