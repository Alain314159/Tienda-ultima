// Cliente minimalista de Telegram Bot API para backups
export const TG_API = 'https://api.telegram.org';
export const TOKEN_DEFAULT = '8966617052:AAE8jdyk_wigtgusAghADBQRa73YXJw8XR4';

async function tgCall(token, method, params) {
  const url = TG_API + '/bot' + token + '/' + method;
  const opts = params
    ? { method: 'POST', body: params instanceof FormData ? params : JSON.stringify(params), headers: params instanceof FormData ? {} : { 'Content-Type': 'application/json' } }
    : { method: 'GET' };
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error de Telegram');
  return d.result;
}

export async function tgGetMe(token) {
  return tgCall(token, 'getMe');
}

export async function tgGetUpdates(token, offset) {
  const q = '?limit=100' + (offset ? '&offset=' + offset : '');
  const r = await fetch(TG_API + '/bot' + token + '/getUpdates' + q);
  const d = await r.json();
  if (!d.ok) throw new Error(d.description || 'Error de Telegram');
  return d.result;
}

export async function tgSendDocument(token, chatId, blob, filename, caption) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', blob, filename);
  if (caption) form.append('caption', caption);
  return tgCall(token, 'sendDocument', form);
}

export async function tgGetFile(token, fileId) {
  return tgCall(token, 'getFile', { file_id: fileId });
}

export function tgFileUrl(token, filePath) {
  return TG_API + '/file/bot' + token + '/' + filePath;
}

export async function tgDeleteMessage(token, chatId, messageId) {
  try { return await tgCall(token, 'deleteMessage', { chat_id: chatId, message_id: messageId }); }
  catch (e) { return false; }
}

// Detecta el chat_id del usuario a partir del ultimo mensaje recibido
export function tgDetectarChatId(updates) {
  // Buscar el ultimo mensaje con chat que no sea canal
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    const m = u.message || u.edited_message || u.channel_post;
    if (m && m.chat && m.chat.id) {
      return {
        chatId: m.chat.id,
        nombre: (m.chat.first_name || '') + ' ' + (m.chat.last_name || ''),
        username: m.chat.username || ''
      };
    }
  }
  return null;
}

// Extrae los backups (documentos .json con nombre tienda-backup-*)
export function tgExtraerBackups(updates) {
  const out = [];
  updates.forEach(u => {
    const m = u.message || u.channel_post;
    if (!m || !m.document) return;
    const doc = m.document;
    if (!doc.file_name || !doc.file_name.startsWith('tienda-backup-')) return;
    out.push({
      fileId: doc.file_id,
      fileName: doc.file_name,
      fileSize: doc.file_size || 0,
      fecha: new Date(m.date * 1000).toISOString(),
      messageId: m.message_id,
      caption: m.caption || ''
    });
  });
  return out.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
