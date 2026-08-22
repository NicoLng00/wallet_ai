"""API FastAPI di sola lettura (docs/TRADING_ARCHITECTURE.md §21): legge SOLO gli artefatti gia'
persistiti in runs/{run_id}/ — mai OASIS, mai un LLM, mai gli adapter dati direttamente. Il frontend
(dashboard.py) parla solo con questa API, mai con lo storage sottostante."""
from __future__ import annotations
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse

from serena.api.chart_data import (
    agent_leaderboard,
    archetype_distribution,
    belief_distribution,
    equity_curve_series,
    signal_timeline,
    variant_comparison,
)
from serena.api.dashboard import render_dashboard_html
from serena.artifacts import RUNS_ROOT, RunArtifactWriter
from serena.reports.report_agent.report_generator import generate_report


def create_app(runs_root: Optional[Path] = None) -> FastAPI:
    root = runs_root or RUNS_ROOT
    app = FastAPI(title="Serena Research Dashboard API")

    def _writer_or_404(run_id: str) -> RunArtifactWriter:
        if not (root / run_id).exists():
            raise HTTPException(status_code=404, detail=f"run_id sconosciuto: {run_id}")
        return RunArtifactWriter(run_id, root=root)

    def _json_or_404(run_id: str, filename: str):
        writer = _writer_or_404(run_id)
        if not writer.exists(filename):
            raise HTTPException(status_code=404, detail=f"artefatto non trovato: {filename}")
        return writer.read_json(filename)

    @app.get("/runs")
    def list_runs() -> list[str]:
        if not root.exists():
            return []
        return sorted(p.name for p in root.iterdir() if p.is_dir())

    @app.get("/runs/{run_id}/summary")
    def summary(run_id: str) -> dict:
        return _json_or_404(run_id, "run_metadata.json")

    @app.get("/runs/{run_id}/agents")
    def agents(run_id: str) -> list[dict]:
        return _json_or_404(run_id, "agents.json")

    @app.get("/runs/{run_id}/events")
    def events(run_id: str) -> list[dict]:
        return _writer_or_404(run_id).read_jsonl("events.jsonl")

    @app.get("/runs/{run_id}/actions")
    def actions(run_id: str) -> list[dict]:
        return _writer_or_404(run_id).read_jsonl("actions.jsonl")

    @app.get("/runs/{run_id}/belief_updates")
    def belief_updates(run_id: str) -> list[dict]:
        return _writer_or_404(run_id).read_jsonl("belief_updates.jsonl")

    @app.get("/runs/{run_id}/signals")
    def signals(run_id: str) -> list[dict]:
        return _writer_or_404(run_id).read_jsonl("signals.jsonl")

    @app.get("/runs/{run_id}/portfolio")
    def portfolio(run_id: str) -> list[dict]:
        return _writer_or_404(run_id).read_jsonl("portfolio.jsonl")

    @app.get("/runs/{run_id}/metrics")
    def metrics(run_id: str) -> dict:
        return _json_or_404(run_id, "metrics.json")

    @app.get("/runs/{run_id}/agent_scores")
    def agent_scores(run_id: str) -> list[dict]:
        return _json_or_404(run_id, "agent_scores.json")

    @app.get("/runs/{run_id}/report", response_class=PlainTextResponse)
    def report(run_id: str) -> str:
        writer = _writer_or_404(run_id)
        report_path = writer.dir / "report.md"
        if report_path.exists():
            return report_path.read_text(encoding="utf-8")
        try:
            return generate_report(run_id, root=root)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"impossibile generare il report: {exc}")

    @app.get("/runs/{run_id}/charts/equity_curve")
    def chart_equity_curve(run_id: str) -> list[float]:
        return equity_curve_series(_writer_or_404(run_id).read_jsonl("portfolio.jsonl"))

    @app.get("/runs/{run_id}/charts/archetype_distribution")
    def chart_archetype_distribution(run_id: str) -> dict:
        return archetype_distribution(_json_or_404(run_id, "agents.json"))

    @app.get("/runs/{run_id}/charts/leaderboard")
    def chart_leaderboard(run_id: str) -> list[dict]:
        writer = _writer_or_404(run_id)
        scores = writer.read_json("agent_scores.json") if writer.exists("agent_scores.json") else []
        return agent_leaderboard(scores)

    @app.get("/runs/{run_id}/charts/signal_timeline")
    def chart_signal_timeline(run_id: str) -> list[dict]:
        return signal_timeline(_writer_or_404(run_id).read_jsonl("signals.jsonl"))

    @app.get("/runs/{run_id}/charts/belief_distribution")
    def chart_belief_distribution(run_id: str) -> dict:
        return belief_distribution(_writer_or_404(run_id).read_jsonl("belief_updates.jsonl"))

    @app.get("/runs/{run_id}/charts/variant_comparison")
    def chart_variant_comparison(run_id: str) -> list[dict]:
        writer = _writer_or_404(run_id)
        variant_metrics = writer.read_json("metrics.json") if writer.exists("metrics.json") else {}
        return variant_comparison(variant_metrics)

    @app.get("/dashboard/{run_id}", response_class=HTMLResponse)
    def dashboard(run_id: str) -> str:
        if not (root / run_id).exists():
            raise HTTPException(status_code=404, detail=f"run_id sconosciuto: {run_id}")
        return render_dashboard_html(run_id)

    return app
