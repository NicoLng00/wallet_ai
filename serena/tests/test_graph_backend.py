"""Suite unica, parametrizzata su ogni GraphBackend disponibile (docs/IMPLEMENTATION_PLAN.md, Fase 4:
"stessa test suite parametrizzata sul backend, per garantire che siano davvero intercambiabili").

KuzuGraphBackend gira sempre (embedded, nessun server richiesto, verificato live in questo ambiente).
Neo4jGraphBackend viene incluso nella stessa parametrizzazione ma i suoi casi sono saltati
automaticamente se SERENA_NEO4J_URI non e' impostata a un server Neo4j raggiungibile — il codice
esiste ed e' scritto secondo lo stesso contratto (vedi neo4j_backend.py), ma non e' mai stato
eseguito con successo in questo ambiente di sviluppo, a differenza di Kuzu."""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone

import pytest

from serena.knowledge.graph.backend import DanglingRelationshipError, ReservedAttributeKeyError
from serena.knowledge.graph.kuzu_backend import KuzuGraphBackend
from serena.models.graph import Entity, EntityType, RelationType, Relationship

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def _make_kuzu_backend():
    return KuzuGraphBackend(":memory:")


def _make_neo4j_backend():
    uri = os.environ.get("SERENA_NEO4J_URI")
    if not uri:
        pytest.skip("SERENA_NEO4J_URI non impostata: nessun server Neo4j raggiungibile in questo ambiente")
    from neo4j.exceptions import ServiceUnavailable

    from serena.knowledge.graph.neo4j_backend import Neo4jGraphBackend

    try:
        return Neo4jGraphBackend(
            uri, os.environ.get("SERENA_NEO4J_USER", "neo4j"), os.environ.get("SERENA_NEO4J_PASSWORD", ""),
        )
    except ServiceUnavailable:
        pytest.skip("Server Neo4j configurato ma non raggiungibile")


BACKEND_FACTORIES = [_make_kuzu_backend, _make_neo4j_backend]


@pytest.fixture(params=BACKEND_FACTORIES, ids=["kuzu", "neo4j"])
def backend(request):
    return request.param()


def make_entity(entity_id: str, entity_type: EntityType = EntityType.ASSET, **attrs) -> Entity:
    return Entity(entity_id=entity_id, entity_type=entity_type, name=entity_id, attributes=attrs)


def make_relationship(source: str, target: str, relation_type: RelationType = RelationType.HOLDS,
                       valid_from: datetime = NOW) -> Relationship:
    return Relationship(source_id=source, target_id=target, relation_type=relation_type, valid_from=valid_from)


def test_health_check_is_true_for_a_freshly_created_backend(backend):
    assert backend.health_check() is True


def test_upserted_entity_is_retrievable_by_type(backend):
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET), make_entity("BINANCE", EntityType.EXCHANGE)])
    assets = backend.query_by_type(EntityType.ASSET)
    assert [e.entity_id for e in assets] == ["BTC"]


def test_upsert_entities_is_idempotent(backend):
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET, note="v1")])
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET, note="v2")])
    assets = backend.query_by_type(EntityType.ASSET)
    assert len(assets) == 1
    assert assets[0].attributes["note"] == "v2"


def test_upsert_relationships_rejects_dangling_source(backend):
    backend.upsert_entities([make_entity("BINANCE", EntityType.EXCHANGE)])
    with pytest.raises(DanglingRelationshipError):
        backend.upsert_relationships([make_relationship("NEVER_UPSERTED", "BINANCE")])


def test_upsert_relationships_rejects_dangling_target(backend):
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET)])
    with pytest.raises(DanglingRelationshipError):
        backend.upsert_relationships([make_relationship("BTC", "NEVER_UPSERTED")])


def test_upsert_entities_rejects_reserved_attribute_key(backend):
    bad_entity = Entity(entity_id="BTC", entity_type=EntityType.ASSET, name="BTC", attributes={"entity_type": "shadowing attempt"})
    with pytest.raises(ReservedAttributeKeyError):
        backend.upsert_entities([bad_entity])


def test_upsert_relationships_rejects_reserved_attribute_key(backend):
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET), make_entity("BINANCE", EntityType.EXCHANGE)])
    bad_relationship = Relationship(
        source_id="BTC", target_id="BINANCE", relation_type=RelationType.LISTS, valid_from=NOW,
        attributes={"source_id": "shadowing attempt"},
    )
    with pytest.raises(ReservedAttributeKeyError):
        backend.upsert_relationships([bad_relationship])


def test_query_neighborhood_returns_only_the_center_when_isolated(backend):
    backend.upsert_entities([make_entity("LONELY", EntityType.ASSET)])
    subgraph = backend.query_neighborhood("LONELY")
    assert [e.entity_id for e in subgraph.entities] == ["LONELY"]
    assert subgraph.relationships == []


def test_query_neighborhood_returns_none_center_for_unknown_entity(backend):
    subgraph = backend.query_neighborhood("DOES_NOT_EXIST")
    assert subgraph.entities == []
    assert subgraph.relationships == []
    assert subgraph.center_entity_id == "DOES_NOT_EXIST"


def test_query_neighborhood_respects_depth_boundary(backend):
    # BTC -> BINANCE -> ENTITY_BLACKROCK, catena di 2 hop
    backend.upsert_entities([
        make_entity("BTC", EntityType.ASSET), make_entity("BINANCE", EntityType.EXCHANGE),
        make_entity("ENTITY_BLACKROCK", EntityType.FINANCIAL_INSTITUTION),
    ])
    backend.upsert_relationships([
        make_relationship("BTC", "BINANCE", RelationType.LISTS),
        make_relationship("BINANCE", "ENTITY_BLACKROCK", RelationType.REPORTS_ON, valid_from=NOW + timedelta(hours=1)),
    ])
    depth_1 = backend.query_neighborhood("BTC", depth=1)
    assert {e.entity_id for e in depth_1.entities} == {"BTC", "BINANCE"}

    depth_2 = backend.query_neighborhood("BTC", depth=2)
    assert {e.entity_id for e in depth_2.entities} == {"BTC", "BINANCE", "ENTITY_BLACKROCK"}
    assert len(depth_2.relationships) == 2


def test_query_neighborhood_traverses_relationships_in_both_directions(backend):
    backend.upsert_entities([make_entity("BTC", EntityType.ASSET), make_entity("WHALE_1", EntityType.WHALE)])
    backend.upsert_relationships([make_relationship("WHALE_1", "BTC", RelationType.HOLDS)])
    subgraph = backend.query_neighborhood("BTC", depth=1)
    assert {e.entity_id for e in subgraph.entities} == {"BTC", "WHALE_1"}
