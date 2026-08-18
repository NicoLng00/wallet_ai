// Utility pure, senza stato — riutilizzate da ogni altro modulo.
window.Aurora = window.Aurora || {};

Aurora.Utils = {
  $(id) { return document.getElementById(id); },
  clamp(value, low, high) { return Math.min(high, Math.max(low, value)); },
  formatMoney(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: value >= 1000 ? 0 : 2, maximumFractionDigits: value >= 1000 ? 0 : 2
    }).format(value);
  }
};
