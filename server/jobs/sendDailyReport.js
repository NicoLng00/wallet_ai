// Job "report giornaliero": una volta al giorno, dopo la chiusura dei mercati coperti da entrambi i
// sistemi, aggrega lo stato reale di SpiderMan (data/account.json + data/research.json) e Venom
// (data/venom/*.json) in un'unica email via EmailJS. Puramente di lettura: non scrive mai in data/*,
// nessun conflitto possibile con gli altri job schedulati.
import { readAccountState as readSpidermanAccount, readResearchState as readSpidermanResearch } from './lib/stateStore.js';
import { readAccountState as readVenomAccount, readResearchState as readVenomResearch } from './lib/venomStateStore.js';
import { buildDailyReport } from '../lib/dailyReportData.js';
import { renderDailyReportHtml } from '../lib/dailyReportTemplate.js';
import { sendDailyReportEmail } from '../lib/emailSender.js';

const SITE_BASE_URL = 'https://nicolng00.github.io/wallet_ai';
const DEFAULT_RECIPIENT = 'nico.longobardi00@gmail.com';

async function main() {
  const spidermanAccount = readSpidermanAccount();
  const spidermanResearch = readSpidermanResearch();
  const venomAccount = readVenomAccount();
  const venomResearch = readVenomResearch();

  const now = new Date();
  const report = buildDailyReport({
    spiderman: spidermanAccount.demoAccount ? { account: spidermanAccount, research: spidermanResearch } : null,
    venom: venomAccount.demoAccount ? { account: venomAccount, research: venomResearch } : null,
    sinceIso: new Date(now.getTime() - 24 * 3600000).toISOString(),
    generatedAtIso: now.toISOString()
  });

  const html = renderDailyReportHtml(report, { siteBaseUrl: SITE_BASE_URL });

  const config = {
    serviceId: process.env.EMAILJS_SERVICE_ID || null,
    templateId: process.env.EMAILJS_TEMPLATE_ID || null,
    publicKey: process.env.EMAILJS_PUBLIC_KEY || null,
    privateKey: process.env.EMAILJS_PRIVATE_KEY || null
  };
  const toEmail = process.env.REPORT_TO_EMAIL || DEFAULT_RECIPIENT;

  await sendDailyReportEmail({ html, generatedAt: report.generatedAt, toEmail, config });
  console.log(`Report giornaliero inviato a ${toEmail}. SpiderMan: ${report.spiderman ? 'presente' : 'assente'}. Venom: ${report.venom ? 'presente' : 'assente'}.`);
}

main().catch((error) => {
  console.error('Invio del report giornaliero fallito:', error.message);
  process.exit(1);
});
