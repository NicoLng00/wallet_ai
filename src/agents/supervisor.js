// Supervisor lato client: decide il segnale finale per un simbolo. L'orchestrazione REALE dei
// 9 agenti (via MCP) vive ora in server/ (server/supervisor.js) quando la modalita' AI e' attiva
// — questo file resta il punto unico da cui la UI/Autopilot chiedono "qual e' il segnale adesso".
//
// Invariante non negoziabile ereditato da ARCHITECTURE.md: nessun agente o modello puo'
// autorizzare da solo un'esecuzione. L'unico gate che conta e' engine/riskGate.js (orderRisk),
// eseguito dopo qualunque risposta del modello.
window.Aurora = window.Aurora || {};
Aurora.Agents = Aurora.Agents || {};

Aurora.Agents.supervisor = {
  // Decisione finale per un simbolo. In modalità regola tecnica, usa direttamente il pool di
  // strategie validate (engine/rules.js). In modalità AI (Gemini via backend), incrocia il
  // giudizio del modello con l'edge validato quando disponibile: un giudizio del modello che
  // contraddice un edge validato viene bloccato, l'accordo tra i due rafforza lo score.
  signalFor(symbol) {
    const aiEngine = Aurora.Models.aiEngine;
    if (aiEngine.mode === 'gemini') {
      const cached = Aurora.Models.geminiSignals[symbol];
      if (!cached) return { score: 50, confidence: 45, bullish: false, defensive: false, rationale: null };
      const rule = Aurora.Engine.ruleSignalFor(symbol);
      const conflictsWithValidatedRule = rule.validated && cached.bullish && !rule.bullish;
      const confirmedByValidatedRule = rule.validated && cached.bullish && rule.bullish;
      const bullish = cached.bullish && !conflictsWithValidatedRule;
      const score = Math.round(Aurora.Utils.clamp(
        bullish ? 50 + cached.confidence * (confirmedByValidatedRule ? 0.35 : 0.3) : 50 - cached.confidence * 0.3,
        20, 80
      ));
      let rationale = cached.rationale;
      if (conflictsWithValidatedRule) rationale = `${cached.rationale} — bloccato: in conflitto con la regola tecnica validata su questo titolo.`;
      else if (confirmedByValidatedRule) rationale = `${cached.rationale} — confermato dalla regola tecnica validata su questo titolo.`;
      // Il Learning Loop puo' attribuire l'episodio a una strategia solo quando il giudizio Gemini
      // e' confermato da una regola tecnica validata — un giudizio puramente del modello non ha
      // una strategia deterministica a cui essere onestamente ricondotto.
      return {
        score, confidence: cached.confidence, bullish, defensive: cached.defensive, rationale,
        tier: confirmedByValidatedRule ? 'validated' : null,
        candidateKey: confirmedByValidatedRule ? rule.candidateKey : null,
        timeframe: confirmedByValidatedRule ? rule.timeframe : null,
        volatilityRegime: confirmedByValidatedRule ? rule.volatilityRegime : null
      };
    }
    return Aurora.Engine.ruleSignalFor(symbol);
  }
};
