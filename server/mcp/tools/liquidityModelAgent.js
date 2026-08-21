import { z } from 'zod';

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

// Liquidity Model reale: fino ad oggi era l'unico placeholder onesto rimasto (vedi
// unavailableAgents.js) — nessun feed di order-flow/spread e' mai stato collegato gratis a questo
// progetto, e non lo e' nemmeno ora. Quello che PUO' essere calcolato onestamente dallo stesso
// storico OHLCV gia' scaricato (nessuna fonte nuova) e' un proxy di liquidita' reale basato sul
// volume: un titolo con volume medio molto basso ha spread piu' larghi e slippage peggiore
// nell'esecuzione reale, anche se il segnale tecnico e' corretto — informazione che il Technical
// Analyst da solo non porta mai. Nato per la pipeline venom (titoli calcistici europei, spesso
// molto meno liquidi delle blue chip USA), ma generico: nessuna dipendenza da venom in questo file.
export const liquidityModelAgentTool = {
  name: 'liquidity_model',
  config: {
    title: 'Liquidity Model',
    description: 'Proxy di liquidita\' reale (volume medio, volume recente vs baseline, giorni a volume anomalo) da candele OHLCV — mai un gate quantitativo, solo evidenza di rischio esecuzione.',
    inputSchema: {
      symbol: z.string(),
      candles: z.array(z.object({ close: z.number(), volume: z.number().nullable().optional() })).default([])
    },
    outputSchema: {
      available: z.boolean(), thesis: z.string(), confidence: z.number().nullable(),
      evidence: z.array(z.string()), risk_flags: z.array(z.string()), model_version: z.string().nullable()
    }
  },
  async handler({ symbol, candles }) {
    const withVolume = (candles || []).filter((c) => Number.isFinite(c.volume) && c.volume >= 0);
    if (withVolume.length < 30) return unavailable(`Volume insufficiente nello storico di ${symbol} per stimare la liquidita' (servono almeno 30 barre con volume).`);

    const BASELINE_WINDOW = 30;
    const RECENT_WINDOW = 5;
    const baseline = withVolume.slice(-(BASELINE_WINDOW + RECENT_WINDOW), -RECENT_WINDOW);
    const recent = withVolume.slice(-RECENT_WINDOW);
    const baselineAvg = average(baseline.map((c) => c.volume));
    const recentAvg = average(recent.map((c) => c.volume));
    if (!baselineAvg || baselineAvg <= 0) return unavailable(`Volume medio nullo o non calcolabile per ${symbol}.`);

    // Soglie di liquidita' assoluta arbitrarie ma dichiarate, non tarate su nessun risultato di
    // backtest (evitare lo stesso errore di data-snooping gia' scartato altrove nel progetto per i
    // parametri di strategia): sotto 10.000 di volume medio, l'esecuzione reale di un ordine anche
    // piccolo puo' muovere il prezzo in modo non trascurabile — soglia di buon senso per small/micro
    // cap, non misurata.
    const ILLIQUID_THRESHOLD = 10000;
    const isIlliquid = baselineAvg < ILLIQUID_THRESHOLD;
    const zeroVolumeDays = baseline.filter((c) => c.volume === 0).length;

    const volumeRatio = recentAvg / baselineAvg;
    const risk_flags = [];
    if (isIlliquid) risk_flags.push('illiquid');
    if (zeroVolumeDays > 0) risk_flags.push('zero-volume-days');
    if (volumeRatio >= 2.5) risk_flags.push('volume-spike');
    else if (volumeRatio <= 0.4) risk_flags.push('volume-drought');

    const parts = [
      `Volume medio ${Math.round(baselineAvg).toLocaleString('it-IT')}/giorno (${isIlliquid ? 'poco liquido' : 'liquidita\' adeguata'})`,
      `ultimi ${RECENT_WINDOW} giorni ${volumeRatio >= 1 ? '+' : ''}${((volumeRatio - 1) * 100).toFixed(0)}% rispetto alla media`
    ];
    if (zeroVolumeDays > 0) parts.push(`${zeroVolumeDays} giorni a volume zero negli ultimi ${BASELINE_WINDOW}`);

    return {
      available: true,
      thesis: `${symbol}: ${parts.join(', ')}. ${isIlliquid ? 'Spread e slippage attesi peggiori del normale — dimensionare con cautela anche a fronte di un segnale tecnico valido.' : 'Nessun problema di liquidita\' rilevato.'}`,
      confidence: null,
      evidence: [`baselineAvgVolume=${Math.round(baselineAvg)}`, `recentAvgVolume=${Math.round(recentAvg)}`, `volumeRatio=${volumeRatio.toFixed(2)}`, `zeroVolumeDays=${zeroVolumeDays}`],
      risk_flags,
      model_version: 'liquidity-volume-proxy-v1'
    };
  }
};
