"""Dashboard di ricerca minima (docs/TRADING_ARCHITECTURE.md §21): una singola pagina HTML
autosufficiente, JS vanilla, nessuna libreria esterna (coerente con "local-first" — la dashboard deve
funzionare anche senza rete). Parla SOLO con l'API di questo stesso processo (chart_data.py + app.py),
mai con OASIS/LLM/adapter dati direttamente. I grafici sono SVG disegnati a mano lato client — la
preparazione dei dati (la parte con vera logica) e' invece Python testato (chart_data.py); il JS qui
si limita a disegnare numeri gia' pronti."""
from __future__ import annotations
import html

_TEMPLATE = """<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Serena — __RUN_ID__</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; background: #0b1220; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { font-size: 18px; color: #93c5fd; }
  h2 { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-top: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
  .panel { background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; }
  .empty { color: #64748b; font-size: 13px; }
  svg { width: 100%; height: auto; overflow: visible; }
  .bar { fill: #60a5fa; }
  .bar-label { fill: #94a3b8; font-size: 9px; }
  .line { fill: none; stroke: #34d399; stroke-width: 2; }
  a.report-link { color: #93c5fd; }
</style>
</head>
<body>
<h1>Serena — Run <code>__RUN_ID__</code></h1>
<p id="summary" class="empty">Caricamento stato...</p>
<p><a class="report-link" href="/runs/__RUN_ID__/report">Apri report completo &rarr;</a></p>

<div class="grid">
  <div class="panel"><h2>Popolazione agenti per archetipo</h2><div id="chart-archetypes"></div></div>
  <div class="panel"><h2>Curva di equity</h2><div id="chart-equity"></div></div>
  <div class="panel"><h2>Classifica agenti (recency weight)</h2><div id="chart-leaderboard"></div></div>
  <div class="panel"><h2>Timeline segnale (independent consensus)</h2><div id="chart-signals"></div></div>
  <div class="panel"><h2>Distribuzione belief per agente</h2><div id="chart-beliefs"></div></div>
  <div class="panel"><h2>Confronto varianti backtest (Sharpe)</h2><div id="chart-variants"></div></div>
</div>

<script>
const RUN_ID = "__RUN_ID__";

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.json();
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const key in attrs) el.setAttribute(key, attrs[key]);
  return el;
}

function drawBarChart(containerId, entries) {
  const container = document.getElementById(containerId);
  if (!entries || entries.length === 0) { container.innerHTML = '<p class="empty">Nessun dato disponibile per questo run.</p>'; return; }
  const width = 320, height = 140, barGap = 6;
  const barWidth = (width / entries.length) - barGap;
  const maxValue = Math.max(...entries.map(e => Math.abs(e.value)), 1e-9);
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height + 16}` });
  entries.forEach((entry, i) => {
    const barHeight = Math.max(1, (Math.abs(entry.value) / maxValue) * height);
    const x = i * (barWidth + barGap);
    const y = height - barHeight;
    svg.appendChild(svgEl("rect", { x, y, width: barWidth, height: barHeight, class: "bar" }));
    const label = svgEl("text", { x: x + barWidth / 2, y: height + 12, class: "bar-label", "text-anchor": "middle" });
    label.textContent = String(entry.label).slice(0, 10);
    svg.appendChild(label);
  });
  container.innerHTML = "";
  container.appendChild(svg);
}

function drawLineChart(containerId, values) {
  const container = document.getElementById(containerId);
  if (!values || values.length < 2) { container.innerHTML = '<p class="empty">Dati insufficienti per un grafico (servono almeno 2 punti).</p>'; return; }
  const width = 320, height = 140;
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const range = (maxValue - minValue) || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - minValue) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}` });
  svg.appendChild(svgEl("polyline", { points, class: "line" }));
  container.innerHTML = "";
  container.appendChild(svg);
}

async function loadDashboard() {
  const summary = await getJSON(`/runs/${RUN_ID}/summary`);
  document.getElementById("summary").textContent = summary
    ? `Asset: ${summary.assets} · Agenti: ${summary.agent_count} · Round: ${summary.simulation_rounds} · Seed: ${summary.seed}`
    : "Nessun run_metadata.json per questo run.";

  const archetypes = await getJSON(`/runs/${RUN_ID}/charts/archetype_distribution`);
  drawBarChart("chart-archetypes", archetypes ? Object.entries(archetypes).map(([label, value]) => ({ label, value })) : []);

  const equity = await getJSON(`/runs/${RUN_ID}/charts/equity_curve`);
  drawLineChart("chart-equity", equity || []);

  const leaderboard = await getJSON(`/runs/${RUN_ID}/charts/leaderboard`);
  drawBarChart("chart-leaderboard", leaderboard ? leaderboard.map(e => ({ label: e.agent_id, value: e.recency_weight })) : []);

  const signalTimeline = await getJSON(`/runs/${RUN_ID}/charts/signal_timeline`);
  drawLineChart("chart-signals", signalTimeline ? signalTimeline.map(s => s.independent_consensus) : []);

  const beliefs = await getJSON(`/runs/${RUN_ID}/charts/belief_distribution`);
  drawBarChart("chart-beliefs", beliefs ? Object.entries(beliefs).map(([label, value]) => ({ label, value })) : []);

  const variants = await getJSON(`/runs/${RUN_ID}/charts/variant_comparison`);
  drawBarChart("chart-variants", variants ? variants.map(v => ({ label: v.variant, value: v.value })) : []);
}

loadDashboard();
</script>
</body>
</html>
"""


def render_dashboard_html(run_id: str) -> str:
    safe_run_id = html.escape(run_id)
    return _TEMPLATE.replace("__RUN_ID__", safe_run_id)
