import inspect
from datetime import datetime, timedelta, timezone

from serena.data.point_in_time import PointInTimeDataView
from serena.models.data import DataPoint

NOW = datetime(2026, 8, 22, 12, 0, tzinfo=timezone.utc)


def make_point(offset_hours: float, source: str = "test_source", asset: str = "BTC") -> DataPoint:
    return DataPoint(
        timestamp=NOW + timedelta(hours=offset_hours), source=source, asset=asset,
        raw_payload_hash="hash-" + str(offset_hours), normalized={"close": 100.0},
    )


def test_future_points_are_excluded_at_construction():
    points = [make_point(-2), make_point(-1), make_point(1), make_point(5)]
    view = PointInTimeDataView(points, current_time=NOW)
    assert len(view) == 2
    assert all(p.timestamp <= NOW for p in view.all())


def test_latest_never_returns_a_future_point():
    points = [make_point(-2), make_point(10)]
    view = PointInTimeDataView(points, current_time=NOW)
    assert view.latest().timestamp == NOW + timedelta(hours=-2)


def test_latest_returns_none_when_no_past_points_exist():
    view = PointInTimeDataView([make_point(1), make_point(2)], current_time=NOW)
    assert view.latest() is None


def test_window_respects_both_lookback_and_current_time_boundary():
    points = [make_point(-30), make_point(-2), make_point(1)]
    view = PointInTimeDataView(points, current_time=NOW)
    windowed = view.window(timedelta(hours=6))
    assert len(windowed) == 1
    assert windowed[0].timestamp == NOW + timedelta(hours=-2)


def test_by_source_filters_correctly():
    points = [make_point(-1, source="a"), make_point(-2, source="b")]
    view = PointInTimeDataView(points, current_time=NOW)
    assert len(view.by_source("a")) == 1
    assert view.by_source("a")[0].source == "a"


def test_points_are_sorted_by_timestamp_regardless_of_input_order():
    points = [make_point(-1), make_point(-5), make_point(-3)]
    view = PointInTimeDataView(points, current_time=NOW)
    timestamps = [p.timestamp for p in view.all()]
    assert timestamps == sorted(timestamps)


def test_no_public_method_accepts_a_timestamp_parameter():
    """Il vincolo anti-look-ahead e' strutturale: nessun metodo pubblico deve poter accettare un
    timestamp arbitrario (l'unico punto di ingresso e' current_time, fissato al costruttore)."""
    for name, method in inspect.getmembers(PointInTimeDataView, predicate=inspect.isfunction):
        if name.startswith("_") or name == "__init__":
            continue
        for param in inspect.signature(method).parameters.values():
            assert param.annotation is not datetime, (
                f"{PointInTimeDataView.__name__}.{name} accetta un datetime: violerebbe il vincolo anti-look-ahead"
            )
