from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from serena.backtest.walk_forward.split import (
    NonChronologicalDataError,
    WalkForwardSplit,
    assert_chronological,
    make_walk_forward_split,
)

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def timestamps(n: int) -> list:
    return [BASE + timedelta(days=i) for i in range(n)]


def test_assert_chronological_accepts_strictly_increasing_timestamps():
    assert_chronological(timestamps(10))  # non deve sollevare


def test_assert_chronological_rejects_a_shuffled_sequence():
    """La regola centrale del brief: mai processare dati di serie temporale mescolati — questo e'
    esattamente il guardiano che lo impedisce strutturalmente nel motore di backtest."""
    shuffled = timestamps(5)
    shuffled[1], shuffled[3] = shuffled[3], shuffled[1]
    with pytest.raises(NonChronologicalDataError):
        assert_chronological(shuffled)


def test_assert_chronological_rejects_duplicate_timestamps():
    values = timestamps(3)
    values.append(values[-1])
    with pytest.raises(NonChronologicalDataError):
        assert_chronological(values)


def test_make_walk_forward_split_produces_chronological_contiguous_segments():
    split = make_walk_forward_split(timestamps(100), train_fraction=0.6, validation_fraction=0.2)
    assert split.train_start == BASE
    assert split.train_end < split.validation_start
    assert split.validation_end < split.out_of_sample_start
    assert split.out_of_sample_end == timestamps(100)[-1]


def test_make_walk_forward_split_rejects_shuffled_input():
    shuffled = timestamps(20)
    shuffled[2], shuffled[10] = shuffled[10], shuffled[2]
    with pytest.raises(NonChronologicalDataError):
        make_walk_forward_split(shuffled)


def test_make_walk_forward_split_rejects_fractions_that_leave_no_room_for_out_of_sample():
    with pytest.raises(ValueError):
        make_walk_forward_split(timestamps(20), train_fraction=0.7, validation_fraction=0.4)


def test_make_walk_forward_split_rejects_too_few_timestamps():
    with pytest.raises(ValueError):
        make_walk_forward_split(timestamps(2))


def test_walk_forward_split_model_rejects_out_of_order_boundaries():
    with pytest.raises(ValidationError):
        WalkForwardSplit(
            train_start=BASE, train_end=BASE + timedelta(days=10),
            validation_start=BASE + timedelta(days=5),  # prima della fine del train: non valido
            validation_end=BASE + timedelta(days=15),
            out_of_sample_start=BASE + timedelta(days=15), out_of_sample_end=BASE + timedelta(days=20),
        )
