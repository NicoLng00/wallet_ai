"""La combinazione finale di confidence (accordo pesato tra agenti * confidence media, docs/
TRADING_ARCHITECTURE.md §13) e' calcolata dentro compute_risk_adjusted_signal
(signals/aggregation/pipeline.py) — un ultimo passo di pochi righi della stessa pipeline, non un
modello di calibrazione separato. La vera calibrazione (Brier score / reliability curve) e'
evaluation/calibration, Fase 11: quando esiste, il suo output entra qui tramite AgentScoreProvider
.calibration_score(), gia' un fattore della formula peso — nessun cambiamento a questo pacchetto sara'
necessario."""
from serena.signals.aggregation.pipeline import RiskAdjustedSignal, compute_risk_adjusted_signal

__all__ = ["RiskAdjustedSignal", "compute_risk_adjusted_signal"]
