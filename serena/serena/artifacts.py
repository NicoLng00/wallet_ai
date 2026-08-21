"""Scrittura artefatti per run (docs/TRADING_ARCHITECTURE.md §2, §18, §19) — correzione diretta del
comportamento verificato di MiroFish, che sovrascrive state.json/run_state.json in place ad ogni
salvataggio e cancella i log per "riavviare" una simulazione (docs/MIROFISH_REVERSE_ENGINEERING.md
§A.10). Qui: la cartella di un run e' creata una sola volta, i file "singoli" (run_metadata.json,
agents.json, metrics.json) non possono mai essere riscritti, i file .jsonl sono append-only per
costruzione."""
from __future__ import annotations
import json
from datetime import date, datetime
from pathlib import Path
from typing import Union

from pydantic import BaseModel

RUNS_ROOT = Path(__file__).resolve().parent.parent / "runs"

Serializable = Union[BaseModel, dict, list]


def _default_json(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Oggetto di tipo {type(obj).__name__} non serializzabile in JSON")


def _serialize(payload: Serializable):
    if isinstance(payload, BaseModel):
        return payload.model_dump(mode="json")
    if isinstance(payload, list):
        return [_serialize(item) for item in payload]
    return payload


class RunArtifactWriter:
    """Un'istanza per run_id. La creazione della cartella e' idempotente (necessaria per il resume,
    docs/TRADING_ARCHITECTURE.md §18) — sono i singoli file dentro a non esserlo mai."""

    def __init__(self, run_id: str, root: Path | None = None):
        self.run_id = run_id
        self.dir = (root or RUNS_ROOT) / run_id
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, filename: str) -> Path:
        return self.dir / filename

    def write_once(self, filename: str, payload: Serializable) -> Path:
        path = self._path(filename)
        if path.exists():
            raise FileExistsError(
                f"{path} esiste gia' — un artefatto di run non viene mai sovrascritto "
                f"(run_id={self.run_id}). Per un nuovo tentativo, crea un nuovo run_id con "
                f"resumed_from_run_id impostato a questo."
            )
        path.write_text(json.dumps(_serialize(payload), indent=2, default=_default_json), encoding="utf-8")
        return path

    def append_jsonl(self, filename: str, record: Serializable) -> Path:
        if not filename.endswith(".jsonl"):
            raise ValueError(f"append_jsonl richiede un nome file .jsonl, ricevuto: {filename}")
        path = self._path(filename)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(_serialize(record), default=_default_json))
            handle.write("\n")
        return path

    def read_json(self, filename: str) -> dict:
        return json.loads(self._path(filename).read_text(encoding="utf-8"))

    def read_jsonl(self, filename: str) -> list[dict]:
        path = self._path(filename)
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def exists(self, filename: str) -> bool:
        return self._path(filename).exists()
