import { z } from 'zod';

function unavailable(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// Il frontend gestisce una libreria di piu' strategie/timeframe (engine/strategies.js), ciascuna
// validata walk-forward o marcata "esplorativa" (edge in-sample promettente, campione fuori
// campione ancora insufficiente per confermare o smentire — engine/rules.js). Questo tool non
// ricalcola nulla: riceve il verdetto gia' verificato dal client e lo formatta come evidenza,
// dichiarando sempre esplicitamente se e' validato o solo esplorativo — mai spacciato per l'altro.
export const technicalAgentTool = {
  name: 'technical_analyst',
  config: {
    title: 'Technical Analyst',
    description: 'Riporta il verdetto della strategia (validata o esplorativa) con lo score piu\' alto per questo simbolo, gia\' selezionata dal client.',
    inputSchema: {
      symbol: z.string(),
      validated: z.boolean().default(false),
      tier: z.string().nullable().optional(),
      strategyLabel: z.string().nullable().optional(),
      timeframe: z.string().nullable().optional(),
      bullish: z.boolean().default(false),
      confidenceHint: z.number().nullable().optional(),
      lessons: z.array(z.string()).default([]),
      confluence: z.array(z.string()).default([])
    },
    outputSchema: {
      available: z.boolean(),
      thesis: z.string(),
      confidence: z.number().nullable(),
      evidence: z.array(z.string()),
      risk_flags: z.array(z.string()),
      model_version: z.string().nullable()
    }
  },
  async handler({ symbol, validated, tier, strategyLabel, timeframe, bullish, confidenceHint, lessons, confluence }) {
    if (!strategyLabel) return unavailable(`Nessuna strategia validata, esplorativa né sonda per ${symbol}: nessuna tesi tecnica disponibile.`);
    const tierLabel = tier === 'exploratory' ? 'ESPLORATIVA (non ancora confermata fuori campione)'
      : tier === 'probe' ? 'SONDA (nessun edge misurato, la meno peggio tra le strategie scartate, taglia minima)'
      : 'validata (in-sample e out-of-sample)';
    const lessonsText = lessons?.length ? ` Lezioni da trade passati con questa strategia: ${lessons.join(' | ')}` : '';
    // Confluenza multi-timeframe: altre strategie/timeframe validati/esplorativi sullo stesso
    // simbolo, oltre a quella scelta — mai un secondo gate, solo contesto per il giudizio finale.
    const confluenceText = confluence?.length ? ` Altre letture valide sullo stesso simbolo: ${confluence.join(' | ')}.` : '';
    return {
      available: true,
      thesis: (bullish
        ? `${strategyLabel} (${timeframe}), strategia ${tierLabel}: setup favorevole a breve termine.`
        : `${strategyLabel} (${timeframe}), strategia ${tierLabel}: condizioni non allineate per un ingresso long in questo momento.`) + lessonsText + confluenceText,
      confidence: Number.isFinite(confidenceHint) ? confidenceHint : 50,
      evidence: [`strategy=${strategyLabel}`, `timeframe=${timeframe}`, `tier=${tier}`, `bullish=${bullish}`, ...(lessons || []), ...(confluence || [])],
      risk_flags: tier === 'exploratory' ? ['exploratory-tier'] : tier === 'probe' ? ['probe-tier-no-measured-edge'] : [],
      model_version: strategyLabel || null
    };
  }
};
