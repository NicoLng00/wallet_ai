import { callGemini } from './gemini.js';

function providerTemplate(id, label) {
  return {
    id, label, costTier: 'paid', keySource: 'server-env', requiresKey: true, implemented: false,
    async call() { throw new Error(`Provider "${id}" non ancora implementato: solo interfaccia predisposta.`); }
  };
}

// Interfaccia comune per un provider AI pluggable. Oggi solo Gemini è reale (gratuito).
// Un provider a pagamento userà keySource:'server-env' — la chiave vive SOLO in server/.env,
// non transita mai nel browser. Questo backend è esattamente il posto sicuro che mancava
// quando abbiamo scartato Anthropic per il rischio di esporre una chiave a pagamento lato client.
export const providerRegistry = {
  gemini: {
    id: 'gemini', label: 'Google Gemini', costTier: 'free', keySource: 'client', requiresKey: true, implemented: true,
    async call({ apiKey, context }) { return callGemini({ apiKey, context }); }
  },
  anthropic: providerTemplate('anthropic', 'Anthropic Claude'),
  openaiCompatible: providerTemplate('openai-compatible', 'OpenAI-compatible')
};
