import { z } from 'zod';

// Consultivo soltanto: il vero gate che autorizza un ordine resta il Risk Engine
// deterministico lato client (src/engine/riskGate.js), eseguito dopo la risposta del
// modello. Questo tool riceve un istantanea del conto e produce solo una tesi/evidenza.
export const riskManagerAgentTool = {
  name: 'risk_manager',
  config: {
    title: 'Risk Manager',
    description: 'Valuta esposizione, drawdown e slot posizione liberi del conto demo. Solo consultivo.',
    inputSchema: {
      equity: z.number(),
      cash: z.number(),
      exposurePercent: z.number(),
      drawdownPercent: z.number(),
      maxExposurePercent: z.number(),
      maxDrawdownPercent: z.number(),
      openPositions: z.number(),
      maxConcurrentPositions: z.number()
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
  async handler({ equity, cash, exposurePercent, drawdownPercent, maxExposurePercent, maxDrawdownPercent, openPositions, maxConcurrentPositions }) {
    const killSwitch = drawdownPercent >= maxDrawdownPercent;
    const slotsFree = maxConcurrentPositions - openPositions;
    return {
      available: true,
      thesis: killSwitch
        ? 'Kill switch drawdown attivo: nessun nuovo ingresso ammesso su nessun titolo.'
        : `Esposizione ${exposurePercent.toFixed(1)}% / ${maxExposurePercent}% massimo, drawdown ${drawdownPercent.toFixed(1)}%, ${slotsFree} slot posizione liberi su ${maxConcurrentPositions}.`,
      confidence: null,
      evidence: [`equity=${equity.toFixed(2)}`, `cash=${cash.toFixed(2)}`, `exposure=${exposurePercent.toFixed(1)}%`, `drawdown=${drawdownPercent.toFixed(1)}%`, `openPositions=${openPositions}`],
      risk_flags: killSwitch ? ['drawdown-kill-switch'] : slotsFree <= 0 ? ['positions-at-capacity'] : [],
      model_version: 'risk-gate-v1'
    };
  }
};
