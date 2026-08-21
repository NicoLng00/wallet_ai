// Widget grafico TradingView + overlay SL/TP — estratto da views.js perche' ora e' condiviso da
// index.html (SpiderMan) e venom.html (Venom, grafico del club selezionato dalla watchlist), non piu'
// esclusivo del sistema principale. Richiede Aurora.Models.activeSymbol/instruments/demoAccount e
// Aurora.Engine.widgetInterval (engine/market.js) gia' caricati.
window.Aurora = window.Aurora || {};
Aurora.Views = Aurora.Views || {};

Aurora.Views.renderTradingViewWidget = function renderTradingViewWidget() {
  const { $ } = Aurora.Utils;
  const instrument = Aurora.Models.instruments[Aurora.Models.activeSymbol];
  const target = $('tradingview-chart');
  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  const slot = document.createElement('div');
  slot.className = 'tradingview-widget-container__widget';
  const attribution = document.createElement('div');
  attribution.className = 'tradingview-widget-copyright';
  attribution.innerHTML = `<a href="https://www.tradingview.com/symbols/${instrument.tv.replace(':', '-')}/" rel="noopener nofollow" target="_blank">${instrument.tv} chart</a> by TradingView`;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.textContent = JSON.stringify({
    autosize: true,
    symbol: instrument.tv,
    interval: Aurora.Engine.widgetInterval(),
    timezone: 'Europe/Rome',
    theme: 'dark',
    style: '1',
    locale: 'it',
    allow_symbol_change: true,
    calendar: false,
    details: true,
    hotlist: false,
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    save_image: false,
    withdateranges: true,
    backgroundColor: '#0d1b2d',
    gridColor: 'rgba(126, 157, 189, 0.12)',
    support_host: 'https://www.tradingview.com'
  });
  script.addEventListener('load', () => { $('chart-live-status').textContent = 'Widget connesso'; });
  script.addEventListener('error', () => { $('chart-live-status').textContent = 'Widget non disponibile — verifica la connessione'; });
  wrapper.append(slot, attribution, script);
  target.replaceChildren(wrapper);
  $('chart-live-status').textContent = 'Connessione al grafico…';
  $('chart-symbol-label').textContent = instrument.tv;
  Aurora.Views.renderChartLevelsOverlay();
};

Aurora.Views.renderChartLevelsOverlay = function renderChartLevelsOverlay() {
  const { $, formatPrice, clamp } = Aurora.Utils;
  const overlay = $('chart-levels-overlay');
  const activeSymbol = Aurora.Models.activeSymbol;
  const position = Aurora.Models.demoAccount.positions[activeSymbol];
  if (!position || (!position.stopLoss && !position.takeProfit)) { overlay.innerHTML = ''; return; }
  const entry = position.averagePrice;
  const { stopLoss, takeProfit } = position;
  const levels = [entry, stopLoss, takeProfit].filter((value) => value !== null && value !== undefined);
  const spread = (Math.max(...levels) - Math.min(...levels)) || entry * 0.02;
  const margin = spread * 0.35;
  const rangeTop = Math.max(...levels) + margin;
  const rangeBottom = Math.min(...levels) - margin;
  const toPercent = (value) => clamp(((rangeTop - value) / (rangeTop - rangeBottom)) * 100, 4, 96);

  const lines = [{ type: 'entry', label: `Entry ${formatPrice(activeSymbol, entry)}`, value: entry }];
  if (stopLoss) lines.push({ type: 'sl', label: `SL ${formatPrice(activeSymbol, stopLoss)}`, value: stopLoss });
  if (takeProfit) lines.push({ type: 'tp', label: `TP ${formatPrice(activeSymbol, takeProfit)}`, value: takeProfit });

  overlay.innerHTML = lines
    .map((line) => `<div class="chart-level-line ${line.type}" style="top:${toPercent(line.value).toFixed(2)}%"><span class="chart-level-label">${line.label}</span></div>`)
    .join('') + '<div class="chart-levels-note">TP/SL indicativi — non allineati alla scala nativa del widget</div>';
};
