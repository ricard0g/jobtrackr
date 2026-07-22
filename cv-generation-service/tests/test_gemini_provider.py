"""Gemini provider configuration tests without external API calls."""

from __future__ import annotations

import json
from types import SimpleNamespace

from google import genai

from cv_generation.providers.gemini import GeminiProvider


class _RecordingModels:
    def __init__(self, response_payload: dict) -> None:
        self.response_payload = response_payload
        self.calls: list[dict] = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            text=json.dumps(self.response_payload),
            usage_metadata=None,
        )


def _install_recording_client(monkeypatch, response_payload: dict) -> _RecordingModels:
    models = _RecordingModels(response_payload)
    monkeypatch.setattr(
        genai,
        "Client",
        lambda *, api_key: SimpleNamespace(models=models),
    )
    return models


def test_evidence_interpretation_uses_minimal_thinking_and_bounded_output(monkeypatch):
    models = _install_recording_client(
        monkeypatch,
        {
            "full_name": "Ada Lovelace",
            "contact": {"email": "ada@example.com"},
            "experience": [
                {
                    "company": "Analytical Engines",
                    "title": "Software Engineer",
                    "bullets": ["Built calculation engines"],
                }
            ],
        },
    )
    provider = GeminiProvider(api_key="test-key", model_id="gemini-3.1-flash-lite")

    evidence = provider.interpret_base_cv(
        extracted_text="Ada Lovelace worked at Analytical Engines.",
        deterministic_hints={},
        additional_information="Also led Project Delta, a billing dashboard.",
    )

    contents = models.calls[0]["contents"]
    prompt = json.loads(contents.split("\n", 1)[1])
    config = models.calls[0]["config"]
    assert evidence.experience[0].company == "Analytical Engines"
    assert prompt["additional_information"] == "Also led Project Delta, a billing dashboard."
    assert any("additional_information as authoritative" in rule for rule in prompt["rules"])
    assert config.thinking_config.thinking_level.value == "MINIMAL"
    assert config.max_output_tokens == 8_192
    assert config.automatic_function_calling.disable is True


def test_drafting_uses_low_thinking(monkeypatch):
    models = _install_recording_client(
        monkeypatch,
        {
            "full_name": "Ada Lovelace",
            "contact": {"email": "ada@example.com"},
            "experience": [
                {
                    "company": "Analytical Engines",
                    "title": "Software Engineer",
                    "bullets": ["Built calculation engines"],
                }
            ],
            "output_language": "en",
        },
    )
    provider = GeminiProvider(api_key="test-key", model_id="gemini-3.1-flash-lite")

    provider.draft(
        evidence={"raw_text": "Ada Lovelace worked at Analytical Engines."},
        jd_analysis={"keywords": ["engineering"]},
        output_language="en",
    )

    config = models.calls[0]["config"]
    assert config.thinking_config.thinking_level.value == "LOW"
