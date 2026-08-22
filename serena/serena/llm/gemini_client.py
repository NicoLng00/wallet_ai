"""GeminiLLMClient — implementazione REALE di LLMClient (docs/TRADING_ARCHITECTURE.md §7), non solo
un client finto per i test. VERIFICATO dal vivo con una chiave reale prima di scrivere questa classe
(non assunto): l'endpoint pubblico `generateContent` con `responseMimeType: application/json` +
`responseSchema` risponde con JSON strutturato valido a temperature=0.0 — stesso endpoint e stesso
pattern gia' verificato funzionante nel progetto Node esistente (server/providers/gemini.js).

VERIFICATO DAL VIVO (Fase 5, ricostruzione con Gemini): il piano gratuito ha una quota di 20
richieste/giorno per progetto/modello (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, dal corpo
reale di una risposta 429 `RESOURCE_EXHAUSTED`) — un limite giornaliero, non un limite a raffica.
`_default_fetch` distingue questo caso specifico (`LLMQuotaExceededError`) da un 429 generico o da un
errore transitorio (`LLMUnavailableError`), cosi' i chiamanti (LLMBackedEventInterpreter,
LLMBackedPersonaGenerator) possono NON ritentare quando ritentare e' garantito fallire di nuovo e
sprecare un'altra chiamata contro la stessa quota esaurita — un retry ha senso solo per un errore
genuinamente transitorio (5xx, JSON malformato), mai per una quota esaurita per la giornata."""
from __future__ import annotations
import json
from typing import Awaitable, Callable, Optional, TypeVar

from pydantic import BaseModel, ValidationError

from serena.llm.client import LLMQuotaExceededError, LLMTier, LLMUnavailableError
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
        if _is_quota_exhausted(response.text):
            raise LLMQuotaExceededError(f"Quota Gemini esaurita per oggi: {response.text[:300]}")
        raise LLMUnavailableError(f"Limite di richieste Gemini raggiunto: {response.text[:300]}")
    if response.status_code != 200:
        raise LLMUnavailableError(f"Errore Gemini (http {response.status_code}): {response.text[:300]}")
    return response.text


def _is_quota_exhausted(response_text: str) -> bool:
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError:
        return False
    status = payload.get("error", {}).get("status")
    return status == "RESOURCE_EXHAUSTED"


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
