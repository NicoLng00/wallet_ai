// Configurazione locale del frontend. Nessun segreto qui — solo l'indirizzo del backend
// locale (server/), che deve essere avviato separatamente con `npm start` in quella cartella.
window.Aurora = window.Aurora || {};
Aurora.Config = {
  backendUrl: 'http://localhost:8787'
};
