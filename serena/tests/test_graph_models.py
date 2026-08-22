from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from serena.models.graph import Entity, EntityType, OntologyChangeProposal, RelationEndpoints, RelationType, Relationship, Subgraph

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def make_proposal(**overrides):
    defaults = dict(proposed_by="research_agent", reason="nuovo strumento derivato osservato in produzione", created_at=NOW)
    defaults.update(overrides)
    return OntologyChangeProposal(**defaults)


# --- guardrail gia' esistenti dalla Fase 2, riverificati dopo l'estensione della Fase 4 -----------

def test_proposal_accepts_valid_new_types():
    proposal = make_proposal(new_entity_types=["Derivative"], new_relation_types=["HEDGES"])
    assert proposal.new_entity_types == ["Derivative"]


def test_proposal_rejects_duplicate_new_entity_types():
    with pytest.raises(ValidationError):
        make_proposal(new_entity_types=["Derivative", "Derivative"])


def test_proposal_rejects_type_that_already_exists():
    with pytest.raises(ValidationError):
        make_proposal(new_entity_types=[EntityType.ASSET.value])


def test_proposal_rejects_exceeding_the_entity_type_cap():
    too_many = [f"NewType{i}" for i in range(30)]
    with pytest.raises(ValidationError):
        make_proposal(new_entity_types=too_many)


# --- nuovo: dangling edge (Fase 4) --------------------------------------------------------------

def test_proposal_accepts_endpoints_referencing_only_existing_entity_types():
    proposal = make_proposal(
        new_relation_types=["HEDGES"],
        relation_type_endpoints={"HEDGES": RelationEndpoints(
            source_entity_types=[EntityType.TRADER.value], target_entity_types=[EntityType.ASSET.value],
        )},
    )
    assert "HEDGES" in proposal.relation_type_endpoints


def test_proposal_accepts_endpoints_referencing_a_newly_proposed_entity_type_in_the_same_request():
    proposal = make_proposal(
        new_entity_types=["Derivative"], new_relation_types=["HEDGES"],
        relation_type_endpoints={"HEDGES": RelationEndpoints(
            source_entity_types=[EntityType.TRADER.value], target_entity_types=["Derivative"],
        )},
    )
    assert proposal.relation_type_endpoints["HEDGES"].target_entity_types == ["Derivative"]


def test_proposal_rejects_dangling_edge_to_undefined_entity_type():
    with pytest.raises(ValidationError, match="edge pendente"):
        make_proposal(
            new_relation_types=["HEDGES"],
            relation_type_endpoints={"HEDGES": RelationEndpoints(
                source_entity_types=[EntityType.TRADER.value], target_entity_types=["NeverDefinedType"],
            )},
        )


def test_proposal_rejects_endpoints_for_a_relation_type_not_in_this_proposal():
    with pytest.raises(ValidationError, match="edge pendente"):
        make_proposal(
            relation_type_endpoints={"NEVER_PROPOSED": RelationEndpoints(
                source_entity_types=[EntityType.TRADER.value], target_entity_types=[EntityType.ASSET.value],
            )},
        )


# --- Subgraph --------------------------------------------------------------------------------------

def test_subgraph_round_trips_through_json():
    subgraph = Subgraph(
        center_entity_id="BTC",
        entities=[Entity(entity_id="BTC", entity_type=EntityType.ASSET, name="Bitcoin")],
        relationships=[Relationship(source_id="BTC", target_id="BINANCE", relation_type=RelationType.LISTS, valid_from=NOW)],
    )
    reloaded = Subgraph.model_validate(subgraph.model_dump(mode="json"))
    assert reloaded == subgraph


def test_subgraph_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        Subgraph(center_entity_id="BTC", unexpected_field=True)
