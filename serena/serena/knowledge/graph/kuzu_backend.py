"""KuzuGraphBackend — implementazione di default (docs/TRADING_ARCHITECTURE.md §3.1): embedded,
zero-infrastruttura, nessun servizio esterno richiesto per far girare l'MVP in locale. Verificato
live in questo ambiente (nessun server, nessuna chiave): `kuzu.Database` apre un file su disco (o
uno spazio in-memory con `:memory:`), MERGE su nodo/relazione e' idempotente per costruzione.

Schema deliberatamente semplice: UNA sola REL TABLE generica ("RELATES") con `relation_type` come
proprieta' stringa, invece di 13 REL TABLE tipizzate (una per RelationType). OUR DESIGN DECISION:
Kuzu richiede una REL TABLE dichiarata per ogni coppia di node-table connessa; con un solo node
table (Entity) e relazioni che possono avere qualunque relation_type fra due entita' qualsiasi,
13 tabelle identiche differenziate solo dal nome sarebbero pura duplicazione di schema per
un beneficio query nullo in questa fase — la selettivita' per relation_type resta comunque
disponibile via WHERE. Rivedibile se un backend Neo4j equivalente mostrasse un vantaggio concreto
nell'usare tipi di relazione nativi Cypher invece di una proprieta'.

Timestamp: Kuzu TIMESTAMP e' naive; scriviamo sempre convertendo in UTC e spogliando il tzinfo,
rileggiamo riattaccando tzinfo=UTC — cosi' i round-trip restano confrontabili con il resto del
progetto, che e' timezone-aware ovunque."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

from serena.knowledge.graph.backend import GraphBackendBase
from serena.models.graph import Entity, EntityType, RelationType, Relationship


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc)
    return value.replace(tzinfo=None)


def _from_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc)


class KuzuGraphBackend(GraphBackendBase):
    def __init__(self, path: Union[str, Path] = ":memory:"):
        import kuzu

        self._db = kuzu.Database(str(path))
        self._conn = kuzu.Connection(self._db)
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        try:
            self._conn.execute(
                "CREATE NODE TABLE Entity(entity_id STRING, entity_type STRING, name STRING, "
                "attributes STRING, PRIMARY KEY(entity_id))"
            )
        except RuntimeError:
            pass  # tabella gia' esistente (riapertura di un db su file)
        try:
            self._conn.execute(
                "CREATE REL TABLE RELATES(FROM Entity TO Entity, relation_type STRING, "
                "attributes STRING, valid_from TIMESTAMP, valid_until TIMESTAMP)"
            )
        except RuntimeError:
            pass

    def health_check(self) -> bool:
        try:
            self._conn.execute("MATCH (e:Entity) RETURN count(e)")
            return True
        except Exception:
            return False

    def _store_entities(self, entities: list[Entity]) -> None:
        for entity in entities:
            self._conn.execute(
                "MERGE (e:Entity {entity_id: $id}) SET e.entity_type=$et, e.name=$name, e.attributes=$attrs",
                parameters={
                    "id": entity.entity_id,
                    "et": entity.entity_type.value,
                    "name": entity.name,
                    "attrs": json.dumps(entity.attributes),
                },
            )

    def _store_relationships(self, relationships: list[Relationship]) -> None:
        for relationship in relationships:
            self._conn.execute(
                "MATCH (a:Entity {entity_id: $src}), (b:Entity {entity_id: $dst}) "
                "MERGE (a)-[r:RELATES {relation_type: $rt, valid_from: $vf}]->(b) "
                "SET r.attributes = $attrs, r.valid_until = $vu",
                parameters={
                    "src": relationship.source_id,
                    "dst": relationship.target_id,
                    "rt": relationship.relation_type.value,
                    "vf": _to_naive_utc(relationship.valid_from),
                    "attrs": json.dumps(relationship.attributes),
                    "vu": _to_naive_utc(relationship.valid_until) if relationship.valid_until else None,
                },
            )

    def _get_entity(self, entity_id: str) -> Optional[Entity]:
        result = self._conn.execute(
            "MATCH (e:Entity {entity_id: $id}) RETURN e.entity_id, e.entity_type, e.name, e.attributes",
            parameters={"id": entity_id},
        )
        if not result.has_next():
            return None
        row = result.get_next()
        return self._row_to_entity(row)

    def _entities_by_type(self, entity_type: EntityType) -> list[Entity]:
        result = self._conn.execute(
            "MATCH (e:Entity {entity_type: $et}) RETURN e.entity_id, e.entity_type, e.name, e.attributes",
            parameters={"et": entity_type.value},
        )
        return [self._row_to_entity(row) for row in _iter_rows(result)]

    def _relationships_touching(self, entity_id: str) -> list[Relationship]:
        result = self._conn.execute(
            "MATCH (a:Entity)-[r:RELATES]->(b:Entity) WHERE a.entity_id = $id OR b.entity_id = $id "
            "RETURN a.entity_id, r.relation_type, r.attributes, r.valid_from, r.valid_until, b.entity_id",
            parameters={"id": entity_id},
        )
        return [self._row_to_relationship(row) for row in _iter_rows(result)]

    @staticmethod
    def _row_to_entity(row: list) -> Entity:
        entity_id, entity_type, name, attrs_json = row
        return Entity(entity_id=entity_id, entity_type=EntityType(entity_type), name=name, attributes=json.loads(attrs_json))

    @staticmethod
    def _row_to_relationship(row: list) -> Relationship:
        source_id, relation_type, attrs_json, valid_from, valid_until, target_id = row
        return Relationship(
            source_id=source_id, target_id=target_id, relation_type=RelationType(relation_type),
            attributes=json.loads(attrs_json), valid_from=_from_naive_utc(valid_from), valid_until=_from_naive_utc(valid_until),
        )


def _iter_rows(query_result):
    while query_result.has_next():
        yield query_result.get_next()
