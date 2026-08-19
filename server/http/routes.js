import { Router } from 'express';
import { generateDecision } from '../supervisor.js';
import { AGENT_TOOL_NAMES } from '../mcp/server.js';
import { fetchYahooDailyHistory, fetchYahooIntradayHistory, yahooTickerFor } from '../marketData.js';

export const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, agentTools: AGENT_TOOL_NAMES });
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
    const range = ['1y', '2y', '5y'].includes(req.query.range) ? req.query.range : '2y';
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
    const interval = ['30m', '15m', '5m'].includes(req.query.interval) ? req.query.interval : '30m';
    const range = ['5d', '30d', '60d'].includes(req.query.range) ? req.query.range : '60d';
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
