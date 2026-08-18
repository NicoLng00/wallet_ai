import 'dotenv/config';
import express from 'express';
import { router } from './http/routes.js';

const PORT = process.env.PORT || 8787;

const app = express();
app.use(express.json({ limit: '1mb' }));

// Backend locale di sviluppo per un'app statica servita da file:// o da un server statico
// qualunque: CORS aperto perché gira solo su localhost e non gestisce mai denaro reale.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use('/api', router);

app.listen(PORT, () => {
  console.log(`Aurora Markets backend MCP in ascolto su http://localhost:${PORT}`);
  console.log('Nessun ordine reale, nessun broker: solo orchestrazione agenti + provider AI.');
});
