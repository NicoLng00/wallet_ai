"""Conversione verificata contro forme di schema REALI dei nostri modelli LLM-facing (non forme
inventate) — vedi il commento dello schema di EventInterpretation nel modulo per la forma esatta che
Pydantic produce davvero."""
from __future__ import annotations
from typing import Optional

import pytest
from pydantic import BaseModel, ConfigDict

from serena.agents.profiles.generator import AgentProfileBatch
from serena.llm.schema_conversion import UnsupportedSchemaError, pydantic_schema_to_gemini_schema
from serena.models.agent import AgentProfile
from serena.simulation.events.engine import EventInterpretation


def test_flat_model_with_enum_and_numbers_converts_correctly():
    """Forma reale di EventInterpretation.model_json_schema(): direction e' un enum di stringhe,
    importance/confidence sono number — verificato che la conversione preservi esattamente questo."""
    schema = pydantic_schema_to_gemini_schema(EventInterpretation)
    assert schema["type"] == "OBJECT"
    assert schema["properties"]["direction"]["type"] == "STRING"
    assert schema["properties"]["direction"]["enum"] == ["bullish", "bearish", "neutral"]
    assert schema["properties"]["importance"]["type"] == "NUMBER"
    assert set(schema["required"]) == {"direction", "importance", "confidence"}
    # parole chiave non documentate da Gemini (title, minimum, maximum) non devono comparire
    assert "title" not in schema
    assert "minimum" not in schema["properties"]["importance"]


class _Inner(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: float


class _Outer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inner: _Inner
    items: list[str]
    maybe: Optional[str] = None


def test_nested_ref_is_fully_inlined_not_left_as_ref():
    schema = pydantic_schema_to_gemini_schema(_Outer)
    assert "$ref" not in str(schema)
    assert schema["properties"]["inner"]["type"] == "OBJECT"
    assert schema["properties"]["inner"]["properties"]["value"]["type"] == "NUMBER"


def test_list_field_becomes_array_of_items():
    schema = pydantic_schema_to_gemini_schema(_Outer)
    assert schema["properties"]["items"]["type"] == "ARRAY"
    assert schema["properties"]["items"]["items"]["type"] == "STRING"


def test_optional_field_becomes_nullable():
    schema = pydantic_schema_to_gemini_schema(_Outer)
    assert schema["properties"]["maybe"].get("nullable") is True
    assert schema["properties"]["maybe"]["type"] == "STRING"


def test_open_dict_field_raises_unsupported_schema_error():
    """Trovato dal vivo (non ipotetico): AgentProfile.beliefs e' un dict[str, float] a proprieta'
    libere — il dialetto di schema documentato da Gemini non supporta mappe aperte. Meglio fallire
    subito con un errore chiaro che scoprirlo con una risposta http inattesa a runtime."""
    with pytest.raises(UnsupportedSchemaError):
        pydantic_schema_to_gemini_schema(AgentProfile)


def test_agent_profile_batch_also_raises_because_it_nests_agent_profile():
    with pytest.raises(UnsupportedSchemaError):
        pydantic_schema_to_gemini_schema(AgentProfileBatch)
