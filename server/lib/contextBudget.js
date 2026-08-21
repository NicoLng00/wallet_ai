// Puro: nessuna chiamata di rete — taglia il context passato a Gemini con una priorita'
// dichiarata invece di lasciarlo crescere senza controllo. Testabile senza chiavi API.
//
// Priorita' (dalla piu' importante, mai tagliata per prima, alla meno importante):
//   1. segnale tecnico/fascia di validazione + rischio — mai troncati, sono il cuore della decisione
//   2. lezioni del Learning Loop — gia' filtrate per strategia attiva (vedi getActiveLessons),
//      tagliate solo se il budget e' quasi esaurito
//   3. evidenza Fundamental/Social (notizie, messaggi social) — la prima a saltare, e' sempre
//      stata dichiarata "qualitativa, mai un gate", quindi e' anche la meno costosa da perdere
//
// Il taglio agisce PER SIMBOLO nel context array, rimuovendo prima headlines/social del simbolo
// con il payload piu' grande, poi le lezioni, mai il segnale/rischio — finche' il JSON totale
// rientra nel budget o non c'e' piu' nulla di sacrificabile.
function contextSize(context) {
  return JSON.stringify(context).length;
}

// venomNewsAgent (pipeline venom, server/venomSupervisor.js) aggiunto qui invece di lasciarlo
// fuori: senza, il budget non avrebbe mai tagliato nulla nel context venom (nessun campo
// corrisponderebbe), restando silenziosamente inefficace se mai superasse maxChars — bug
// plausibile prevenuto, non ancora osservato davvero (13 simboli, oggi sotto soglia).
function trimmableFields(entry) {
  const fields = [];
  if (entry.fundamentalAgent?.headlines?.length) fields.push(['fundamentalAgent', 'headlines']);
  if (entry.socialSentimentAgent?.posts?.length) fields.push(['socialSentimentAgent', 'posts']);
  if (entry.venomNewsAgent?.headlines?.length) fields.push(['venomNewsAgent', 'headlines']);
  if (entry.venomCalendarAgent?.headlines?.length) fields.push(['venomCalendarAgent', 'headlines']);
  return fields;
}

export function buildBoundedContext(context, maxChars) {
  const entries = context.map((entry) => JSON.parse(JSON.stringify(entry))); // copia profonda, mai muta l'originale
  let size = contextSize(entries);
  let trimmedSymbols = [];
  if (size <= maxChars) return { context: entries, trimmed: false, trimmedSymbols, finalChars: size };

  // Passata 1: riduce notizie/social un elemento alla volta, dal simbolo con piu' evidenza,
  // finche' non rientra nel budget o non resta piu' nulla di tagliabile in questo strato.
  let progress = true;
  while (size > maxChars && progress) {
    progress = false;
    let target = null;
    let targetLen = -1;
    entries.forEach((entry) => {
      trimmableFields(entry).forEach(([agentKey, field]) => {
        const len = entry[agentKey][field].length;
        if (len > targetLen) { targetLen = len; target = { entry, agentKey, field }; }
      });
    });
    if (target && targetLen > 0) {
      target.entry[target.agentKey][target.field] = target.entry[target.agentKey][target.field].slice(0, -1);
      if (!trimmedSymbols.includes(target.entry.symbol)) trimmedSymbols.push(target.entry.symbol);
      progress = true;
      size = contextSize(entries);
    }
  }

  // Non esiste una "passata 2" che tagli le lezioni: technicalAgent.js le incorpora gia' nel
  // testo di thesis (non come lista separata nel context esterno) — tagliarle qui vorrebbe dire
  // troncare a metà frase un campo che deve restare leggibile, o cambiare il contratto di
  // technicalAgent.js solo per questo. Scelta deliberata: se il budget non basta nemmeno dopo
  // aver azzerato tutta l'evidenza fundamental/social, resta sopra soglia — segnale/rischio/tesi
  // tecnica non vengono mai troncati a rischio di renderli fuorvianti.
  return { context: entries, trimmed: trimmedSymbols.length > 0, trimmedSymbols, finalChars: size };
}
