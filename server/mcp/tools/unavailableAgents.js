import { z } from 'zod';

const outputSchema = {
  available: z.boolean(),
  thesis: z.string(),
  confidence: z.number().nullable(),
  evidence: z.array(z.string()),
  risk_flags: z.array(z.string()),
  model_version: z.string().nullable()
};

function unavailableResult(reason) {
  return { available: false, thesis: reason, confidence: null, evidence: [], risk_flags: ['no-data-source'], model_version: null };
}

// Nessuna fonte dati reale (feed di regime/volatilità, order-flow, notizie/earnings,
// correlazioni) è oggi collegata gratuitamente. Meglio un tool esplicitamente vuoto che un
// giudizio inventato — coerente con il resto del progetto.
function makeUnavailableTool(name, title, reason) {
  return {
    name,
    config: { title, description: `${title}: nessuna fonte dati collegata in questa demo.`, inputSchema: {}, outputSchema },
    async handler() { return unavailableResult(reason); }
  };
}

// Fundamental (notizie reali Finnhub), Hedge (correlazione reale) e Market Regime (ATR reale,
// tools/marketRegimeAgent.js) sono ora implementati per davvero. Resta placeholder onesto solo
// Liquidity, per cui non esiste ancora una fonte dati gratuita di order-flow/spread.
export const liquidityAgentTool = makeUnavailableTool('liquidity', 'Liquidity Model', 'Nessun feed di order-flow/spread collegato nella demo attuale.');

export const auditSentinelAgentTool = {
  name: 'audit_sentinel',
  config: {
    title: 'Audit Sentinel',
    description: 'Prepara il record di decisione (timestamp, simbolo) per l\'audit trail.',
    inputSchema: { symbol: z.string() },
    outputSchema
  },
  async handler({ symbol }) {
    return {
      available: true,
      thesis: `Record di decisione predisposto per ${symbol}: input, fonti e esito verranno salvati nell'audit trail locale.`,
      confidence: null,
      evidence: [`as_of=${new Date().toISOString()}`],
      risk_flags: [],
      model_version: 'audit-v1'
    };
  }
};
