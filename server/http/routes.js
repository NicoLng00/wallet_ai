import { Router } from 'express';
import { generateDecision } from '../supervisor.js';
import { generateVenomDecision } from '../venomSupervisor.js';
import { AGENT_TOOL_NAMES } from '../mcp/server.js';
import { VENOM_AGENT_TOOL_NAMES } from '../mcp/venomServer.js';
import { fetchYahooDailyHistory, fetchYahooIntradayHistory, yahooTickerFor } from '../marketData.js';
import { resolveDailyRange, resolveIntradayInterval, resolveIntradayRange } from '../lib/rangeResolvers.js';

export const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, agentTools: AGENT_TOOL_NAMES, venomAgentTools: VENOM_AGENT_TOOL_NAMES });
});

// Storico reale piu' lungo per simboli non-crypto (azioni/ETF/materie prime), proxato lato server
// solo perche' Yahoo Finance non espone CORS al browser — nessuna chiave utente richiesta.
router.get('/history', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!yahooTickerFor(symbol)) {
      res.status(404).json({ error: `Nessuna fonte storica configurata per "${symbol}".` });
      return;
    }
    const range = resolveDailyRange(req.query.range);
    const history = await fetchYahooDailyHistory(symbol, range);
    res.json(history);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Errore nel recupero dello storico.' });
  }
});

// Storico intraday (30 minuti), unico consumatore la strategia orb_breakout — vedi marketData.js
// per il perche' del limite di lookback (~60 giorni, molto piu' corto dello storico giornaliero).
router.get('/intraday', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!yahooTickerFor(symbol)) {
      res.status(404).json({ error: `Nessuna fonte storica configurata per "${symbol}".` });
      return;
    }
    const interval = resolveIntradayInterval(req.query.interval);
    const range = resolveIntradayRange(req.query.range);
    const history = await fetchYahooIntradayHistory(symbol, interval, range);
    res.json(history);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Errore nel recupero dello storico intraday.' });
  }
});

// Corpo atteso: { providerId, apiKey?, finnhubKey?, symbols: [...], marketContext: { [symbol]: { price, changePercent, closes, validated, confidenceHint } }, risk: {...}, heldPositions?: [...] }
// apiKey è opzionale: se assente si usa GEMINI_API_KEY da server/.env (solo comodo per test da terminale).
// finnhubKey è opzionale: senza, l'agente Fundamental resta onestamente non disponibile.
router.post('/agent-decision', async (req, res) => {
  try {
    const { providerId = 'gemini', apiKey, finnhubKey, symbols, marketContext, risk, heldPositions } = req.body || {};
    if (!Array.isArray(symbols) || !symbols.length) {
      res.status(400).json({ error: 'symbols deve essere un array non vuoto.' });
      return;
    }
    if (!marketContext || typeof marketContext !== 'object') {
      res.status(400).json({ error: 'marketContext mancante.' });
      return;
    }
    const resolvedKey = apiKey || (providerId === 'gemini' ? process.env.GEMINI_API_KEY : null);
    if (!resolvedKey) {
      res.status(400).json({ error: `Nessuna chiave disponibile per il provider "${providerId}". Inseriscila in Impostazioni o in server/.env.` });
      return;
    }
    const result = await generateDecision({
      providerId, apiKey: resolvedKey, finnhubKey: finnhubKey || null, symbols, marketContext, risk: risk || {}, heldPositions: heldPositions || []
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Errore interno del backend.' });
  }
});

// Gemello di /agent-decision per la pipeline venom: stessa forma di richiesta/risposta, un solo
// provider (Gemini — venom non ha ancora un'interfaccia multi-provider come il sistema
// principale, non serve finche' non esiste un secondo provider reale da selezionare). Chiave
// dedicata: VENOM_GEMINI_API_KEY se configurata su server/.env o come secret, altrimenti ricade
// su GEMINI_API_KEY (la stessa del sistema principale) — MAI un errore se la chiave dedicata
// manca mentre quella condivisa e' disponibile, coerente con "non si butta via nulla".
router.post('/venom-agent-decision', async (req, res) => {
  try {
    const { apiKey, symbols, marketContext, risk, heldPositions } = req.body || {};
    if (!Array.isArray(symbols) || !symbols.length) {
      res.status(400).json({ error: 'symbols deve essere un array non vuoto.' });
      return;
    }
    if (!marketContext || typeof marketContext !== 'object') {
      res.status(400).json({ error: 'marketContext mancante.' });
      return;
    }
    const resolvedKey = apiKey || process.env.VENOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!resolvedKey) {
      res.status(400).json({ error: 'Nessuna chiave Gemini disponibile per venom (VENOM_GEMINI_API_KEY o GEMINI_API_KEY in server/.env).' });
      return;
    }
    const result = await generateVenomDecision({
      apiKey: resolvedKey, symbols, marketContext, risk: risk || {}, heldPositions: heldPositions || []
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Errore interno del backend venom.' });
  }
});
