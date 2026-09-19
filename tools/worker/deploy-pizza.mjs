import fs from 'fs';

const CF_TOKEN = process.env.CF_API_TOKEN;
const WORKER_NAME = 'pizza-proxy';
const TG_TOKEN = fs.readFileSync('.tg_token_pizza', 'utf8').trim();
const APP_KEY = process.env.PIZZA_APP_KEY;
const API = 'https://api.cloudflare.com/client/v4';

async function api(method, url, body) {
  const opts = { method, headers: { Authorization: 'Bearer ' + CF_TOKEN } };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(API + url, opts);
  const d = await r.json();
  if (!d.success) { console.error(JSON.stringify(d.errors, null, 2)); process.exit(1); }
  return d.result;
}

const accounts = await api('GET', '/accounts');
const accountId = accounts[0].id;
console.log('▶  Account:', accountId);

const workerCode = fs.readFileSync('worker.js', 'utf8');
const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2024-01-01',
  bindings: [
    { type: 'plain_text', name: 'TG_TOKEN', text: TG_TOKEN },
    { type: 'plain_text', name: 'APP_KEY', text: APP_KEY }
  ]
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
form.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');
await api('PUT', `/accounts/${accountId}/workers/scripts/${WORKER_NAME}`, form);
console.log('✅ Worker subido');

try {
  await api('POST', `/accounts/${accountId}/workers/scripts/${WORKER_NAME}/subdomain`, { enabled: true, previews_enabled: false });
  console.log('✅ Subdomain habilitado');
} catch (e) {}

const sub = await api('GET', `/accounts/${accountId}/workers/subdomain`);
const url = `https://${WORKER_NAME}.${sub.subdomain}.workers.dev`;

console.log('');
console.log('═══════════════════════════════════');
console.log('  ✅ PIZZA PROXY LISTO');
console.log('═══════════════════════════════════');
console.log('  URL: ' + url);
console.log('  APP_KEY: ' + APP_KEY);
console.log('═══════════════════════════════════');
console.log('');

fs.writeFileSync('.env-pizza',
  `export TG_PROXY_URL_PIZZA="${url}"\n` +
  `export TG_APP_KEY_PIZZA="${APP_KEY}"\n`
);
console.log('  Guardado en ~/tienda-proxy/.env-pizza');
