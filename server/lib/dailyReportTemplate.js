// Template HTML per il report giornaliero via email — puro (nessuna rete/filesystem), prende in
// ingresso l'output di dailyReportData.js. Deliberatamente table-based con stili SOLO inline
// (mai <style> in testa, mai CSS grid/flexbox): i client email (Outlook su Windows soprattutto)
// non supportano il CSS moderno usato nel resto del progetto (styles.css) - questo NON e' lo
// stesso file, e' un documento HTML a se', pensato per essere letto in una casella di posta, non
// in un browser.
const COLORS = {
  bg: '#07111f', card: '#0d1b2d', cardBorder: '#1c3049', text: '#eaf2fb', muted: '#8090a7',
  spiderman: '#3b89ed', venom: '#b58cff', green: '#3ad59f', red: '#ff6d7b', amber: '#f3bb68'
};

function money(value) {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(2)} €`;
}
function signedMoney(value) {
  return `${value >= 0 ? '+' : ''}${money(value)}`;
}
function tone(value) {
  return value >= 0 ? COLORS.green : COLORS.red;
}
function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function systemCard({ name, accent, data, dashboardUrl }) {
  if (!data) {
    return `
    <tr><td style="padding:18px 20px;background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:10px;">
      <p style="margin:0;font:600 14px Manrope,Arial,sans-serif;color:${accent};">${esc(name)}</p>
      <p style="margin:8px 0 0;font:13px Manrope,Arial,sans-serif;color:${COLORS.muted};">Nessun dato disponibile — il bot autonomo non ha ancora prodotto uno stato per questo sistema.</p>
    </td></tr>`;
  }
  const { equity, trades, validated, activity } = data;
  const topValidated = validated.slice(0, 3);
  return `
  <tr><td style="padding:0 0 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:10px;">
      <tr><td style="padding:18px 20px 14px;border-bottom:1px solid ${COLORS.cardBorder};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:700 15px Manrope,Arial,sans-serif;color:${accent};">${esc(name)}</td>
          <td align="right" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">${data.symbolCount} simboli monitorati</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="33%" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">EQUITY<br/><span style="font:600 18px 'DM Mono',Consolas,monospace;color:${COLORS.text};">${money(equity.equity)}</span></td>
          <td width="33%" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">DRAWDOWN<br/><span style="font:600 18px 'DM Mono',Consolas,monospace;color:${equity.drawdownPercent > 5 ? COLORS.amber : COLORS.text};">${Math.max(0, equity.drawdownPercent).toFixed(1)}%</span></td>
          <td width="34%" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">POSIZIONI APERTE<br/><span style="font:600 18px 'DM Mono',Consolas,monospace;color:${COLORS.text};">${equity.openPositions}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="50%" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">TRADE NUOVI (24H)<br/><span style="font:600 15px 'DM Mono',Consolas,monospace;color:${COLORS.text};">${trades.newTradesCount}</span></td>
          <td width="50%" style="font:11px 'DM Mono',Consolas,monospace;color:${COLORS.muted};">P&amp;L REALIZZATO (24H)<br/><span style="font:600 15px 'DM Mono',Consolas,monospace;color:${tone(trades.realizedPnl)};">${signedMoney(trades.realizedPnl)}</span></td>
        </tr></table>
      </td></tr>
      ${topValidated.length ? `
      <tr><td style="padding:0 20px 16px;">
        <p style="margin:0 0 8px;font:600 11px Manrope,Arial,sans-serif;letter-spacing:.05em;color:${COLORS.muted};text-transform:uppercase;">Migliori candidati validati</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${topValidated.map((v) => `
          <tr>
            <td style="padding:5px 0;font:12px 'DM Mono',Consolas,monospace;color:${COLORS.text};border-top:1px solid ${COLORS.cardBorder};">${esc(v.symbol)} <span style="color:${COLORS.muted};">· ${esc(v.label)}</span></td>
            <td align="right" style="padding:5px 0;font:12px 'DM Mono',Consolas,monospace;color:${tone(v.avgReturn)};border-top:1px solid ${COLORS.cardBorder};">${v.avgReturn >= 0 ? '+' : ''}${v.avgReturn.toFixed(2)}% <span style="color:${COLORS.muted};">· ${v.winRate.toFixed(0)}%wr</span></td>
          </tr>`).join('')}
        </table>
      </td></tr>` : ''}
      ${activity.length ? `
      <tr><td style="padding:0 20px 18px;">
        <p style="margin:0 0 8px;font:600 11px Manrope,Arial,sans-serif;letter-spacing:.05em;color:${COLORS.muted};text-transform:uppercase;">Attività recente</p>
        ${activity.slice(0, 3).map((a) => `<p style="margin:0 0 4px;font:12px Manrope,Arial,sans-serif;color:${COLORS.text};">${esc(a.title)} <span style="color:${COLORS.muted};">— ${esc(a.detail)}</span></p>`).join('')}
      </td></tr>` : ''}
      <tr><td style="padding:0 20px 18px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:${accent};color:#06142a;font:700 11px Manrope,Arial,sans-serif;text-decoration:none;">Apri dashboard →</a>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderDailyReportHtml(report, { siteBaseUrl = '' } = {}) {
  const dateLabel = new Date(report.generatedAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aurora Markets — Report giornaliero</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td style="padding-bottom:22px;">
          <p style="margin:0;font:800 20px Manrope,Arial,sans-serif;color:${COLORS.text};letter-spacing:-.3px;">Aurora <span style="color:${COLORS.muted};font-weight:600;">/ Report giornaliero</span></p>
          <p style="margin:4px 0 0;font:12px 'DM Mono',Consolas,monospace;color:${COLORS.muted};text-transform:capitalize;">${esc(dateLabel)}</p>
        </td></tr>
        ${systemCard({ name: 'SpiderMan — sistema principale', accent: COLORS.spiderman, data: report.spiderman, dashboardUrl: `${siteBaseUrl}/index.html` })}
        ${systemCard({ name: 'Venom — sembionte autonomo', accent: COLORS.venom, data: report.venom, dashboardUrl: `${siteBaseUrl}/venom.html` })}
        <tr><td style="padding:8px 4px 0;">
          <p style="margin:0;font:10px Manrope,Arial,sans-serif;line-height:1.6;color:${COLORS.muted};">
            Report educativo, paper trading — nessun ordine reale, nessuna consulenza finanziaria. Generato automaticamente dai job schedulati di Aurora Markets. Un risultato positivo sul passato non garantisce risultati futuri.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
