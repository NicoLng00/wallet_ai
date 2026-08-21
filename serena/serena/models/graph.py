"""Ontologia fissa del grafo di conoscenza (docs/TRADING_ARCHITECTURE.md §3.2) — a differenza di
MiroFish, che fa inventare l'intera ontologia a un LLM ad ogni run (ontology_generator.py, vedi
docs/MIROFISH_REVERSE_ENGINEERING.md §A.2), qui i tipi sono fissi e validati da Pydantic: un dominio
finanziario ha categorie note e stabili, non serve ri-derivarle ogni volta."""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

AttributeValue = Union[str, float, int, bool]


class EntityType(str, Enum):
    ASSET = "Asset"
    COMPANY = "Company"
    FINANCIAL_INSTITUTION = "FinancialInstitution"
    TRADER = "Trader"
    MARKET_MAKER = "MarketMaker"
    WHALE = "Whale"
    EXCHANGE = "Exchange"
    ETF = "ETF"
    PROTOCOL = "Protocol"
    GOVERNMENT = "Government"
    CENTRAL_BANK = "CentralBank"
    ECONOMIC_INDICATOR = "EconomicIndicator"
    NEWS_SOURCE = "NewsSource"
    ANALYST = "Analyst"
    INFLUENCER = "Influencer"
    EVENT = "Event"


class RelationType(str, Enum):
    HOLDS = "HOLDS"
    BUYS = "BUYS"
    SELLS = "SELLS"
    LONGS = "LONGS"
    SHORTS = "SHORTS"
    INFLUENCES = "INFLUENCES"
    REPORTS_ON = "REPORTS_ON"
    AFFECTS = "AFFECTS"
    ANNOUNCES = "ANNOUNCES"
    LISTS = "LISTS"
    FLOWS_INTO = "FLOWS_INTO"
    FLOWS_OUT_OF = "FLOWS_OUT_OF"
    CORRELATES_WITH = "CORRELATES_WITH"


class Entity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: str = Field(min_length=1)
    entity_type: EntityType
    name: str = Field(min_length=1)
    attributes: dict[str, AttributeValue] = Field(default_factory=dict)


class Relationship(BaseModel):
    """valid_from/valid_until: un fatto nel grafo ha una finestra di validita' temporale, mai
    permanente per costruzione — coerente con la disciplina di non-look-ahead del resto del sistema
    (un fatto vero oggi non deve inquinare una query fatta su un timestamp passato)."""
    model_config = ConfigDict(extra="forbid")

    source_id: str = Field(min_length=1)
    target_id: str = Field(min_length=1)
    relation_type: RelationType
    attributes: dict[str, AttributeValue] = Field(default_factory=dict)
    valid_from: datetime
    valid_until: Optional[datetime] = None

    @model_validator(mode="after")
    def _valid_until_after_from(self) -> "Relationship":
        if self.valid_until is not None and self.valid_until <= self.valid_from:
            raise ValueError("valid_until deve essere successivo a valid_from")
        return self


# Guardrail espliciti per una eventuale proposta di estensione dell'ontologia (docs/
# TRADING_ARCHITECTURE.md §3.2): stessa disciplina di MiroFish (tetto massimo, niente duplicati),
# ma qui applicata a un PROPOSAL che richiede approvazione, mai scritta direttamente nello schema.
MAX_ONTOLOGY_ENTITY_TYPES = 24
MAX_ONTOLOGY_RELATION_TYPES = 24


class OntologyChangeProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proposed_by: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    new_entity_types: list[str] = Field(default_factory=list)
    new_relation_types: list[str] = Field(default_factory=list)
    created_at: datetime

    @model_validator(mode="after")
    def _validate_proposal(self) -> "OntologyChangeProposal":
        existing_entities = {member.value for member in EntityType}
        existing_relations = {member.value for member in RelationType}

        if len(set(self.new_entity_types)) != len(self.new_entity_types):
            raise ValueError("new_entity_types contiene duplicati")
        if len(set(self.new_relation_types)) != len(self.new_relation_types):
            raise ValueError("new_relation_types contiene duplicati")

        overlap_entities = existing_entities & set(self.new_entity_types)
        if overlap_entities:
            raise ValueError(f"tipi di entita' gia' esistenti, non nuovi: {overlap_entities}")
        overlap_relations = existing_relations & set(self.new_relation_types)
        if overlap_relations:
            raise ValueError(f"tipi di relazione gia' esistenti, non nuovi: {overlap_relations}")

        if len(existing_entities) + len(self.new_entity_types) > MAX_ONTOLOGY_ENTITY_TYPES:
            raise ValueError(f"supererebbe il tetto massimo di {MAX_ONTOLOGY_ENTITY_TYPES} tipi di entita'")
        if len(existing_relations) + len(self.new_relation_types) > MAX_ONTOLOGY_RELATION_TYPES:
            raise ValueError(f"supererebbe il tetto massimo di {MAX_ONTOLOGY_RELATION_TYPES} tipi di relazione")
        return self
