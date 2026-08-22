"""Nessuna chiamata live in questa suite (stessa disciplina di ogni adapter esterno nel progetto,
Fase 3): il fetch e' iniettato con una risposta finta che riproduce ESATTAMENTE la forma reale
verificata dal vivo con una chiave Gemini reale (vedi commit di riferimento per la verifica live)."""
from __future__ import annotations
import json

import pytest

from serena.llm.client import LLMQuotaExceededError, LLMUnavailableError
from serena.llm.gemini_client import GeminiLLMClient
from serena.simulation.events.engine import EventInterpretation

REAL_QUOTA_EXHAUSTED_BODY = json.dumps({
    "error": {
        "code": 429,
        "message": "You exceeded your current quota, please check your plan and billing details.",
        "status": "RESOURCE_EXHAUSTED",
        "details": [{
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            "violations": [{
                "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                "quotaDimensions": {"location": "global", "model": "gemini-3.5-flash"},
                "quotaValue": "20",
            }],
        }],
    },
})


def real_shaped_response(payload: dict) -> str:
    """Riproduce la forma esatta di una risposta reale di generateContent (verificata dal vivo)."""
    return json.dumps({
        "candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}, "finishReason": "STOP"}],
        "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 12, "totalTokenCount": 20},
        "modelVersion": "gemini-3.5-flash",
    })


def test_rejects_empty_api_key():
    with pytest.raises(ValueError):
        GeminiLLMClient(api_key="")


@pytest.mark.asyncio
async def test_complete_json_returns_a_validated_schema_instance():
    async def fake_fetch(model, api_key, body):
        return real_shaped_response({"direction": "bullish", "importance": 0.8, "confidence": 0.9})

    client = GeminiLLMClient(api_key="fake-key", fetch=fake_fetch)
    result = await client.complete_json("some prompt", EventInterpretation, tier="fast", temperature=0.0)
    assert result == EventInterpretation(direction="bullish", importance=0.8, confidence=0.9)


@pytest.mark.asyncio
async def test_complete_json_sends_the_model_api_key_and_temperature():
    captured = {}

    async def fake_fetch(model, api_key, body):
        captured["model"] = model
        captured["api_key"] = api_key
        captured["body"] = body
        return real_shaped_response({"direction": "neutral", "importance": 0.1, "confidence": 0.2})

    client = GeminiLLMClient(api_key="fake-key", model="gemini-3.5-flash", fetch=fake_fetch)
    await client.complete_json("prompt text", EventInterpretation, tier="opus", temperature=0.3)

    assert captured["model"] == "gemini-3.5-flash"
    assert captured["api_key"] == "fake-key"
    assert captured["body"]["generationConfig"]["temperature"] == 0.3
    assert captured["body"]["generationConfig"]["responseMimeType"] == "application/json"
    assert captured["body"]["contents"][0]["parts"][0]["text"] == "prompt text"


@pytest.mark.asyncio
async def test_fetch_raising_llm_unavailable_propagates():
    async def failing_fetch(model, api_key, body):
        raise LLMUnavailableError("simulated 429")

    client = GeminiLLMClient(api_key="fake-key", fetch=failing_fetch)
    with pytest.raises(LLMUnavailableError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_malformed_candidate_shape_raises_llm_unavailable():
    async def fake_fetch(model, api_key, body):
        return json.dumps({"candidates": []})  # nessun candidato: forma reale in caso di blocco safety

    client = GeminiLLMClient(api_key="fake-key", fetch=fake_fetch)
    with pytest.raises(LLMUnavailableError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_non_json_response_body_raises_llm_unavailable():
    async def fake_fetch(model, api_key, body):
        return "not json at all"

    client = GeminiLLMClient(api_key="fake-key", fetch=fake_fetch)
    with pytest.raises(LLMUnavailableError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_content_text_not_matching_schema_raises_llm_unavailable():
    async def fake_fetch(model, api_key, body):
        return real_shaped_response({"direction": "sideways", "importance": 0.5, "confidence": 0.5})  # valore enum invalido

    client = GeminiLLMClient(api_key="fake-key", fetch=fake_fetch)
    with pytest.raises(LLMUnavailableError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_429_from_default_fetch_raises_llm_unavailable_without_a_real_call(monkeypatch):
    """Verifica il comportamento del fetch di default (non iniettato) senza fare una vera richiesta
    di rete: sostituisce httpx.AsyncClient.post con una risposta finta a livello di libreria HTTP."""
    import httpx

    class _FakeResponse:
        status_code = 429
        text = "quota exceeded"

    class _FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return _FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _FakeAsyncClient())

    client = GeminiLLMClient(api_key="fake-key")
    with pytest.raises(LLMUnavailableError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_real_quota_exhausted_body_raises_the_specific_quota_error(monkeypatch):
    """Il corpo qui e' quello VERO catturato dal vivo (Fase 5) quando la chiave ha esaurito la
    quota giornaliera gratuita di gemini-3.5-flash (20 richieste/giorno) — non una forma inventata."""
    import httpx

    class _FakeResponse:
        status_code = 429
        text = REAL_QUOTA_EXHAUSTED_BODY

    class _FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return _FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _FakeAsyncClient())

    client = GeminiLLMClient(api_key="fake-key")
    with pytest.raises(LLMQuotaExceededError):
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)


@pytest.mark.asyncio
async def test_generic_429_without_resource_exhausted_status_is_not_treated_as_quota_error(monkeypatch):
    import httpx

    class _FakeResponse:
        status_code = 429
        text = json.dumps({"error": {"code": 429, "status": "UNAVAILABLE", "message": "transient"}})

    class _FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return _FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: _FakeAsyncClient())

    client = GeminiLLMClient(api_key="fake-key")
    with pytest.raises(LLMUnavailableError) as exc_info:
        await client.complete_json("prompt", EventInterpretation, tier="fast", temperature=0.0)
    assert not isinstance(exc_info.value, LLMQuotaExceededError)
