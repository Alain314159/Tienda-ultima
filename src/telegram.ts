// Cliente Telegram via proxy (Cloudflare Worker).
// Ahora con nombres de tienda unicos y contrasena.
// La app key se inyecta en build via VITE_TG_APP_KEY (ver .env.example).

export const TG_PROXY_URL = 'https://tienda-proxy.tienda-ul5r2q.workers.dev';
export const TG_APP_KEY: string = import.meta.env.VITE_TG_APP_KEY || '';

/** Mensaje de chat tal como lo devuelve getUpdates. */
interface TgChatMsg {
  chat?: {
    id?: number;
    type?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

/** Update de Telegram (solo los campos que usamos). */
export interface TgUpdate {
  message?: TgChatMsg;
  edited_message?: TgChatMsg;
  channel_post?: TgChatMsg;
}

function proxyHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'X-App-Key': TG_APP_KEY };
  if (extra) for (const k in extra) h[k] = extra[k];
  return h;
}

async function tgJson(path: string, opts?: RequestInit) {
  const r = await fetch(TG_PROXY_URL + path, opts);
  const text = await r.text();
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('Respuesta no-JSON del proxy: ' + text.slice(0, 120));
  }
  if (!d.ok) throw new Error(d.description || 'Error de Telegram');
  return d.result !== undefined ? d.result : d;
}

// ===== CONFIGURACION DE TIENDA =====

export async function tgCheckName(nombre: string) {
  const r = await fetch(TG_PROXY_URL + '/api/checkName?nombre=' + encodeURIComponent(nombre), {
    method: 'GET',
    headers: proxyHeaders(),
  });
  const d = await r.json();
  return d; // { ok, disponible, nombre?, motivo? }
}

export async function tgRegister(nombre: string, password: string, chatId: string) {
  const r = await fetch(TG_PROXY_URL + '/api/register', {
    method: 'POST',
    headers: proxyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nombre, password, chatId }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error registrando');
  return d;
}

export async function tgLogin(nombre: string, password: string, chatId: string) {
  const r = await fetch(TG_PROXY_URL + '/api/login', {
    method: 'POST',
    headers: proxyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nombre, password, chatId }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error login');
  return d;
}

export async function tgStatus(chatId: string) {
  const r = await fetch(TG_PROXY_URL + '/api/status?chatId=' + encodeURIComponent(chatId), {
    method: 'GET',
    headers: proxyHeaders(),
  });
  const d = await r.json();
  return d; // { ok, chatId, nombre }
}

// ===== TELEGRAM BASICO =====

export async function tgGetMe() {
  return tgJson('/api/tg/getMe', { method: 'GET', headers: proxyHeaders() });
}

export async function tgGetUpdates(offset?: number) {
  const q = '?limit=100' + (offset ? '&offset=' + offset : '');
  return tgJson('/api/tg/getUpdates' + q, { method: 'GET', headers: proxyHeaders() });
}

// ===== BACKUPS CON FILTRO POR TIENDA =====

export async function tgListBackups(chatId: string, nombre: string) {
  const r = await fetch(
    TG_PROXY_URL + '/api/tg/listBackups?chatId=' + encodeURIComponent(chatId) + '&nombre=' + encodeURIComponent(nombre),
    { method: 'GET', headers: proxyHeaders() }
  );
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error listando');
  return d.result; // array de backups
}

export async function tgSendDocument(chatId: string, nombre: string, blob: Blob, caption?: string) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('nombre', nombre);
  form.append('document', blob, 'backup.json.gz');
  if (caption) form.append('caption', caption);
  const r = await fetch(TG_PROXY_URL + '/api/tg/sendDocument', {
    method: 'POST',
    headers: proxyHeaders(),
    body: form,
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error subiendo');
  return d.result;
}

export async function tgGetFile(fileId: string) {
  return tgJson('/api/tg/getFile', {
    method: 'POST',
    headers: proxyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file_id: fileId }),
  });
}

export function tgFileUrl(filePath: string) {
  return TG_PROXY_URL + '/api/tg/file?path=' + encodeURIComponent(filePath) + '&key=' + encodeURIComponent(TG_APP_KEY);
}

export async function tgDeleteMessage(chatId: string, messageId: number) {
  try {
    return await tgJson('/api/tg/deleteMessage', {
      method: 'POST',
      headers: proxyHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch {
    return false;
  }
}

export function tgDetectarChatId(updates: TgUpdate[]) {
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    const m = u.message || u.edited_message || u.channel_post;
    if (m && m.chat && m.chat.id && m.chat.type === 'private') {
      return {
        chatId: m.chat.id,
        nombre: (m.chat.first_name || '') + ' ' + (m.chat.last_name || ''),
        username: m.chat.username || '',
      };
    }
  }
  return null;
}
