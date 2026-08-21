import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDailyReportEmail } from '../lib/emailSender.js';

const FULL_CONFIG = { serviceId: 'service_x', templateId: 'template_x', publicKey: 'pub_x', privateKey: 'priv_x' };

test('sendDailyReportEmail: configurazione incompleta -> errore esplicito, mai un tentativo di invio', async () => {
  await assert.rejects(
    () => sendDailyReportEmail({ html: '<html></html>', generatedAt: '2026-08-21T09:00:00.000Z', toEmail: 'x@y.com', config: {} }),
    /Configurazione EmailJS incompleta/
  );
});

test('sendDailyReportEmail: destinatario mancante -> errore esplicito', async () => {
  await assert.rejects(
    () => sendDailyReportEmail({ html: '<html></html>', generatedAt: '2026-08-21T09:00:00.000Z', toEmail: null, config: FULL_CONFIG }),
    /destinatario/
  );
});

test('sendDailyReportEmail: passa service/template/chiavi e l\'HTML intero come message_html, mai riscritto', async () => {
  const calls = [];
  const client = { send: async (serviceId, templateId, params, options) => { calls.push({ serviceId, templateId, params, options }); return { status: 200 }; } };
  const html = '<html><body>Report reale</body></html>';
  await sendDailyReportEmail({ html, generatedAt: '2026-08-21T09:00:00.000Z', toEmail: 'nico.longobardi00@gmail.com', config: FULL_CONFIG, client });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].serviceId, 'service_x');
  assert.equal(calls[0].templateId, 'template_x');
  assert.equal(calls[0].params.to_email, 'nico.longobardi00@gmail.com');
  assert.equal(calls[0].params.message_html, html, 'l\'HTML del report deve arrivare intatto, non riprocessato dal template EmailJS');
  assert.match(calls[0].params.subject, /Aurora Markets/);
  assert.deepEqual(calls[0].options, { publicKey: 'pub_x', privateKey: 'priv_x' });
});
