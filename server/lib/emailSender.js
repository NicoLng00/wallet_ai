// Invio del report giornaliero via EmailJS (server-side, @emailjs/nodejs) — l'utente ha gia' un
// account EmailJS collegato a nico.longobardi00@gmail.com, nessuna nuova infrastruttura email da
// gestire. Il template EmailJS lato dashboard deve avere UN SOLO campo nel corpo, {{message_html}},
// impostato in "Code view" cosi' l'HTML del report (server/lib/dailyReportTemplate.js) arriva intatto
// invece di essere ri-processato dall'editor visuale del template.
//
// `client` e' iniettabile (default: SDK reale) cosi' i test possono verificare i parametri passati
// senza spedire davvero un'email — stesso pattern del resto del progetto (mai una vera chiamata
// esterna dentro node --test).
import emailjs from '@emailjs/nodejs';

const defaultClient = {
  send: (serviceId, templateId, params, options) => emailjs.send(serviceId, templateId, params, options)
};

export async function sendDailyReportEmail({ html, generatedAt, toEmail, config, client = defaultClient }) {
  const { serviceId, templateId, publicKey, privateKey } = config || {};
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    throw new Error('Configurazione EmailJS incompleta: servono serviceId, templateId, publicKey, privateKey');
  }
  if (!toEmail) throw new Error('toEmail mancante: nessun destinatario per il report');

  const dateLabel = new Date(generatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  return client.send(
    serviceId,
    templateId,
    {
      to_email: toEmail,
      subject: `Aurora Markets — Report giornaliero (${dateLabel})`,
      message_html: html
    },
    { publicKey, privateKey }
  );
}
