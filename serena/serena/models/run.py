"""SimulationRun e i suoi componenti (docs/TRADING_ARCHITECTURE.md §2). Ogni run deve essere
riproducibile per quanto l'API LLM esterna lo permette: temperature=0 di default (non 0.7 come
MiroFish, vedi docs/MIROFISH_REVERSE_ENGINEERING.md §A.12) e ogni seed usato e' tracciato
esplicitamente, mai lasciato al generatore globale di random/numpy."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TemperatureConfig(BaseModel):
    """I 4 controlli richiesti esplicitamente: SIMULATION_SEED (RandomSeedBundle.root_seed, sotto),
    COHORT_TEMPERATURE, AGENT_TEMPERATURE, DECISION_TEMPERATURE. Default 0.0 — deterministico per
    scelta, non per omissione: MiroFish usa 0.7 come default e lo abbassa solo nei retry (vedi
    ontology_generator.py/oasis_profile_generator.py/simulation_config_generator.py)."""
    model_config = ConfigDict(extra="forbid")

    cohort_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    agent_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    decision_temperature: float = Field(default=0.0, ge=0.0, le=2.0)


class ModelTierConfig(BaseModel):
    """LLMClient tiering (docs/TRADING_ARCHITECTURE.md §7). Tier 3 (deterministico) non ha un
    modello: e' un'assenza strutturale, risk/ e backtest/ non importano mai LLMClient."""
    model_config = ConfigDict(extra="forbid")

    tier1_model: str = "claude-opus-5"
    tier2_model: str = "claude-haiku-4-5-20251001"


class RandomSeedBundle(BaseModel):
    """Ogni componente stocastico (generazione coorte, campionamento attivazione round OASIS, ecc.)
    riceve un seed derivato deterministicamente da root_seed via numpy.random.SeedSequence — mai il
    modulo random globale non seedato, la causa verificata di non-determinismo sia in MiroFish
    (oasis_profile_generator.py, run_parallel_simulation.py) sia in OASIS stesso (recsys.py,
    platform.py) — vedi docs/MIROFISH_REVERSE_ENGINEERING.md §A.12/§B.11."""
    model_config = ConfigDict(extra="forbid")

    root_seed: int
    component_seeds: dict[str, int] = Field(default_factory=dict)

    @classmethod
    def derive(cls, root_seed: int, components: list[str]) -> "RandomSeedBundle":
        if len(components) != len(set(components)):
            raise ValueError("i nomi dei componenti devono essere unici")
        seq = np.random.SeedSequence(root_seed)
        children = seq.spawn(len(components))
        seeds = {name: int(child.generate_state(1)[0]) for name, child in zip(components, children)}
        return cls(root_seed=root_seed, component_seeds=seeds)

    def seed_for(self, component: str) -> int:
        if component not in self.component_seeds:
            raise KeyError(f"nessun seed derivato per il componente '{component}' — chiamare RandomSeedBundle.derive() con la lista completa dei componenti usati da questo run")
        return self.component_seeds[component]


class SimulationRun(BaseModel):
    """docs/TRADING_ARCHITECTURE.md §2. Persistito una sola volta in runs/{run_id}/run_metadata.json
    (RunArtifactWriter.write_once — mai sovrascritto, mai in place come MiroFish state.json)."""
    model_config = ConfigDict(extra="forbid")

    run_id: str
    seed: int
    start_timestamp: datetime
    end_timestamp: datetime
    assets: list[str] = Field(min_length=1)
    timeframe: str
    agent_count: int = Field(gt=0)
    simulation_rounds: int = Field(gt=0)
    model_tiers: ModelTierConfig
    temperature_config: TemperatureConfig
    prompts_version: str
    graph_version: str
    data_snapshot_version: str
    random_seeds: RandomSeedBundle
    code_version: str
    simulation_config: dict = Field(default_factory=dict)
    # Un "restart" non cancella mai il run fallito/precedente (docs/TRADING_ARCHITECTURE.md §2 e
    # §18): crea un nuovo run_id che punta al vecchio, mai una sovrascrittura in place.
    resumed_from_run_id: Optional[str] = None
    created_at: datetime

    @model_validator(mode="after")
    def _end_after_start(self) -> "SimulationRun":
        if self.end_timestamp <= self.start_timestamp:
            raise ValueError("end_timestamp deve essere successivo a start_timestamp")
        return self

    @field_validator("assets")
    @classmethod
    def _assets_not_empty_strings(cls, v: list[str]) -> list[str]:
        if any(not asset.strip() for asset in v):
            raise ValueError("ogni asset deve essere una stringa non vuota")
        return v
