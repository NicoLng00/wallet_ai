"""Neo4jGraphBackend — implementazione alternativa (docs/TRADING_ARCHITECTURE.md §3.1), per chi ha
gia' un'istanza Neo4j e vuole ispezionare il grafo con il tooling Neo4j esistente. Stesso schema
logico di KuzuGraphBackend (nodo Entity, un'unica relazione generica RELATES con relation_type come
proprieta', per lo stesso motivo dichiarato li': 13 tipi Cypher nativi identici differenziati solo
dal nome sarebbero pura duplicazione con RelationType gia' disponibile via WHERE/property match).

LIMITE DICHIARATO: questa classe e' implementata con query Cypher reali (driver ufficiale `neo4j`,
opzionale — `pip install "serena[neo4j]"`), ma non e' mai stata eseguita contro un vero server Neo4j
in questo ambiente di sviluppo (nessuna istanza disponibile localmente, e installarne una andrebbe
oltre lo scope di questa fase senza chiederlo esplicitamente). tests/test_graph_backend.py include
questa classe nella stessa suite parametrizzata di KuzuGraphBackend, ma i suoi casi vengono saltati
automaticamente (pytest.skip) se la variabile d'ambiente SERENA_NEO4J_URI non punta a un server
raggiungibile — quindi il codice esiste ed e' scritto secondo lo stesso contratto, ma NON e' provato
con esecuzione reale al pari di KuzuGraphBackend, a differenza della disciplina "mai codice non
testato" seguita ovunque altro in questo progetto. Verificare dal vivo appena un server e' disponibile."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Optional

from serena.knowledge.graph.backend import GraphBackendBase
from serena.models.graph import Entity, EntityType, RelationType, Relationship


class Neo4jGraphBackend(GraphBackendBase):
    def __init__(self, uri: str, user: str, password: str, database: str = "neo4j"):
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(uri, auth=(user, password))
        self._database = database
        self._ensure_schema()

    def close(self) -> None:
        self._driver.close()

    def _ensure_schema(self) -> None:
        with self._driver.session(database=self._database) as session:
            session.run("CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.entity_id IS UNIQUE")

    def health_check(self) -> bool:
        try:
            with self._driver.session(database=self._database) as session:
                session.run("RETURN 1").consume()
            return True
        except Exception:
            return False

    def _store_entities(self, entities: list[Entity]) -> None:
        with self._driver.session(database=self._database) as session:
            for entity in entities:
                session.run(
                    "MERGE (e:Entity {entity_id: $id}) SET e.entity_type=$et, e.name=$name, e.attributes=$attrs",
                    id=entity.entity_id, et=entity.entity_type.value, name=entity.name,
                    attrs=json.dumps(entity.attributes),
                )

    def _store_relationships(self, relationships: list[Relationship]) -> None:
        with self._driver.session(database=self._database) as session:
            for relationship in relationships:
                session.run(
                    "MATCH (a:Entity {entity_id: $src}), (b:Entity {entity_id: $dst}) "
                    "MERGE (a)-[r:RELATES {relation_type: $rt, valid_from: $vf}]->(b) "
                    "SET r.attributes = $attrs, r.valid_until = $vu",
                    src=relationship.source_id, dst=relationship.target_id, rt=relationship.relation_type.value,
                    vf=relationship.valid_from.astimezone(timezone.utc).isoformat(),
                    attrs=json.dumps(relationship.attributes),
                    vu=relationship.valid_until.astimezone(timezone.utc).isoformat() if relationship.valid_until else None,
                )

    def _get_entity(self, entity_id: str) -> Optional[Entity]:
        with self._driver.session(database=self._database) as session:
            record = session.run(
                "MATCH (e:Entity {entity_id: $id}) RETURN e.entity_id AS entity_id, e.entity_type AS entity_type, "
                "e.name AS name, e.attributes AS attributes", id=entity_id,
            ).single()
            return self._record_to_entity(record) if record else None

    def _entities_by_type(self, entity_type: EntityType) -> list[Entity]:
        with self._driver.session(database=self._database) as session:
            records = session.run(
                "MATCH (e:Entity {entity_type: $et}) RETURN e.entity_id AS entity_id, e.entity_type AS entity_type, "
                "e.name AS name, e.attributes AS attributes", et=entity_type.value,
            )
            return [self._record_to_entity(record) for record in records]

    def _relationships_touching(self, entity_id: str) -> list[Relationship]:
        with self._driver.session(database=self._database) as session:
            records = session.run(
                "MATCH (a:Entity)-[r:RELATES]->(b:Entity) WHERE a.entity_id = $id OR b.entity_id = $id "
                "RETURN a.entity_id AS source_id, r.relation_type AS relation_type, r.attributes AS attributes, "
                "r.valid_from AS valid_from, r.valid_until AS valid_until, b.entity_id AS target_id",
                id=entity_id,
            )
            return [self._record_to_relationship(record) for record in records]

    @staticmethod
    def _record_to_entity(record) -> Entity:
        return Entity(
            entity_id=record["entity_id"], entity_type=EntityType(record["entity_type"]),
            name=record["name"], attributes=json.loads(record["attributes"]),
        )

    @staticmethod
    def _record_to_relationship(record) -> Relationship:
        return Relationship(
            source_id=record["source_id"], target_id=record["target_id"], relation_type=RelationType(record["relation_type"]),
            attributes=json.loads(record["attributes"]),
            valid_from=datetime.fromisoformat(record["valid_from"]),
            valid_until=datetime.fromisoformat(record["valid_until"]) if record["valid_until"] else None,
        )
