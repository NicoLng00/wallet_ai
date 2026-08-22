"""NullModelBackend — VERIFIED FROM SOURCE (camel-ai==0.2.78, camel/agents/chat_agent.py
`ChatAgent._resolve_models`): passing `model=None` to `SocialAgent` does NOT mean "no model" — it
resolves to `ModelFactory.create(ModelPlatformType.DEFAULT, ModelType.DEFAULT)`, which requires
`OPENAI_API_KEY` and raises `ValueError` immediately at agent-construction time if it's missing.
There is no way to construct a `SocialAgent` at all without SOME `BaseModelBackend` instance, even
if the adapter (this one) never sends an `LLMAction`/`INTERVIEW` and only ever drives agents via
`ManualAction` — confirmed by reading `_resolve_models`: it accepts an already-constructed
`BaseModelBackend` instance as-is, with no key validation, no network call.

This class exists to satisfy that construction requirement honestly: it is a real, functioning
`BaseModelBackend` subclass, never a mock of one, but its `_run`/`_arun` raise loudly instead of
fabricating a response if anything ever calls them — which OasisSimulationAdapter guarantees never
happens, by never sending an `LLMAction` or `ActionType.INTERVIEW` to any agent built with this
backend (verified live: a 3-agent Reddit simulation with only `ManualAction`s runs end-to-end with
zero calls into this class, docs/IMPLEMENTATION_PLAN.md Fase 6)."""
from __future__ import annotations
from typing import Any

from camel.models.base_model import BaseModelBackend
from camel.utils import BaseTokenCounter


class _ZeroTokenCounter(BaseTokenCounter):
    def count_tokens_from_messages(self, messages: list) -> int:
        return 0

    @property
    def token_limit(self) -> int:
        return 0

    def encode(self, text: str) -> list:
        return []

    def decode(self, token_ids: list) -> str:
        return ""


class NullModelBackend(BaseModelBackend):
    def __init__(self):
        super().__init__(model_type="serena-null-stub", model_config_dict={}, token_counter=_ZeroTokenCounter())

    @property
    def token_counter(self) -> BaseTokenCounter:
        return self._token_counter

    def _run(self, messages: Any, *args, **kwargs) -> Any:
        raise RuntimeError(
            "NullModelBackend e' stato invocato per davvero: significa che e' stata inviata una "
            "LLMAction o un'INTERVIEW a un agente costruito senza un vero LLMClient. "
            "OasisSimulationAdapter deve inviare solo ManualAction."
        )

    async def _arun(self, messages: Any, *args, **kwargs) -> Any:
        raise RuntimeError(
            "NullModelBackend e' stato invocato per davvero (path async): significa che e' stata "
            "inviata una LLMAction o un'INTERVIEW a un agente costruito senza un vero LLMClient. "
            "OasisSimulationAdapter deve inviare solo ManualAction."
        )
