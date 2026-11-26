import fs from 'fs';

const CF_TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API = 'https://api.cloudflare.com/client/v4';
const KV_ID = process.env.TIENDA_NAMES_KV_ID;
const TG_TOKEN = process.env.TG_TOKEN_ACTUAL;
const APP_KEY = process.env.APP_KEY_ACTUAL;

if (!CF_TOKEN || !ACCOUNT_ID || !KV_ID || !TG_TOKEN || !APP_KEY) {
  console.error('❌ Faltan variables');
  console.error('   Necesitas: CF_API_TOKEN, CF_ACCOUNT_ID, TIENDA_NAMES_KV_ID, TG_TOKEN_ACTUAL, APP_KEY_ACTUAL');
  process.exit(1);
}

const H = { Authorization: 'Bearer ' + CF_TOKEN };

async function api(method, url, body) {
  const opts = { method, headers: { ...H } };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(API + url, opts);
  const d = await r.json();
  if (!d.success) { console.error(JSON.stringify(d.errors, null, 2)); process.exit(1); }
  return d.result;
}

// Lee worker.js del disco: una sola fuente de verdad para el codigo del
// Worker (antes iba embebido aqui y se desincronizaba en cada redespliegue).
const workerCode = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

console.log('▶  Subiendo Worker v3...');
const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2024-01-01',
  bindings: [
    { type: 'plain_text', name: 'TG_TOKEN', text: TG_TOKEN },
    { type: 'plain_text', name: 'APP_KEY', text: APP_KEY },
    { type: 'kv_namespace', name: 'TIENDA_NAMES', namespace_id: KV_ID }
  ]
};

const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
form.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js');

await api('PUT', `/accounts/${ACCOUNT_ID}/workers/scripts/tienda-proxy`, form);
console.log('   ✅ Worker v3 subido');
console.log('');
console.log('═══════════════════════════════════════════');
console.log('  ✅ DESPLIEGUE v3 COMPLETO');
console.log('═══════════════════════════════════════════');
console.log('');
console.log('  Los backups futuros se guardarán en KV y aparecerán');
console.log('  en la lista. Los backups viejos en Telegram no se');
console.log('  pueden listar (limitación de la Bot API), pero');
console.log('  siguen existiendo en el chat.');
console.log('');
