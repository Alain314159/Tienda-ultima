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

const workerCode = `// Cloudflare Worker - Tienda Pro (multi-tenant con KV de backups)

const ALLOWED_ORIGINS = new Set([
  'https://alain314159.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.has(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function genSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...salt));
}

function validarNombre(nombre) {
  if (!nombre || typeof nombre !== 'string') return false;
  if (nombre.length < 3 || nombre.length > 40) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(nombre);
}

async function verificarChatNombre(KV, chatId, nombre) {
  if (!chatId || !nombre) return false;
  const rec = await KV.get('name:' + nombre);
  if (!rec) return false;
  try {
    const registro = JSON.parse(rec);
    return registro.chatsAutorizados.includes(String(chatId));
  } catch (e) { return false; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, description: 'Forbidden origin' }, 403, cors);
    if (env.APP_KEY && request.headers.get('X-App-Key') !== env.APP_KEY) {
      return json({ ok: false, description: 'Unauthorized' }, 401, cors);
    }
    if (!env.TG_TOKEN) return json({ ok: false, description: 'TG_TOKEN no configurado' }, 500, cors);
    if (!env.TIENDA_NAMES) return json({ ok: false, description: 'TIENDA_NAMES no configurado' }, 500, cors);

    const url = new URL(request.url);
    const KV = env.TIENDA_NAMES;

    // ===== GET ME =====
    if (url.pathname === '/api/tg/getMe') {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/getMe');
      const data = await r.json();
      return json(data, r.status, cors);
    }

    // ===== GET UPDATES (para detectar chat_id) =====
    if (url.pathname === '/api/tg/getUpdates') {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/getUpdates?limit=100');
      const data = await r.json();
      return json(data, r.status, cors);
    }

    // ===== CHECK NAME =====
    if (url.pathname === '/api/checkName') {
      const nombre = (url.searchParams.get('nombre') || '').toLowerCase().trim();
      if (!validarNombre(nombre)) return json({ ok: true, disponible: false, motivo: 'Nombre invalido (3-40 caracteres, a-z, 0-9, guiones)' }, 200, cors);
      const existe = await KV.get('name:' + nombre);
      return json({ ok: true, disponible: !existe, nombre }, 200, cors);
    }

    // ===== STATUS =====
    if (url.pathname === '/api/status') {
      const chatId = String(url.searchParams.get('chatId') || '');
      if (!chatId) return json({ ok: false, description: 'Falta chatId' }, 400, cors);
      const nombre = await KV.get('chat:' + chatId);
      return json({ ok: true, chatId, nombre: nombre || null }, 200, cors);
    }

    // ===== REGISTER =====
    if (url.pathname === '/api/register' && request.method === 'POST') {
      try {
        const body = await request.json();
        const nombre = (body.nombre || '').toLowerCase().trim();
        const password = body.password || '';
        const chatId = String(body.chatId || '');

        if (!validarNombre(nombre)) return json({ ok: false, description: 'Nombre invalido' }, 400, cors);
        if (!password || password.length < 6) return json({ ok: false, description: 'Contrasena muy corta' }, 400, cors);
        if (!chatId) return json({ ok: false, description: 'Falta chatId' }, 400, cors);

        const existente = await KV.get('name:' + nombre);
        if (existente) return json({ ok: false, description: 'El nombre ya esta en uso' }, 409, cors);

        const chatExistente = await KV.get('chat:' + chatId);
        if (chatExistente) return json({ ok: false, description: 'Este chat ya tiene nombre: ' + chatExistente }, 409, cors);

        const salt = genSalt();
        const passwordHash = await hashPassword(password, salt);
        const registro = {
          nombre, chatId, salt, passwordHash,
          fechaRegistro: new Date().toISOString(),
          chatsAutorizados: [chatId]
        };
        await KV.put('name:' + nombre, JSON.stringify(registro));
        await KV.put('chat:' + chatId, nombre);

        return json({ ok: true, nombre, chatId }, 200, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== LOGIN =====
    if (url.pathname === '/api/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const nombre = (body.nombre || '').toLowerCase().trim();
        const password = body.password || '';
        const chatId = String(body.chatId || '');

        if (!nombre || !password || !chatId) return json({ ok: false, description: 'Faltan datos' }, 400, cors);

        const rec = await KV.get('name:' + nombre);
        if (!rec) return json({ ok: false, description: 'Nombre no registrado' }, 404, cors);

        const registro = JSON.parse(rec);
        const hash = await hashPassword(password, registro.salt);
        if (hash !== registro.passwordHash) return json({ ok: false, description: 'Contrasena incorrecta' }, 401, cors);

        if (!registro.chatsAutorizados.includes(chatId)) {
          registro.chatsAutorizados.push(chatId);
          await KV.put('name:' + nombre, JSON.stringify(registro));
        }
        await KV.put('chat:' + chatId, nombre);

        return json({ ok: true, nombre, chatId }, 200, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== LIST BACKUPS (desde KV) =====
    if (url.pathname === '/api/tg/listBackups') {
      const chatId = String(url.searchParams.get('chatId') || '');
      const nombre = (url.searchParams.get('nombre') || '').toLowerCase().trim();
      if (!chatId || !nombre) return json({ ok: false, description: 'Faltan chatId y nombre' }, 400, cors);
      const ok = await verificarChatNombre(KV, chatId, nombre);
      if (!ok) return json({ ok: false, description: 'No autorizado' }, 403, cors);

      // Leer índice de backups del KV
      const idxStr = await KV.get('backups:' + chatId);
      let idx = [];
      try { idx = idxStr ? JSON.parse(idxStr) : []; } catch (e) { idx = []; }

      // Filtrar por nombre (por si hubiera cambios de nombre)
      const filtrados = idx.filter(b => b.nombre === nombre);
      filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      return json({ ok: true, result: filtrados }, 200, cors);
    }

    // ===== SEND DOCUMENT (guarda en KV) =====
    if (url.pathname === '/api/tg/sendDocument' && request.method === 'POST') {
      try {
        const form = await request.formData();
        const chatId = String(form.get('chat_id') || '');
        const nombre = (form.get('nombre') || '').toLowerCase().trim();
        const blob = form.get('document');
        const caption = form.get('caption') || '';

        if (!chatId || !nombre || !blob) return json({ ok: false, description: 'Faltan campos' }, 400, cors);
        const ok = await verificarChatNombre(KV, chatId, nombre);
        if (!ok) return json({ ok: false, description: 'No autorizado' }, 403, cors);

        const fecha = new Date().toISOString().split('T')[0];
        const rand = Math.random().toString(36).slice(2, 6);
        const nuevoNombre = 'tienda-backup-' + nombre + '-' + fecha + '-' + rand + '.json.gz';

        const tgForm = new FormData();
        tgForm.append('chat_id', chatId);
        tgForm.append('document', blob, nuevoNombre);
        if (caption) tgForm.append('caption', caption);

        const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendDocument', {
          method: 'POST',
          body: tgForm
        });
        const data = await r.json();

        if (!data.ok) return json(data, r.status, cors);

        // Guardar en índice KV
        const resultado = data.result;
        const doc = resultado.document || {};
        const entrada = {
          fileId: doc.file_id,
          fileName: doc.file_name || nuevoNombre,
          fileSize: doc.file_size || 0,
          fecha: new Date(resultado.date * 1000).toISOString(),
          messageId: resultado.message_id,
          caption: caption || '',
          nombre
        };

        const idxStr = await KV.get('backups:' + chatId);
        let idx = [];
        try { idx = idxStr ? JSON.parse(idxStr) : []; } catch (e) { idx = []; }
        idx.push(entrada);

        // Rotación: mantener últimos 20
        const mantener = 20;
        const eliminados = [];
        if (idx.length > mantener) {
          const sobrantes = idx.slice(0, idx.length - mantener);
          for (const bk of sobrantes) {
            try {
              await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/deleteMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, message_id: bk.messageId })
              });
              eliminados.push(bk.messageId);
            } catch (e) {}
          }
          idx = idx.slice(-mantener);
        }

        await KV.put('backups:' + chatId, JSON.stringify(idx));

        return json(data, r.status, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== DELETE MESSAGE (y actualiza índice) =====
    if (url.pathname === '/api/tg/deleteMessage' && request.method === 'POST') {
      try {
        const body = await request.json();
        const chatId = String(body.chat_id || '');
        const messageId = body.message_id;
        if (!chatId || !messageId) return json({ ok: false, description: 'Faltan campos' }, 400, cors);
        const nombre = await KV.get('chat:' + chatId);
        if (!nombre) return json({ ok: false, description: 'Chat no registrado' }, 403, cors);

        const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/deleteMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId })
        });
        const data = await r.json();

        // Quitar del índice KV
        const idxStr = await KV.get('backups:' + chatId);
        let idx = [];
        try { idx = idxStr ? JSON.parse(idxStr) : []; } catch (e) { idx = []; }
        idx = idx.filter(b => b.messageId !== messageId);
        await KV.put('backups:' + chatId, JSON.stringify(idx));

        return json(data, r.status, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== GET FILE =====
    if (url.pathname === '/api/tg/getFile' && request.method === 'POST') {
      try {
        const body = await request.json();
        const fileId = body.file_id;
        if (!fileId) return json({ ok: false, description: 'Falta file_id' }, 400, cors);
        const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/getFile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: fileId })
        });
        const data = await r.json();
        return json(data, r.status, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== FILE DOWNLOAD =====
    if (url.pathname === '/api/tg/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) return json({ ok: false, description: 'Falta path' }, 400, cors);
      const r = await fetch('https://api.telegram.org/file/bot' + env.TG_TOKEN + '/' + filePath);
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        status: r.status,
        headers: { 'Content-Type': 'application/octet-stream', ...cors }
      });
    }

    return json({ ok: false, description: 'Not found: ' + url.pathname }, 404, cors);
  }
};
`;

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
