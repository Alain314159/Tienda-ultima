// Cloudflare Worker - Tienda Pro (multi-tenant)
// Bot de Telegram compartido + KV de nombres unicos por tienda.

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
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
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

    // ===== GET UPDATES (solo para detectar chat_id la primera vez) =====
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

    // ===== STATUS (que nombre tiene este chat_id) =====
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

        if (!validarNombre(nombre)) return json({ ok: false, description: 'Nombre invalido (3-40 caracteres, a-z, 0-9, guiones)' }, 400, cors);
        if (!password || password.length < 6) return json({ ok: false, description: 'Contrasena muy corta (min 6 caracteres)' }, 400, cors);
        if (!chatId) return json({ ok: false, description: 'Falta chatId' }, 400, cors);

        const existente = await KV.get('name:' + nombre);
        if (existente) return json({ ok: false, description: 'El nombre ya esta en uso' }, 409, cors);

        const chatExistente = await KV.get('chat:' + chatId);
        if (chatExistente) return json({ ok: false, description: 'Este chat ya tiene nombre asignado: ' + chatExistente }, 409, cors);

        const salt = genSalt();
        const passwordHash = await hashPassword(password, salt);
        const registro = {
          nombre,
          chatId,
          salt,
          passwordHash,
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

    // ===== LOGIN (migrar a otro dispositivo) =====
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

    // ===== LIST BACKUPS (filtrado por chat_id + nombre) =====
    if (url.pathname === '/api/tg/listBackups') {
      const chatId = String(url.searchParams.get('chatId') || '');
      const nombre = (url.searchParams.get('nombre') || '').toLowerCase().trim();
      if (!chatId || !nombre) return json({ ok: false, description: 'Faltan chatId y nombre' }, 400, cors);
      const ok = await verificarChatNombre(KV, chatId, nombre);
      if (!ok) return json({ ok: false, description: 'No autorizado para este nombre' }, 403, cors);

      const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/getUpdates?limit=100');
      const data = await r.json();
      if (!data.ok) return json({ ok: false, description: data.description || 'Error Telegram' }, 500, cors);

      const out = [];
      const oldPattern = /^tienda-backup-\d{4}-\d{2}-\d{2}-/;
      const newPrefix = 'tienda-backup-' + nombre + '-';
      data.result.forEach(u => {
        const msg = u.message || u.channel_post;
        if (!msg || !msg.document) return;
        if (String(msg.chat.id) !== chatId) return;
        const doc = msg.document;
        if (!doc.file_name) return;
        if (!doc.file_name.startsWith(newPrefix) && !oldPattern.test(doc.file_name)) return;
        out.push({
          fileId: doc.file_id,
          fileName: doc.file_name,
          fileSize: doc.file_size || 0,
          fecha: new Date(msg.date * 1000).toISOString(),
          messageId: msg.message_id,
          caption: msg.caption || ''
        });
      });
      out.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return json({ ok: true, result: out }, 200, cors);
    }

    // ===== SEND DOCUMENT (con nombre + verificacion) =====
    if (url.pathname === '/api/tg/sendDocument' && request.method === 'POST') {
      try {
        const form = await request.formData();
        const chatId = String(form.get('chat_id') || '');
        const nombre = (form.get('nombre') || '').toLowerCase().trim();
        const blob = form.get('document');
        const caption = form.get('caption') || '';

        if (!chatId || !nombre || !blob) return json({ ok: false, description: 'Faltan chat_id, nombre o document' }, 400, cors);
        const ok = await verificarChatNombre(KV, chatId, nombre);
        if (!ok) return json({ ok: false, description: 'No autorizado para este nombre' }, 403, cors);

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
        return json(data, r.status, cors);
      } catch (e) {
        return json({ ok: false, description: 'Error: ' + e.message }, 500, cors);
      }
    }

    // ===== DELETE MESSAGE (con verificacion por chat_id registrado) =====
    if (url.pathname === '/api/tg/deleteMessage' && request.method === 'POST') {
      try {
        const body = await request.json();
        const chatId = String(body.chat_id || '');
        const messageId = body.message_id;
        if (!chatId || !messageId) return json({ ok: false, description: 'Faltan chat_id o message_id' }, 400, cors);
        const nombre = await KV.get('chat:' + chatId);
        if (!nombre) return json({ ok: false, description: 'Chat no registrado' }, 403, cors);
        const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/deleteMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId })
        });
        const data = await r.json();
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
