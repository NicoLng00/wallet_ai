"""EventEngine (docs/TRADING_ARCHITECTURE.md §5): raw data -> Event strutturato, con i campi
deterministici (timestamp, entities, novelty) calcolati separatamente da quelli interpretati
semanticamente (direction, importance, confidence), che passano da un LLMClient validato — mai
testo libero (stessa disciplina di MiroFish's ontology_generator.py, §A.2).

OUR DESIGN DECISION (limiti dichiarati, non nascosti):
- resolve_entities() e' un dizionario deterministico chiave->entity_id, non ancora la risoluzione
  via knowledge graph prevista in Fase 4 (§3). E' un placeholder intenzionale: deterministico e
  testabile oggi, sostituito da un lookup sul grafo reale quando knowledge/graph/ esiste.
- compute_novelty() e' una distanza di Jaccard sui token di testo, non la distanza coseno fra
  embedding prevista dall'architettura (richiede knowledge/embeddings/, non ancora costruita in
  Fase 3). Stesso principio: deterministico e testabile ora, sostituito quando gli embedding esistono.
- L'interpretazione semantica (direction/importance/confidence) prova un EventInterpreter Tier 1/2
  (LLMBackedEventInterpreter) con un retry a temperatura ridotta su fallimento (§7), e ricade
  sempre su HeuristicEventInterpreter (Tier 3, deterministico, nessuna rete) se anche il retry
  fallisce — mai un evento senza interpretazione, mai un'eccezione che blocca la pipeline per un
  singolo articolo di news."""
from __future__ import annotations
import re
from typing import Literal, Optional, Protocol

from pydantic import BaseModel, ConfigDict, Field

from serena.llm.client import LLMClient, LLMTier
from serena.models.data import DataPoint
from serena.models.event import Event


class EventInterpretation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    direction: Literal["bullish", "bearish", "neutral"]
    importance: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)


class EventInterpreter(Protocol):
    async def interpret(self, text: str) -> EventInterpretation: ...


# --- Interpretazione deterministica (Tier 3) ------------------------------------------------

BULLISH_KEYWORDS = (
    "surge", "rally", "adoption", "approval", "approved", "inflow", "inflows", "bullish",
    "breakout", "record high", "all-time high", "buy", "upgrade", "partnership",
)
BEARISH_KEYWORDS = (
    "crash", "plunge", "selloff", "sell-off", "hack", "hacked", "exploit", "ban", "banned",
    "lawsuit", "outflow", "outflows", "bearish", "collapse", "downgrade", "fraud", "liquidation",
)
HIGH_IMPACT_KEYWORDS = (
    "sec", "etf", "federal reserve", "regulation", "regulatory", "hack", "lawsuit", "ban",
)
HEURISTIC_FALLBACK_CONFIDENCE = 0.35


class HeuristicEventInterpreter:
    """Tier 3: nessuna rete, nessuna dipendenza da LLMClient (import assente per costruzione,
    stessa regola di risk/ e backtest/ in docs/TRADING_ARCHITECTURE.md §7). Confidence fissa e
    volutamente bassa (0.35) per marcare nei dati stessi che questo NON e' un giudizio semantico
    reale, a differenza di quanto potrebbe restituire un vero Tier 1/2."""

    async def interpret(self, text: str) -> EventInterpretation:
        lowered = text.lower()
        bullish_hits = sum(1 for kw in BULLISH_KEYWORDS if kw in lowered)
        bearish_hits = sum(1 for kw in BEARISH_KEYWORDS if kw in lowered)
        if bullish_hits > bearish_hits:
            direction: Literal["bullish", "bearish", "neutral"] = "bullish"
        elif bearish_hits > bullish_hits:
            direction = "bearish"
        else:
            direction = "neutral"
        impact_hits = sum(1 for kw in HIGH_IMPACT_KEYWORDS if kw in lowered)
        importance = min(1.0, 0.15 + 0.2 * impact_hits)
        return EventInterpretation(direction=direction, importance=importance, confidence=HEURISTIC_FALLBACK_CONFIDENCE)


# --- Interpretazione LLM (Tier 1/2) ---------------------------------------------------------

class LLMBackedEventInterpreter:
    """Tier 1/2 reale (docs/TRADING_ARCHITECTURE.md §7): un retry a temperatura ridotta su
    fallimento, poi rilancia l'errore — la decisione di ricadere sul Tier 3 e' di EventEngine, non
    di questa classe (separazione di responsabilita': questa classe sa parlare con un LLMClient,
    EventEngine sa cosa fare se anche quello fallisce)."""

    def __init__(self, llm_client: LLMClient, tier: LLMTier = "fast", temperature: float = 0.0,
                 retry_temperature_delta: float = 0.1):
        self._llm_client = llm_client
        self._tier = tier
        self._temperature = temperature
        self._retry_temperature_delta = retry_temperature_delta

    async def interpret(self, text: str) -> EventInterpretation:
        try:
            return await self._call(text, self._temperature)
        except Exception:
            return await self._call(text, max(0.0, self._temperature - self._retry_temperature_delta))

    async def _call(self, text: str, temperature: float) -> EventInterpretation:
        prompt = (
            "Classifica il seguente testo di mercato/news secondo lo schema richiesto. "
            "direction: bullish/bearish/neutral dal punto di vista del prezzo dell'asset menzionato. "
            "importance e confidence in [0,1].\n\nTesto:\n" + text
        )
        return await self._llm_client.complete_json(
            prompt, EventInterpretation, tier=self._tier, temperature=temperature,
        )


# --- Risoluzione entita' deterministica (placeholder pre-Fase 4) ---------------------------

ENTITY_KEYWORDS: dict[str, str] = {
    "bitcoin": "BTC", "btc": "BTC",
    "ethereum": "ETH", "eth": "ETH",
    "federal reserve": "MACRO_FED", "the fed": "MACRO_FED",
    "securities and exchange commission": "REG_SEC", "sec ": "REG_SEC",
    "etf": "PRODUCT_ETF",
    "blackrock": "ENTITY_BLACKROCK",
    "binance": "EXCHANGE_BINANCE",
    "coinbase": "EXCHANGE_COINBASE",
}


def resolve_entities(text: str) -> list[str]:
    lowered = f" {text.lower()} "
    matched = {entity_id for keyword, entity_id in ENTITY_KEYWORDS.items() if keyword in lowered}
    return sorted(matched)


# --- Novelty deterministica (placeholder pre-embedding) -------------------------------------

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> set[str]:
    return {token for token in _TOKEN_RE.findall(text.lower()) if len(token) > 2}


def compute_novelty(text: str, recent_texts: list[str]) -> float:
    """1.0 = nessun testo recente sulla stessa entita' (o overlap nullo). 0.0 = quasi identico a un
    testo gia' visto. Distanza di Jaccard sui token — placeholder deterministico ed economico per la
    distanza coseno su embedding prevista in Fase 4, non spacciata per similarita' semantica vera."""
    tokens = _tokenize(text)
    if not tokens or not recent_texts:
        return 1.0
    max_similarity = 0.0
    for prior in recent_texts:
        prior_tokens = _tokenize(prior)
        if not prior_tokens:
            continue
        union = len(tokens | prior_tokens)
        if union == 0:
            continue
        similarity = len(tokens & prior_tokens) / union
        max_similarity = max(max_similarity, similarity)
    return round(1.0 - max_similarity, 4)


# --- Motore ----------------------------------------------------------------------------------

class EventEngine:
    def __init__(self, interpreter: Optional[EventInterpreter] = None):
        self._interpreter = interpreter or HeuristicEventInterpreter()
        self._fallback = HeuristicEventInterpreter()
        self._recent_texts_by_entity: dict[str, list[str]] = {}

    async def build_event(self, data_point: DataPoint, text: str, event_id: str, event_type: str) -> Event:
        entities = resolve_entities(text) or ["UNRESOLVED"]
        novelty = self._novelty_for_entities(entities, text)
        interpretation = await self._interpret_safely(text)
        event = Event(
            event_id=event_id,
            timestamp=data_point.timestamp,
            type=event_type,
            entities=entities,
            direction=interpretation.direction,
            importance=interpretation.importance,
            novelty=novelty,
            confidence=interpretation.confidence,
            source_ids=[data_point.raw_payload_hash],
        )
        self._record_text(entities, text)
        return event

    async def _interpret_safely(self, text: str) -> EventInterpretation:
        try:
            return await self._interpreter.interpret(text)
        except Exception:
            return await self._fallback.interpret(text)

    def _novelty_for_entities(self, entities: list[str], text: str) -> float:
        scores = [compute_novelty(text, self._recent_texts_by_entity.get(entity, [])) for entity in entities]
        return min(scores) if scores else 1.0

    def _record_text(self, entities: list[str], text: str) -> None:
        for entity in entities:
            self._recent_texts_by_entity.setdefault(entity, []).append(text)
