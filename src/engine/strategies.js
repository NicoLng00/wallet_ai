// Libreria di strategie candidate. Ognuna riceve un contesto { closes, candles } (candles puo'
// essere null se non disponibile) e restituisce 'bullish'|'neutral'. Nessuna strategia qui
// autorizza da sola un trade: ognuna deve prima superare runSplitBacktest/passesEdgeGate
// (in-sample E out-of-sample) nella sezione Research prima di poter alimentare un segnale —
// stessa disciplina di sempre, solo su piu' fonti indipendenti di edge invece di una sola.
window.Aurora = window.Aurora || {};
Aurora.Engine = Aurora.Engine || {};

Aurora.Engine.STRATEGIES = {
  sma_rsi: {
    id: 'sma_rsi',
    label: 'SMA50/RSI14 (trend)',
    requiresOhlc: false,
    signal({ closes }) {
      const sma = Aurora.Engine.computeSMA(closes, 50);
      const rsi = Aurora.Engine.computeRSI(closes, 14);
      if (sma === null || rsi === null) return 'neutral';
      const price = closes[closes.length - 1];
      return price > sma && rsi >= 40 && rsi <= 70 ? 'bullish' : 'neutral';
    }
  },
  macd_cross: {
    id: 'macd_cross',
    label: 'MACD crossover (12/26/9)',
    requiresOhlc: false,
    signal({ closes }) {
      const macd = Aurora.Engine.computeMACD(closes);
      if (!macd) return 'neutral';
      return macd.histogram > 0 ? 'bullish' : 'neutral';
    }
  },
  bollinger_reversion: {
    id: 'bollinger_reversion',
    label: 'Bollinger mean-reversion (20,2σ)',
    requiresOhlc: false,
    signal({ closes }) {
      const bands = Aurora.Engine.computeBollingerBands(closes, 20, 2);
      if (!bands) return 'neutral';
      const price = closes[closes.length - 1];
      return price < bands.lower ? 'bullish' : 'neutral';
    }
  },
  donchian_breakout: {
    id: 'donchian_breakout',
    label: 'Donchian breakout (20)',
    requiresOhlc: false,
    signal({ closes }) {
      const donchianHigh = Aurora.Engine.computeDonchianHigh(closes, 20);
      if (donchianHigh === null) return 'neutral';
      const price = closes[closes.length - 1];
      return price > donchianHigh ? 'bullish' : 'neutral';
    }
  },
  volume_breakout: {
    id: 'volume_breakout',
    label: 'Breakout confermato da volume (20)',
    requiresOhlc: true,
    // Ipotesi diversa dal semplice donchian_breakout: un nuovo massimo su volume DEBOLE e' spesso
    // un falso breakout (pochi partecipanti reali) — qui serve anche un volume sopra la propria
    // media recente, a conferma che il movimento e' sostenuto. Dato (volume) gia' incluso gratis
    // in ogni fonte usata dal progetto, prima semplicemente scartato senza motivo.
    signal({ closes, candles }) {
      const donchianHigh = Aurora.Engine.computeDonchianHigh(closes, 20);
      const avgVolume = Aurora.Engine.computeAverageVolume(candles, 20);
      if (donchianHigh === null || avgVolume === null) return 'neutral';
      const price = closes[closes.length - 1];
      const todayVolume = candles[candles.length - 1]?.volume;
      if (!Number.isFinite(todayVolume)) return 'neutral';
      return price > donchianHigh && todayVolume > avgVolume ? 'bullish' : 'neutral';
    }
  },
  // Strategia custom: invece di una singola famiglia di indicatori (le altre in questo file usano
  // solo trend, o solo momentum, o solo volatilita'), richiede l'ACCORDO di tre famiglie
  // indipendenti insieme — trend (SMA50), momentum (istogramma MACD positivo) e un filtro contro
  // l'ingresso su un movimento gia' esaurito (RSI in una fascia piu' stretta di sma_rsi, 45-65
  // invece di 40-70, e prezzo sotto la banda di Bollinger superiore). Ipotesi: meno segnali ma
  // ciascuno confermato da piu' angolazioni indipendenti dovrebbe reggere meglio fuori campione
  // di un singolo indicatore preso da solo — DA VERIFICARE con lo stesso identico gate
  // walk-forward di ogni altra strategia qui, nessuna scorciatoia perche' e' quella "nostra".
  hybrid_confluence: {
    id: 'hybrid_confluence',
    label: 'Ibrido custom: trend + momentum + filtro esaurimento',
    requiresOhlc: false,
    signal({ closes }) {
      const sma = Aurora.Engine.computeSMA(closes, 50);
      const rsi = Aurora.Engine.computeRSI(closes, 14);
      const macd = Aurora.Engine.computeMACD(closes);
      const bands = Aurora.Engine.computeBollingerBands(closes, 20, 2);
      if (sma === null || rsi === null || !macd || !bands) return 'neutral';
      const price = closes[closes.length - 1];
      const trendOk = price > sma;
      const momentumOk = macd.histogram > 0;
      const notOverextended = rsi >= 45 && rsi <= 65 && price < bands.upper;
      return trendOk && momentumOk && notOverextended ? 'bullish' : 'neutral';
    }
  },
  orb_breakout: {
    id: 'orb_breakout',
    label: 'ORB — Opening Range Breakout (30min, apertura NY)',
    requiresOhlc: true,
    requiresIntraday: true,
    // Eccezione dichiarata alla convenzione "un'ipotesi pulita per strategia" seguita dal resto di
    // questo file: qui l'utente ha chiesto esplicitamente di combinare quattro condizioni in
    // un'unica regola, non separarle. (1) rottura del massimo dei primi 30 minuti (barra 09:30 NY),
    // (2) conferma: la barra SUCCESSIVA deve chiudere ancora sopra il livello (non solo un'ombra),
    // (3) ritest: solo dopo la conferma, una barra deve tornare a toccare il livello (minimo <=
    // livello) senza chiudervi sotto — evita di inseguire il primo strappo, aspetta il pullback,
    // (4) filtro sull'ampiezza: il range di oggi deve stare tra 0.5x e 2x la media delle ampiezze
    // dei giorni precedenti — scarta aperture anomale (troppo piatte = rumore, troppo ampie = mossa
    // gia' esaurita). Se la prima rottura non si conferma subito, il setup e' scartato per la
    // giornata (nessun tentativo di inseguire rotture successive — disciplina intenzionale, non un
    // limite tecnico). Target/stop NON sono l'ATR generico delle altre strategie: sono un multiplo
    // dell'ampiezza dell'opening range stesso, gestiti a parte in engine/autopilot.js
    // (computeStopTarget) perche' qui il contratto signal() resta 'bullish'|'neutral'.
    signal({ candles }) {
      if (!candles || candles.length < 20) return 'neutral';
      const timeZone = 'America/New_York';
      const days = Aurora.Engine.groupCandlesByLocalDay(candles, timeZone);
      if (days.length < 6) return 'neutral';
      const today = days[days.length - 1];
      const opening = Aurora.Engine.findOpeningRangeBar(today.bars, timeZone);
      if (!opening) return 'neutral';
      const rangeHigh = opening.bar.high;
      const rangeLow = opening.bar.low;
      const rangeWidth = rangeHigh - rangeLow;
      if (!(rangeWidth > 0)) return 'neutral';

      const priorDays = days.slice(Math.max(0, days.length - 11), days.length - 1);
      const priorWidths = priorDays
        .map((day) => Aurora.Engine.findOpeningRangeBar(day.bars, timeZone))
        .filter(Boolean)
        .map((o) => o.bar.high - o.bar.low)
        .filter((w) => w > 0);
      if (priorWidths.length < 4) return 'neutral';
      const avgWidth = priorWidths.reduce((sum, w) => sum + w, 0) / priorWidths.length;
      if (rangeWidth < avgWidth * 0.5 || rangeWidth > avgWidth * 2) return 'neutral';

      const afterOpening = today.bars.slice(opening.index + 1);
      let breakoutSeen = false;
      let confirmed = false;
      for (let i = 0; i < afterOpening.length; i += 1) {
        const bar = afterOpening[i];
        if (!breakoutSeen) {
          if (bar.close > rangeHigh) breakoutSeen = true;
          continue;
        }
        if (!confirmed) {
          if (bar.close > rangeHigh) confirmed = true;
          else return 'neutral'; // rottura non confermata subito: scartata per oggi
          continue;
        }
        if (bar.low <= rangeHigh && bar.close >= rangeHigh) return 'bullish'; // ritest riuscito
        if (bar.close < rangeHigh) return 'neutral'; // richiuso sotto prima del ritest: invalidato
      }
      return 'neutral'; // sequenza non ancora completata su questa barra
    }
  },
  engulfing: {
    id: 'engulfing',
    label: 'Pattern Engulfing (candela)',
    requiresOhlc: true,
    signal({ candles }) {
      if (!candles || candles.length < 2) return 'neutral';
      return Aurora.Engine.detectEngulfing(candles) === 'bullish' ? 'bullish' : 'neutral';
    }
  }
};

// Retro-compatibilita': smaRsiRule resta disponibile come alias della strategia sma_rsi con la
// vecchia firma a solo-closes, usata da eventuali test/script che non passano ancora un contesto.
Aurora.Engine.smaRsiRule = function smaRsiRule(closesSoFar) {
  return Aurora.Engine.STRATEGIES.sma_rsi.signal({ closes: closesSoFar, candles: null });
};

// Fabbrica di regole SMA/RSI parametrizzate — usata dalla ricerca walk-forward per confrontare varianti.
Aurora.Engine.makeRule = function makeRule(smaPeriod, rsiPeriod, low, high) {
  return ({ closes }) => {
    const sma = Aurora.Engine.computeSMA(closes, smaPeriod);
    const rsi = Aurora.Engine.computeRSI(closes, rsiPeriod);
    if (sma === null || rsi === null) return 'neutral';
    const price = closes[closes.length - 1];
    return price > sma && rsi >= low && rsi <= high ? 'bullish' : 'neutral';
  };
};
