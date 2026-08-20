// Utility pure, senza stato — riutilizzate da ogni altro modulo.
window.Aurora = window.Aurora || {};

Aurora.Utils = {
  $(id) { return document.getElementById(id); },
  clamp(value, low, high) { return Math.min(high, Math.max(low, value)); },
  formatMoney(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: value >= 1000 ? 0 : 2
    }).format(value);
  },
  // Bug reale trovato testando EURUSD: formatMoney arrotonda sempre a 2 decimali, quindi entry
  // (1,1609) e stop loss (1,1563) di una posizione EURUSD reale apparivano ENTRAMBI "1,16 €" —
  // indistinguibili a vista pur essendo prezzi diversi. Per un tasso di cambio la terza/quarta
  // cifra decimale (un "pip") e' un movimento reale, non rumore di arrotondamento — a differenza
  // di un importo in cassa/notional, che deve restare a 2 decimali (quello resta formatMoney).
  // Usare SOLO per il prezzo di quotazione di uno strumento, mai per cassa/notional/P&L.
  formatPrice(symbol, value) {
    const isFxRate = Aurora.Models?.FX_RATE_SYMBOLS?.has(symbol);
    if (!isFxRate) return Aurora.Utils.formatMoney(value);
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
  }
};
