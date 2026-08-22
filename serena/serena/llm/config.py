"""Caricamento configurazione LLM da serena/.env (mai committato — verificato nel .gitignore radice
con `git check-ignore`, non assunto). python-dotenv era gia' una dipendenza transitiva reale (mcp,
Fase 6); dichiarata qui esplicitamente perche' ora la usiamo per davvero, non solo di striscio."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_ENV_PATH)

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"


def gemini_api_key() -> Optional[str]:
    return os.environ.get("GEMINI_API_KEY")


def build_default_llm_client():
    """None se nessuna chiave e' configurata — lo stesso limite dichiarato onestamente in ogni fase
    precedente, ma ora con un percorso reale pronto a sostituirlo appena una chiave esiste (Fase 3/5
    lo usano gia' come fallback opzionale)."""
    from serena.llm.gemini_client import GeminiLLMClient

    api_key = gemini_api_key()
    if not api_key:
        return None
    return GeminiLLMClient(api_key=api_key)
