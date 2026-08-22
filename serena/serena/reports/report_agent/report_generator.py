"""Generatore di report + validatore dei tag (docs/TRADING_ARCHITECTURE.md §20): ogni riga di
contenuto (non intestazioni/tabelle/righe vuote) deve portare uno dei tre tag richiesti — la stessa
disciplina "niente affermazioni non verificabili" del resto del progetto, applicata al testo generato
invece che al codice.

Limite dichiarato: nessuna ANTHROPIC_API_KEY in questo ambiente (stesso limite di ogni fase
precedente) — questo generatore produce SOLO sezioni [SIMULATION FACT] (lette direttamente dagli
artefatti via RunReportTools, Tier 3) e una sezione [MODEL INTERPRETATION] che dichiara esplicitamente
la propria assenza, invece di fabbricare un'interpretazione al posto di un vero LLM."""
from __future__ import annotations
from pathlib import Path
from typing import Optional

from serena.reports.report_agent.tools import RunReportTools

VALID_TAGS = ("SIMULATION FACT", "MODEL INTERPRETATION", "REAL MARKET OUTCOME")


class UntaggedClaimError(ValueError):
    pass


def validate_report_tags(report_text: str) -> None:
    for line_number, raw_line in enumerate(report_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("|") or set(line) <= {"-", " "}:
            continue  # intestazioni/tabelle/separatori non sono affermazioni da taggare
        if not any(f"[{tag}]" in line for tag in VALID_TAGS):
            raise UntaggedClaimError(
                f"riga {line_number} non porta nessuno dei tag richiesti {VALID_TAGS}: {line!r}"
            )


def generate_report(run_id: str, root: Optional[Path] = None) -> str:
    tools = RunReportTools(run_id, root)
    summary = tools.search_run_metadata()
    agents = tools.search_agents()
    actions = tools.search_agent_actions()
    signals = tools.search_signals()
    metrics = tools.calculate_metrics()
    scores = tools.search_agent_scores()

    lines: list[str] = [f"# Report di simulazione — {run_id}", ""]
    lines.append("## Fatti della simulazione")
    lines.append(f"- [SIMULATION FACT] Asset: {summary.get('assets', 'N/D')}")
    lines.append(f"- [SIMULATION FACT] Agenti nella popolazione: {len(agents)}")
    lines.append(f"- [SIMULATION FACT] Decisioni totali registrate: {len(actions)}")

    action_counts: dict[str, int] = {}
    for action_record in actions:
        action_counts[action_record["action"]] = action_counts.get(action_record["action"], 0) + 1
    for action, count in sorted(action_counts.items()):
        lines.append(f"- [SIMULATION FACT] Decisioni '{action}': {count}")

    if signals:
        last_signal = signals[-1]
        lines.append(f"- [SIMULATION FACT] Ultimo independent_consensus registrato: {last_signal.get('independent_consensus')}")

    if metrics:
        lines.append("")
        lines.append("## Metriche di backtest per variante")
        for variant, variant_metrics in metrics.items():
            lines.append(
                f"- [SIMULATION FACT] Variante '{variant}': "
                f"Sharpe={variant_metrics.get('sharpe_ratio', 0):.3f}, "
                f"CAGR={variant_metrics.get('cagr', 0):.3%}, "
                f"MaxDD={variant_metrics.get('max_drawdown', 0):.3%}"
            )

    if scores:
        leaderboard = sorted(scores, key=lambda s: s.get("recency_weight", 0.5), reverse=True)
        lines.append("")
        lines.append("## Classifica agenti (per recency_weight)")
        for score in leaderboard[:10]:
            lines.append(
                f"- [SIMULATION FACT] {score['agent_id']}: recency_weight={score['recency_weight']:.3f}, "
                f"accuracy={score['accuracy_score']:.3f}, n={score['sample_size']}"
            )

    lines.append("")
    lines.append("## Interpretazione del modello")
    lines.append(
        "- [MODEL INTERPRETATION] Non disponibile in questo ambiente: nessuna ANTHROPIC_API_KEY "
        "configurata, quindi nessuna interpretazione LLM e' stata generata per questo run — limite "
        "dichiarato, coerente con ogni fase precedente di questo progetto."
    )

    report_text = "\n".join(lines) + "\n"
    validate_report_tags(report_text)
    return report_text
