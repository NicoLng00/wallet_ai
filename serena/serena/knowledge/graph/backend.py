"""GraphBackend (docs/TRADING_ARCHITECTURE.md §3.1) — correzione diretta del lock-in Zep Cloud
verificato in MiroFish (`graph_builder.py` importa `zep_cloud` direttamente, `Config.validate()`
rifiuta persino un endpoint Zep self-hosted, docs/MIROFISH_REVERSE_ENGINEERING.md §A.3/A.7). Solo
`knowledge/graph/` importa una libreria di grafo — nessun altro package tocca Kuzu/Neo4j direttamente.

GraphBackendBase centralizza la logica che DEVE comportarsi identicamente su ogni backend (altrimenti
"backend intercambiabili" sarebbe falso): rifiuto delle chiavi di attributo riservate, rifiuto degli
edge pendenti (relazione verso un'entita' mai upsertata), traversal BFS per query_neighborhood. Le
sottoclassi implementano solo lo storage nativo (_store_entities/_store_relationships/_get_entity/
_relationships_touching/_entities_by_type/health_check) — la stessa test suite in
tests/test_graph_backend.py gira parametrizzata su entrambe per garantire che siano davvero
intercambiabili, non solo genericamente simili."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional, Protocol

from serena.models.graph import Entity, EntityType, Relationship, Subgraph

# docs/MIROFISH_REVERSE_ENGINEERING.md §A.2: il generatore di ontologia di MiroFish vieta nomi di
# attributo che collidono con le parole riservate di Zep. Non usiamo Zep, quindi adattiamo lo stesso
# principio ai NOSTRI campi strutturali: un valore in `attributes` non deve mai poter ombreggiare un
# campo dello schema Entity/Relationship quando viene appiattito in una riga di uno storage nativo.
RESERVED_ENTITY_ATTRIBUTE_KEYS = frozenset({"entity_id", "entity_type", "name"})
RESERVED_RELATIONSHIP_ATTRIBUTE_KEYS = frozenset({"source_id", "target_id", "relation_type", "valid_from", "valid_until"})


class ReservedAttributeKeyError(ValueError):
    pass


class DanglingRelationshipError(ValueError):
    pass


class GraphBackend(Protocol):
    def upsert_entities(self, entities: list[Entity]) -> None: ...
    def upsert_relationships(self, relationships: list[Relationship]) -> None: ...
    def query_neighborhood(self, entity_id: str, depth: int = 2) -> Subgraph: ...
    def query_by_type(self, entity_type: EntityType) -> list[Entity]: ...
    def health_check(self) -> bool: ...


class GraphBackendBase(ABC):
    def upsert_entities(self, entities: list[Entity]) -> None:
        for entity in entities:
            collision = RESERVED_ENTITY_ATTRIBUTE_KEYS & entity.attributes.keys()
            if collision:
                raise ReservedAttributeKeyError(
                    f"entity '{entity.entity_id}': chiavi di attributo riservate non ammesse: {collision}"
                )
        self._store_entities(entities)

    def upsert_relationships(self, relationships: list[Relationship]) -> None:
        for relationship in relationships:
            collision = RESERVED_RELATIONSHIP_ATTRIBUTE_KEYS & relationship.attributes.keys()
            if collision:
                raise ReservedAttributeKeyError(
                    f"relationship {relationship.source_id}->{relationship.target_id}: "
                    f"chiavi di attributo riservate non ammesse: {collision}"
                )
            if self._get_entity(relationship.source_id) is None:
                raise DanglingRelationshipError(
                    f"relationship referenzia source_id '{relationship.source_id}', mai upsertato come entita'"
                )
            if self._get_entity(relationship.target_id) is None:
                raise DanglingRelationshipError(
                    f"relationship referenzia target_id '{relationship.target_id}', mai upsertato come entita'"
                )
        self._store_relationships(relationships)

    def query_neighborhood(self, entity_id: str, depth: int = 2) -> Subgraph:
        center = self._get_entity(entity_id)
        if center is None:
            return Subgraph(center_entity_id=entity_id, entities=[], relationships=[])

        visited_entities: dict[str, Entity] = {entity_id: center}
        visited_relationship_keys: set[tuple[str, str, str]] = set()
        relationships: list[Relationship] = []
        frontier = [entity_id]

        for _ in range(max(0, depth)):
            next_frontier: list[str] = []
            for current_id in frontier:
                for relationship in self._relationships_touching(current_id):
                    key = (relationship.source_id, relationship.target_id, relationship.relation_type.value)
                    if key not in visited_relationship_keys:
                        visited_relationship_keys.add(key)
                        relationships.append(relationship)
                    other_id = relationship.target_id if relationship.source_id == current_id else relationship.source_id
                    if other_id not in visited_entities:
                        other_entity = self._get_entity(other_id)
                        if other_entity is not None:
                            visited_entities[other_id] = other_entity
                            next_frontier.append(other_id)
            frontier = next_frontier
            if not frontier:
                break

        return Subgraph(
            center_entity_id=entity_id,
            entities=list(visited_entities.values()),
            relationships=relationships,
        )

    def query_by_type(self, entity_type: EntityType) -> list[Entity]:
        return self._entities_by_type(entity_type)

    @abstractmethod
    def health_check(self) -> bool: ...

    @abstractmethod
    def _store_entities(self, entities: list[Entity]) -> None: ...

    @abstractmethod
    def _store_relationships(self, relationships: list[Relationship]) -> None: ...

    @abstractmethod
    def _get_entity(self, entity_id: str) -> Optional[Entity]: ...

    @abstractmethod
    def _relationships_touching(self, entity_id: str) -> list[Relationship]: ...

    @abstractmethod
    def _entities_by_type(self, entity_type: EntityType) -> list[Entity]: ...
