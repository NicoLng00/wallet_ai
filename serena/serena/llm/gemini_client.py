"""GeminiLLMClient — implementazione REALE di LLMClient (docs/TRADING_ARCHITECTURE.md §7), non solo
un client finto per i test. VERIFICATO dal vivo con una chiave reale prima di scrivere questa classe
(non assunto): l'endpoint pubblico `generateContent` con `responseMimeType: application/json` +
`responseSchema` risponde con JSON strutturato valido a temperature=0.0 — stesso endpoint e stesso
pattern gia' verificato funzionante nel progetto Node esistente (server/providers/gemini.js).

Il retry a temperatura ridotta e' gia' responsabilita' del chiamante (LLMBackedEventInterpreter,
LLMBackedProfileBatchGenerator — Fase 3/5): questa classe fa un solo tentativo per chiamata e alza
LLMUnavailableError su qualunque errore (rete, quota, risposta malformata), mai un fallback silenzioso
o un valore inventato al posto di una risposta reale."""
from __future__ import annotations
import json
from typing import Awaitable, Callable, Optional, TypeVar

from pydantic import BaseModel, ValidationError

from serena.llm.client import LLMTier, LLMUnavailableError
from serena.llm.schema_conversion import pydantic_schema_to_gemini_schema

SchemaT = TypeVar("SchemaT", bound=BaseModel)

DEFAULT_MODEL = "gemini-3.5-flash"
GeminiFetch = Callable[[str, str, dict], Awaitable[str]]


async def _default_fetch(model: str, api_key: str, body: dict) -> str:
    import httpx

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=body, headers={"x-goog-api-key": api_key})
    if response.status_code == 429:
        raise LLMUnavailableError("Limite di richieste Gemini raggiunto")
    if response.status_code != 200:
        raise LLMUnavailableError(f"Errore Gemini (http {response.status_code}): {response.text[:300]}")
    return response.text


class GeminiLLMClient:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, fetch: Optional[GeminiFetch] = None):
        if not api_key:
            raise ValueError("api_key non puo' essere vuota")
        self._api_key = api_key
        self._model = model
        self._fetch = fetch or _default_fetch

    @property
    def model(self) -> str:
        return self._model

    async def complete_json(self, prompt: str, schema: type[SchemaT], *, tier: LLMTier,
                             temperature: float, seed: Optional[int] = None) -> SchemaT:
        gemini_schema = pydantic_schema_to_gemini_schema(schema)
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": gemini_schema,
                "temperature": temperature,
            },
        }
        raw_text = await self._fetch(self._model, self._api_key, body)
        try:
            data = json.loads(raw_text)
            content_text = data["candidates"][0]["content"]["parts"][0]["text"]
            return schema.model_validate_json(content_text)
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMUnavailableError(f"Risposta Gemini in un formato inatteso: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise LLMUnavailableError(f"Risposta Gemini non e' JSON valido: {exc}") from exc
        except ValidationError as exc:
            raise LLMUnavailableError(f"Risposta Gemini non conforme allo schema richiesto: {exc}") from exc
