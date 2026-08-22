from serena.llm.config import build_default_llm_client, gemini_api_key
from serena.llm.gemini_client import GeminiLLMClient


def test_gemini_api_key_reads_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-value")
    assert gemini_api_key() == "test-value"


def test_gemini_api_key_is_none_when_unset(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert gemini_api_key() is None


def test_build_default_llm_client_returns_none_without_a_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert build_default_llm_client() is None


def test_build_default_llm_client_returns_a_real_gemini_client_when_key_present(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-value")
    client = build_default_llm_client()
    assert isinstance(client, GeminiLLMClient)
