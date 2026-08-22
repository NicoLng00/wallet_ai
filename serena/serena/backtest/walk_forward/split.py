"""Walk-forward split (docs/TRADING_ARCHITECTURE.md §15) — train/validation/out-of-sample in ordine
cronologico fisso, mai un campionamento casuale delle finestre. `assert_chronological` e' il guardiano
esplicito della regola del brief "mai mescolare dati di serie temporali": usato dal motore di backtest
prima di processare qualunque slice, non solo documentato come convenzione."""
from __future__ import annotations
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NonChronologicalDataError(ValueError):
    pass


def assert_chronological(timestamps: list[datetime]) -> None:
    for i in range(1, len(timestamps)):
        if timestamps[i] <= timestamps[i - 1]:
            raise NonChronologicalDataError(
                f"timestamp non crescente in posizione {i}: {timestamps[i]} <= {timestamps[i - 1]} — "
                f"i dati di serie temporale non devono mai essere mescolati o duplicati"
            )


class WalkForwardSplit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    train_start: datetime
    train_end: datetime
    validation_start: datetime
    validation_end: datetime
    out_of_sample_start: datetime
    out_of_sample_end: datetime

    @model_validator(mode="after")
    def _segments_are_chronological_and_contiguous(self) -> "WalkForwardSplit":
        boundaries = [
            self.train_start, self.train_end, self.validation_start,
            self.validation_end, self.out_of_sample_start, self.out_of_sample_end,
        ]
        for i in range(1, len(boundaries)):
            if boundaries[i] < boundaries[i - 1]:
                raise ValueError("i confini dello split devono essere in ordine cronologico non decrescente")
        return self


def make_walk_forward_split(timestamps: list[datetime], train_fraction: float = 0.6,
                             validation_fraction: float = 0.2) -> WalkForwardSplit:
    if not (0.0 < train_fraction < 1.0) or not (0.0 < validation_fraction < 1.0):
        raise ValueError("train_fraction e validation_fraction devono essere in (0,1)")
    if train_fraction + validation_fraction >= 1.0:
        raise ValueError("train_fraction + validation_fraction deve lasciare spazio all'out-of-sample")
    if len(timestamps) < 3:
        raise ValueError("servono almeno 3 timestamp per uno split train/validation/out-of-sample")

    assert_chronological(timestamps)

    n = len(timestamps)
    train_end_index = max(1, int(n * train_fraction))
    validation_end_index = max(train_end_index + 1, int(n * (train_fraction + validation_fraction)))
    validation_end_index = min(validation_end_index, n - 1)

    return WalkForwardSplit(
        train_start=timestamps[0], train_end=timestamps[train_end_index - 1],
        validation_start=timestamps[train_end_index], validation_end=timestamps[validation_end_index - 1],
        out_of_sample_start=timestamps[validation_end_index], out_of_sample_end=timestamps[-1],
    )
