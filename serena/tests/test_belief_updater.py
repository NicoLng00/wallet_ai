import pytest

from serena.agents.beliefs.updater import apply_event_update, apply_peer_exposure_update, apply_strategy_hint_update


# --- apply_event_update ------------------------------------------------------------------------

def test_bullish_event_increases_belief():
    assert apply_event_update(0.5, "bullish", importance=0.8, confidence=0.8, news_sensitivity=0.8) > 0.5


def test_bearish_event_decreases_belief():
    assert apply_event_update(0.5, "bearish", importance=0.8, confidence=0.8, news_sensitivity=0.8) < 0.5


def test_neutral_event_never_changes_belief():
    assert apply_event_update(0.5, "neutral", importance=1.0, confidence=1.0, news_sensitivity=1.0) == 0.5


def test_zero_news_sensitivity_means_no_change():
    assert apply_event_update(0.5, "bullish", importance=1.0, confidence=1.0, news_sensitivity=0.0) == 0.5


def test_event_update_is_clamped_at_the_upper_bound():
    assert apply_event_update(0.95, "bullish", importance=1.0, confidence=1.0, news_sensitivity=1.0) <= 1.0


def test_event_update_is_clamped_at_the_lower_bound():
    assert apply_event_update(0.05, "bearish", importance=1.0, confidence=1.0, news_sensitivity=1.0) >= 0.0


# --- apply_peer_exposure_update -----------------------------------------------------------------

def test_higher_peer_belief_pulls_belief_up():
    assert apply_peer_exposure_update(0.5, peer_belief=0.9, herding_coefficient=0.8, social_influence=0.8) > 0.5


def test_lower_peer_belief_pulls_belief_down():
    assert apply_peer_exposure_update(0.5, peer_belief=0.1, herding_coefficient=0.8, social_influence=0.8) < 0.5


def test_zero_herding_coefficient_means_no_peer_influence():
    assert apply_peer_exposure_update(0.5, peer_belief=1.0, herding_coefficient=0.0, social_influence=1.0) == 0.5


def test_identical_peer_belief_means_no_change():
    assert apply_peer_exposure_update(0.7, peer_belief=0.7, herding_coefficient=1.0, social_influence=1.0) == 0.7


# --- apply_strategy_hint_update ------------------------------------------------------------------

def test_hint_above_current_belief_pulls_it_up():
    assert apply_strategy_hint_update(0.5, hint_belief=0.9, information_sensitivity=0.8) > 0.5


def test_hint_below_current_belief_pulls_it_down():
    assert apply_strategy_hint_update(0.5, hint_belief=0.1, information_sensitivity=0.8) < 0.5


def test_zero_information_sensitivity_means_no_change():
    assert apply_strategy_hint_update(0.5, hint_belief=1.0, information_sensitivity=0.0) == 0.5


@pytest.mark.parametrize("fn_result", [
    apply_event_update(0.5, "bullish", 0.5, 0.5, 0.5),
    apply_peer_exposure_update(0.5, 0.9, 0.5, 0.5),
    apply_strategy_hint_update(0.5, 0.9, 0.5),
])
def test_every_updater_always_returns_a_value_in_unit_range(fn_result):
    assert 0.0 <= fn_result <= 1.0
