/**
 * Tests del cliente Telegram (src/telegram.ts):
 * - tgJson: happy path, respuesta no-JSON, error del proxy (!ok)
 * - registro/login/status/checkName: URL, método, headers con X-App-Key
 * - backups: listado, subida con FormData, borrado tolerante a fallos
 * - tgDetectarChatId: último chat privado, saltando no-privados
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  TG_PROXY_URL,
  TG_APP_KEY,
  tgGetMe,
  tgGetUpdates,
  tgCheckName,
  tgRegister,
  tgLogin,
  tgStatus,
  tgListBackups,
  tgSendDocument,
  tgGetFile,
  tgFileUrl,
  tgDeleteMessage,
  tgDetectarChatId,
} from '../src/telegram';

function responderJson(body) {
  return {
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tgJson (núcleo)', () => {
  it('devuelve result cuando ok:true', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, result: { id: 7, first_name: 'Bot' } }));
    await expect(tgGetMe()).resolves.toEqual({ id: 7, first_name: 'Bot' });
    expect(fetchMock).toHaveBeenCalledWith(TG_PROXY_URL + '/api/tg/getMe', {
      method: 'GET',
      headers: { 'X-App-Key': TG_APP_KEY },
    });
  });

  it('respuesta no-JSON lanza error descriptivo con el inicio del cuerpo', async () => {
    fetchMock.mockResolvedValueOnce({ text: async () => '<html>502 Bad Gateway</html>' });
    await expect(tgGetMe()).rejects.toThrow('Respuesta no-JSON del proxy: <html>502 Bad');
  });

  it('ok:false lanza la description del proxy', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: false, description: 'tienda no encontrada' }));
    await expect(tgGetMe()).rejects.toThrow('tienda no encontrada');
  });

  it('getUpdates con offset lo propaga en la query', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, result: [] }));
    await tgGetUpdates(456);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('limit=100');
    expect(url).toContain('offset=456');
  });
});

describe('configuración de tienda', () => {
  it('tgCheckName codifica el nombre y devuelve el veredicto', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, disponible: true, nombre: 'la tienda' }));
    const r = await tgCheckName('la tienda');
    expect(r.disponible).toBe(true);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/api/checkName?nombre=la%20tienda');
  });

  it('tgRegister POSTea nombre/password/chatId y respeta !ok', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true }));
    await tgRegister('t1', 'secret', '99');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ nombre: 't1', password: 'secret', chatId: '99' });

    fetchMock.mockResolvedValueOnce(responderJson({ ok: false, description: 'ya existe' }));
    await expect(tgRegister('t1', 'x', '99')).rejects.toThrow('ya existe');
  });

  it('tgLogin POSTea credenciales', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true }));
    await tgLogin('t1', 'pw', '7');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ nombre: 't1', password: 'pw', chatId: '7' });
  });

  it('tgStatus consulta por chatId codificado', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, chatId: '7 7', nombre: 't1' }));
    const r = await tgStatus('7 7');
    expect(r.nombre).toBe('t1');
    expect(fetchMock.mock.calls[0][0]).toContain('chatId=7%207');
  });
});

describe('backups por Telegram', () => {
  it('tgListBackups codifica chatId y nombre, devuelve result', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, result: [{ n: 'a.json.gz' }, { n: 'b.json.gz' }] }));
    const r = await tgListBackups('1 2', 'la tienda');
    expect(r).toHaveLength(2);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('chatId=1%202');
    expect(url).toContain('nombre=la%20tienda');
  });

  it('tgListBackups propaga el error de listado', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: false, description: 'sin tienda' }));
    await expect(tgListBackups('1', 'x')).rejects.toThrow('sin tienda');
  });

  it('tgSendDocument envía multipart con caption opcional', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, result: { message_id: 5 } }));
    const blob = new Blob(['backup']);
    await tgSendDocument('55', 'tienda x', blob, 'respaldo diario');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('chat_id')).toBe('55');
    expect(opts.body.get('nombre')).toBe('tienda x');
    expect(opts.body.get('caption')).toBe('respaldo diario');
    // FormData envuelve el Blob en un File (happy-dom no conserva el nombre
    // de archivo del append, así que no se puede assertar 'backup.json.gz')
    const doc = opts.body.get('document');
    expect(doc).toBeInstanceOf(File);
  });

  it('tgGetFile POSTea el file_id como JSON', async () => {
    fetchMock.mockResolvedValueOnce(responderJson({ ok: true, result: { file_path: 'f/x' } }));
    const r = await tgGetFile('ABC');
    expect(r.file_path).toBe('f/x');
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ file_id: 'ABC' });
  });

  it('tgFileUrl codifica path y key', () => {
    const url = tgFileUrl('a b/c.json');
    expect(url).toBe(TG_PROXY_URL + '/api/tg/file?path=a%20b%2Fc.json&key=' + encodeURIComponent(TG_APP_KEY));
  });

  it('tgDeleteMessage devuelve false ante error de red (tolerante)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(tgDeleteMessage('1', 2)).resolves.toBe(false);
  });
});

describe('tgDetectarChatId', () => {
  it('toma el ÚLTIMO chat privado del historial de updates', () => {
    const updates = [
      { message: { chat: { id: 111, type: 'private', first_name: 'Ana' } } },
      { message: { chat: { id: 222, type: 'group', first_name: 'Grupo' } } }, // no privado
      { edited_message: { chat: { id: 333, type: 'private', first_name: 'Beto', last_name: 'Lpz', username: 'bl' } } },
    ];
    expect(tgDetectarChatId(updates)).toEqual({ chatId: 333, nombre: 'Beto Lpz', username: 'bl' });
  });

  it('acepta channel_post como fuente', () => {
    const updates = [{ channel_post: { chat: { id: 999, type: 'private', first_name: 'C' } } }];
    expect(tgDetectarChatId(updates)).toEqual({ chatId: 999, nombre: 'C ', username: '' });
  });

  it('sin chats privados devuelve null', () => {
    const updates = [
      { message: { chat: { id: 1, type: 'group' } } },
      { edited_message: { chat: { type: 'private' } } }, // sin id
    ];
    expect(tgDetectarChatId(updates)).toBeNull();
    expect(tgDetectarChatId([])).toBeNull();
  });
});
