"""independent_consensus (docs/TRADING_ARCHITECTURE.md §14) e' un metodo di AgentPredictionMatrix
(signals/independence/matrix.py), non una funzione separata: lo stato di cui ha bisogno (le serie di
expected_return per agente, i cluster di correlazione) vive gia' li'. Questo pacchetto resta un
pass-through per rispettare la forma della repo layout dell'architettura senza duplicare lo stato."""
from serena.signals.independence.matrix import AgentPredictionMatrix

__all__ = ["AgentPredictionMatrix"]
