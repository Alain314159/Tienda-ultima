/**
 * Tests PROFUNDOS de useTelegramStore — Área 9 de la campaña de cobertura
 * profunda (80-90% de la app).
 *
 * El cliente HTTP (src/telegram.ts) ya vive en tests/telegram.test.js.
 * Aquí el STORE completo con la red moqueada: registro/login de tienda,
 * envío con hash estable, cola con reintentos, rotación, detección de
 * chat, desconexión y el auto-backup de 24h.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useTelegramStore } from '../src/stores/useTelegramStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';

// vi.hoisted: vi.mock se iza al principio del archivo; las referencias
// externas aún no existen. Esto crea los mocks ANTES de la ización.
const { mocks, mockGuardarEnCarpeta } = vi.hoisted(() => ({
  mocks: {
    tgCheckName: vi.fn(),
    tgRegister: vi.fn(),
    tgLogin: vi.fn(),
    tgStatus: vi.fn(),
    tgGetUpdates: vi.fn(),
    tgListBackups: vi.fn(),
    tgSendDocument: vi.fn(),
    tgGetFile: vi.fn(),
    tgFileUrl: vi.fn((fp) => 'https://api.test/file/' + fp),
    tgDeleteMessage: vi.fn(),
  },
  mockGuardarEnCarpeta: vi.fn(),
}));

vi.mock('../src/telegram', () => ({
  TG_PROXY_URL: 'https://proxy.test',
  TG_APP_KEY: 'test-key',
  tgDetectarChatId: (updates) => {
    for (let i = updates.length - 1; i >= 0; i--) {
      const m = updates[i].message || updates[i].edited_message || updates[i].channel_post;
      if (m && m.chat && m.chat.id && m.chat.type === 'private') {
        return {
          chatId: m.chat.id,
          nombre: (m.chat.first_name || '') + ' ' + (m.chat.last_name || ''),
          username: m.chat.username || '',
        };
      }
    }
    return null;
  },
  ...mocks,
}));

vi.mock('../src/services/backup', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, guardarEnCarpeta: (...a) => mockGuardarEnCarpeta(...a) };
});

const RESPALDO = {
  version: 9,
  fecha: new Date().toISOString(),
  cfg: {},
  productos: [{ id: 'p1', nombre: 'Aceite', precio: 100 }],
  lotes: [],
  ventas: [],
  compras: [],
  gastos: [],
  capital: [],
  retiros: [],
  socios: [],
  distribuciones: [],
  ajustes: [],
  arqueos: [],
  movCaja: [],
  cierres: [],
};

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

function configurarTg(config) {
  const c = useConfigStore();
  c.cfg.tgChatId = '111';
  c.cfg.nombreTienda = 'mi-tienda';
  c.cfg.tiendaConfigurada = true;
  Object.assign(c.cfg, config || {});
  return c;
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  // (vi.restoreAllMocks no resetea las impl de los mocks de módulo:)
  Object.values(mocks).forEach((m) => m.mockReset());
  mockGuardarEnCarpeta.mockReset().mockResolvedValue(true);
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'warning').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await Promise.all([db.tgQueue.clear(), db.config.clear()]);
});

// ============================================================
// REGISTRO / LOGIN DE TIENDA
// ============================================================
describe('useTelegramStore: registro y login', () => {
  it('verificarNombreTienda: corto no consulta; disponible/ocupado/error', async () => {
    const s = useTelegramStore();
    s.mtForm.nombre = 'ab';
    await s.verificarNombreTienda();
    expect(mocks.tgCheckName).not.toHaveBeenCalled();

    s.mtForm.nombre = 'mi-tienda';
    mocks.tgCheckName.mockResolvedValue({ disponible: true });
    await s.verificarNombreTienda();
    expect(s.mtCheck.estado).toBe('ok');

    mocks.tgCheckName.mockResolvedValue({ disponible: false, motivo: 'Ya existe' });
    await s.verificarNombreTienda();
    expect(s.mtCheck.estado).toBe('ocupado');
    expect(s.mtCheck.motivo).toBe('Ya existe');

    mocks.tgCheckName.mockRejectedValue(new Error('sin red'));
    await s.verificarNombreTienda();
    expect(s.mtCheck.estado).toBe('error');
    expect(s.mtCheck.motivo).toBe('sin red');
  });

  it('puedoRegistrar exige nombre verificado y passwords gemelas', async () => {
    const s = useTelegramStore();
    expect(s.puedoRegistrar).toBe(false);
    s.mtForm.nombre = 'mi-tienda';
    s.mtCheck.estado = 'ok';
    s.mtForm.password = 'secreto1';
    s.mtForm.password2 = 'secreto1';
    expect(s.puedoRegistrar).toBe(true);
    s.mtForm.password2 = 'otra';
    expect(s.puedoRegistrar).toBe(false);
  });

  it('registrarTienda: sin chatId avisa; con éxito configura la tienda', async () => {
    const s = useTelegramStore();
    s.mtForm.nombre = 'mi-tienda';
    s.mtCheck.estado = 'ok';
    s.mtForm.password = 'secreto1';
    s.mtForm.password2 = 'secreto1';
    s.registrarTienda();
    await flushPromises();
    expect(toast.error).toHaveBeenCalledWith('Primero conecta el bot con /start', expect.anything());

    configurarTg({ tiendaConfigurada: false, nombreTienda: '' });
    mocks.tgRegister.mockResolvedValue({ nombre: 'mi-tienda' });
    mocks.tgListBackups.mockResolvedValue([]);
    await s.registrarTienda();
    const c = useConfigStore();
    expect(c.cfg.nombreTienda).toBe('mi-tienda');
    expect(c.cfg.tiendaConfigurada).toBe(true);
    expect(c.cfg.tgAutoBackup).toBe(true);
    expect(mocks.tgRegister).toHaveBeenCalledWith('mi-tienda', 'secreto1', '111');
    expect(s.mtForm.nombre).toBe(''); // form reseteado
  });

  it('loginTienda: configura la tienda y resetea el form', async () => {
    const s = useTelegramStore();
    s.mtForm.loginNombre = 'Mi-Tienda';
    s.mtForm.loginPassword = 'secreto1';
    configurarTg();
    mocks.tgLogin.mockResolvedValue({ nombre: 'mi-tienda' });
    mocks.tgListBackups.mockResolvedValue([]);
    await s.loginTienda();
    expect(mocks.tgLogin).toHaveBeenCalledWith('mi-tienda', 'secreto1', '111');
    expect(useConfigStore().cfg.tiendaConfigurada).toBe(true);
    expect(s.mtForm.loginNombre).toBe('');
  });

  it('tgCargarEstadoTienda sincroniza el nombre si el proxy lo conoce', async () => {
    const s = useTelegramStore();
    await s.tgCargarEstadoTienda(); // sin chatId: no-op
    expect(mocks.tgStatus).not.toHaveBeenCalled();

    configurarTg({ nombreTienda: '' });
    mocks.tgStatus.mockResolvedValue({ nombre: 'renombre' });
    await s.tgCargarEstadoTienda();
    expect(useConfigStore().cfg.nombreTienda).toBe('renombre');
  });
});

// ============================================================
// ENVÍO DE BACKUP
// ============================================================
describe('useTelegramStore: envío', () => {
  it('tgBackupAhora sin tienda configurada avisa y no envía', async () => {
    const s = useTelegramStore();
    await s.tgBackupAhora(RESPALDO);
    expect(toast.error).toHaveBeenCalledWith('Configura un nombre de tienda antes de hacer backups', expect.anything());
    expect(mocks.tgSendDocument).not.toHaveBeenCalled();
  });

  it('tgEnviarDatos: sube, guarda en carpeta si está activa y persiste el hash estable', async () => {
    const s = useTelegramStore();
    configurarTg({ tgCarpetaActiva: true });
    mocks.tgSendDocument.mockResolvedValue({ ok: true });
    mocks.tgListBackups.mockResolvedValue([]);

    const r = await s.tgEnviarDatos(RESPALDO, 'manual', true);
    expect(r.ok).toBe(true);
    expect(mocks.tgSendDocument).toHaveBeenCalledTimes(1);
    const [chatId, nombre, blob, caption] = mocks.tgSendDocument.mock.calls[0];
    expect(chatId).toBe('111');
    expect(nombre).toBe('mi-tienda');
    expect(blob).toBeInstanceOf(Blob);
    expect(caption).toContain('1 prod');

    // Carpeta del teléfono
    expect(mockGuardarEnCarpeta).toHaveBeenCalledTimes(1);
    expect(mockGuardarEnCarpeta.mock.calls[0][0]).toMatch(/^tienda-backup-\d{4}-\d{2}-\d{2}\.json\.gz$/);

    // El hash persistido es el ESTABLE (sin fecha): un segundo envío con
    // idénticos datos y motivo auto se salta con "Sin cambios"
    const c = useConfigStore();
    expect(c.cfg.tgUltimoHash).toBeTruthy();
    const r2 = await s.tgEnviarDatos({ ...RESPALDO, fecha: new Date().toISOString() }, 'auto', false);
    expect(r2.saltado).toBe(true);
    expect(mocks.tgSendDocument).toHaveBeenCalledTimes(1); // no re-subió
  });

  it('tgBackupAhora con fallo de red encola y avisa', async () => {
    const s = useTelegramStore();
    configurarTg();
    // TypeError real del WebView de Android cuando no hay red/CORS:
    // "Failed to fetch" — el guard de tgBackupAhora lo clasifica como red
    mocks.tgSendDocument.mockRejectedValue(new Error('Failed to fetch'));
    await s.tgBackupAhora(RESPALDO);
    expect(toast.warning).toHaveBeenCalledWith('Sin conexion. Backup en cola.', expect.anything());
    expect(await db.tgQueue.count()).toBe(1);
    expect(useTelegramStore().tgColaPendiente).toBe(1);
  });

  it('tgBackupAhora con error del SERVIDOR muestra la causa real (no "sin conexion")', async () => {
    const s = useTelegramStore();
    configurarTg();
    // El 403 "No autorizado" del proxy (p.ej. Worker sin el origen del APK
    // en ALLOWED_ORIGINS, o nombre de tienda no registrado) antes se
    // reportaba como "Sin conexion" — el dueño veía que los backups no
    // subían sin ninguna pista del porqué.
    mocks.tgSendDocument.mockRejectedValue(new Error('No autorizado para este nombre'));
    await s.tgBackupAhora(RESPALDO);
    expect(toast.warning).toHaveBeenCalledWith(
      'Backup en cola. Error: No autorizado para este nombre',
      expect.anything()
    );
    expect(await db.tgQueue.count()).toBe(1); // igualmente queda en cola
  });
});

// ============================================================
// LISTADO / RESTAURAR / ELIMINAR / DESCONECTAR
// ============================================================
describe('useTelegramStore: nube', () => {
  it('tgListar: llena la lista y avisa cuántos hay', async () => {
    const s = useTelegramStore();
    configurarTg();
    mocks.tgListBackups.mockResolvedValue([
      { messageId: 1, fecha: '2026-10-14T08:00:00.000Z', fileSize: 2048, fileName: 'a.json.gz', fileId: 'f1' },
      { messageId: 2, fecha: '2026-10-13T08:00:00.000Z', fileSize: 4096, fileName: 'b.json.gz', fileId: 'f2' },
    ]);
    await s.tgListar();
    expect(s.tgBackups.length).toBe(2);
    expect(toast.success).toHaveBeenCalledWith('2 backup(s) encontrado(s)', expect.anything());

    mocks.tgListBackups.mockRejectedValue(new Error('proxy caído'));
    await s.tgListar();
    expect(toast.error).toHaveBeenCalled();
  });

  it('tgRestaurar: confirmación → descarga → importarData', async () => {
    const s = useTelegramStore();
    configurarTg();
    const importarData = vi.fn().mockResolvedValue(undefined);
    mocks.tgGetFile.mockResolvedValue({ file_path: '/data/a.json.gz' });
    global.fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob([JSON.stringify(RESPALDO)], { type: 'application/json' }),
    });

    s.tgRestaurar(
      { messageId: 1, fecha: '2026-10-14T08:00:00.000Z', fileSize: 2048, fileName: 'a.json.gz', fileId: 'f1' },
      importarData
    );
    await flushPromises();
    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Restaurar backup');
    expect(ui.confirm.msg).toContain('REEMPLAZADOS');

    ui.okConfirm();
    await esperar(() => importarData.mock.calls.length > 0);
    const datos = importarData.mock.calls[0][0];
    expect(datos.productos.length).toBe(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('tgRestaurar con archivo inválido: error y sin importar', async () => {
    const s = useTelegramStore();
    configurarTg();
    const importarData = vi.fn();
    mocks.tgGetFile.mockResolvedValue({ file_path: '/data/x' });
    global.fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob([JSON.stringify({ chau: 1 })], { type: 'application/json' }),
    });
    s.tgRestaurar(
      { messageId: 1, fecha: '2026-10-14T08:00:00.000Z', fileSize: 10, fileName: 'x', fileId: 'fx' },
      importarData
    );
    await flushPromises();
    useUIStore().okConfirm();
    await esperar(() => toast.error.mock.calls.length > 0);
    expect(importarData).not.toHaveBeenCalled();
  });

  it('tgEliminar: confirmación → borra en Telegram y de la lista local', async () => {
    const s = useTelegramStore();
    configurarTg();
    s.tgBackups = [
      { messageId: 1, fecha: '2026-10-14T08:00:00.000Z', fileSize: 10, fileName: 'a', fileId: 'f1' },
      { messageId: 2, fecha: '2026-10-13T08:00:00.000Z', fileSize: 10, fileName: 'b', fileId: 'f2' },
    ];
    mocks.tgDeleteMessage.mockResolvedValue({ ok: true });
    s.tgEliminar(s.tgBackups[0]);
    await flushPromises();
    useUIStore().okConfirm();
    await flushPromises();
    expect(mocks.tgDeleteMessage).toHaveBeenCalledWith('111', 1);
    expect(useTelegramStore().tgBackups.map((b) => b.messageId)).toEqual([2]);
  });

  it('tgDesconectar: limpia cfg, estado y lista', async () => {
    const s = useTelegramStore();
    configurarTg();
    s.tgBackups = [{ messageId: 1, fecha: '', fileSize: 1, fileName: '', fileId: '' }];
    s.tgDesconectar();
    await flushPromises();
    useUIStore().okConfirm();
    await esperar(() => useTelegramStore().tgBackups.length === 0);
    const c = useConfigStore();
    expect(c.cfg.tgChatId).toBe('');
    expect(c.cfg.nombreTienda).toBe('');
    expect(c.cfg.tiendaConfigurada).toBe(false);
    expect(useTelegramStore().tgEstado).toBe('sin-config');
    expect(useTelegramStore().tgBackups.length).toBe(0);
  });
});

// ============================================================
// DETECCIÓN DE CHAT Y AUTO-BACKUP
// ============================================================
describe('useTelegramStore: conexión y auto-backup', () => {
  it('tgAutoDetectarChat: ya conectado true; con /start conecta; sin nada espera', async () => {
    const s = useTelegramStore();
    configurarTg();
    expect(await s.tgAutoDetectarChat()).toBe(true); // ya conectado

    const c = useConfigStore();
    c.cfg.tgChatId = '';
    c.cfg.tgNombre = '';
    mocks.tgGetUpdates.mockResolvedValue([
      { message: { chat: { id: 999, type: 'private', first_name: 'Alain', last_name: 'Cruz', username: 'alain' } } },
    ]);
    mocks.tgStatus.mockResolvedValue({});
    expect(await s.tgAutoDetectarChat()).toBe(true);
    expect(c.cfg.tgChatId).toBe('999');
    expect(c.cfg.tgNombre).toContain('Alain');
    expect(s.tgEstado).toBe('conectado');

    c.cfg.tgChatId = '';
    mocks.tgGetUpdates.mockResolvedValue([]);
    expect(await s.tgAutoDetectarChat()).toBe(false);
    expect(s.tgEstado).toBe('esperando-start');

    mocks.tgGetUpdates.mockRejectedValue(new Error('sin red'));
    expect(await s.tgAutoDetectarChat()).toBe(false);
    expect(s.tgEstado).toBe('error');
  });

  it('tgAutoBackupCheck: a las 24h envía; con fallo cuenta y encola', async () => {
    const s = useTelegramStore();
    configurarTg({ tgAutoBackup: true, tgUltimoBackup: new Date(Date.now() - 25 * 3600000).toISOString() });
    mocks.tgSendDocument.mockResolvedValue({ ok: true });
    mocks.tgListBackups.mockResolvedValue([]);

    const getDatos = vi.fn(() => RESPALDO);
    await s.tgAutoBackupCheck(getDatos);
    expect(mocks.tgSendDocument).toHaveBeenCalledTimes(1);

    // Fallo: contador de consecutivos + cola. (Datos DISTINTOS: con el hash
    // estable, enviar el mismo respaldo otra vez se salta con "Sin cambios")
    mocks.tgSendDocument.mockRejectedValue(new Error('sin red'));
    configurarTg({ tgAutoBackup: true, tgUltimoBackup: new Date(Date.now() - 25 * 3600000).toISOString() });
    const respaldoCambiado = { ...RESPALDO, productos: [...RESPALDO.productos, { id: 'p2', nombre: 'B', precio: 2 }] };
    await s.tgAutoBackupCheck(() => respaldoCambiado);
    expect(useConfigStore().cfg.tgFallosConsecutivos).toBe(1);
    // La cola puede tener 1 (este fallo) o 2 (el check re-procesó y re-falló
    // el anterior): lo importante es que hay respaldo pendiente y reintento
    expect(await db.tgQueue.count()).toBeGreaterThanOrEqual(1);

    // Sin tgAutoBackup no hace nada (cola vacía: el paso 1 procesa pendientes
    // y eso SÍ reintaría el fallo anterior — no es lo que se prueba aquí)
    await db.tgQueue.clear();
    configurarTg({ tgAutoBackup: false, tgUltimoBackup: new Date(Date.now() - 48 * 3600000).toISOString() });
    const antes = mocks.tgSendDocument.mock.calls.length;
    await s.tgAutoBackupCheck(getDatos);
    expect(mocks.tgSendDocument.mock.calls.length).toBe(antes);
  });

  it('sincronizarEstado según cfg', () => {
    const s = useTelegramStore();
    useConfigStore().cfg.tgChatId = '';
    s.sincronizarEstado();
    expect(s.tgEstado).toBe('esperando-start');
    useConfigStore().cfg.tgChatId = '5';
    s.sincronizarEstado();
    expect(s.tgEstado).toBe('conectado');
  });
});

// ============================================================
// COLA Y ROTACIÓN
// ============================================================
describe('useTelegramStore: cola y rotación', () => {
  it('tgEncolar auto limpia los auto viejos; el manual no', async () => {
    const s = useTelegramStore();
    await s.tgEncolar(RESPALDO, 'auto');
    await s.tgEncolar(RESPALDO, 'auto');
    expect(await db.tgQueue.count()).toBe(1); // solo el más nuevo

    await s.tgEncolar(RESPALDO, 'manual');
    await s.tgEncolar(RESPALDO, 'manual');
    expect(await db.tgQueue.count()).toBe(3);
    expect(s.tgColaPendiente).toBe(3);
  });

  it('tgProcesarCola: manuales primero, éxito borra, fallo reintea hasta 5', async () => {
    const s = useTelegramStore();
    configurarTg();
    // Un manual y un auto pendientes
    await db.tgQueue.bulkPut([
      { id: 'q1', ts: '2026-10-14T09:00:00.000Z', estado: 'pendiente', intentos: 0, motivo: 'auto', datos: RESPALDO },
      { id: 'q2', ts: '2026-10-14T08:00:00.000Z', estado: 'pendiente', intentos: 0, motivo: 'manual', datos: RESPALDO },
    ]);

    mocks.tgSendDocument.mockResolvedValue({ ok: true });
    mocks.tgListBackups.mockResolvedValue([]);
    await s.tgProcesarCola();
    expect(await db.tgQueue.count()).toBe(0);

    // Fallo: intentos suben y estado error
    mocks.tgSendDocument.mockRejectedValue(new Error('sin red'));
    await s.tgEncolar(RESPALDO, 'manual');
    await s.tgProcesarCola();
    const item = (await db.tgQueue.toArray())[0];
    expect(item.estado).toBe('error');
    expect(item.intentos).toBe(1);
    expect(item.ultimoError).toBe('sin red');

    // 5 intentos agotados: pasa a fallido y no se reintenta
    await db.tgQueue.put({ ...item, intentos: 5 });
    await s.tgProcesarCola();
    expect((await db.tgQueue.get(item.id)).estado).toBe('fallido');
  });

  it('tgProcesarCola limpia autos duplicados dejando el más reciente', async () => {
    const s = useTelegramStore();
    configurarTg();
    await db.tgQueue.bulkPut([
      {
        id: 'viejo',
        ts: '2026-10-13T08:00:00.000Z',
        estado: 'pendiente',
        intentos: 0,
        motivo: 'auto',
        datos: RESPALDO,
      },
      {
        id: 'nuevo',
        ts: '2026-10-14T08:00:00.000Z',
        estado: 'pendiente',
        intentos: 0,
        motivo: 'auto',
        datos: RESPALDO,
      },
    ]);
    mocks.tgSendDocument.mockResolvedValue({ ok: true });
    mocks.tgListBackups.mockResolvedValue([]);
    await s.tgProcesarCola();
    expect(await db.tgQueue.count()).toBe(0);
    // Se envió exactamente una vez (el más reciente)
    expect(mocks.tgSendDocument).toHaveBeenCalledTimes(1);
  });

  it('tgProcesarCola recupera huerfanos en "enviando" (app muerta a mitad de envio)', async () => {
    const s = useTelegramStore();
    configurarTg();
    // Simula un crash del OS durante el envio: la fila quedo 'enviando'
    await db.tgQueue.bulkPut([
      {
        id: 'huerfano',
        ts: '2026-10-14T08:00:00.000Z',
        estado: 'enviando',
        intentos: 2,
        motivo: 'manual',
        datos: RESPALDO,
      },
      {
        id: 'normal',
        ts: '2026-10-14T09:00:00.000Z',
        estado: 'pendiente',
        intentos: 0,
        motivo: 'auto',
        // datos DISTINTOS: si fuera igual al huerfano, el dedup por hash
        // saltaria el segundo envio ("Sin cambios") y solo llegaria 1 send
        datos: { ...RESPALDO, productos: [{ id: 'p2', nombre: 'Pan', precio: 20 }] },
      },
    ]);

    mocks.tgSendDocument.mockResolvedValue({ ok: true });
    mocks.tgListBackups.mockResolvedValue([]);
    await s.tgProcesarCola();

    // Ambos se envian (el huerfano recuperado y el pendiente): cola vacia
    expect(await db.tgQueue.count()).toBe(0);
    expect(mocks.tgSendDocument).toHaveBeenCalledTimes(2);

    // Caso borde: si el envio del huerfano recuperado vuelve a fallar,
    // conserva sus intentos previos (2 + 1 = 3, todavia reintentable)
    mocks.tgSendDocument.mockRejectedValue(new Error('sin red'));
    await db.tgQueue.put({
      id: 'h2',
      ts: '2026-10-14T08:00:00.000Z',
      estado: 'enviando',
      intentos: 2,
      motivo: 'manual',
      datos: RESPALDO,
    });
    await s.tgProcesarCola();
    const item = await db.tgQueue.get('h2');
    expect(item.estado).toBe('error');
    expect(item.intentos).toBe(3);
  });

  it('tgRotarViejos borra los que exceden el límite configurado', async () => {
    const s = useTelegramStore();
    configurarTg({ tgMantenerN: 2 });
    s.tgBackups = [1, 2, 3, 4].map((i) => ({
      messageId: i,
      fecha: '2026-10-1' + i + 'T08:00:00.000Z',
      fileSize: 10,
      fileName: 'b' + i,
      fileId: 'f' + i,
    }));
    mocks.tgDeleteMessage.mockResolvedValue({ ok: true });
    const borrados = await s.tgRotarViejos();
    expect(borrados).toBe(2);
    expect(mocks.tgDeleteMessage).toHaveBeenCalledTimes(2);
    expect(useTelegramStore().tgBackups.length).toBe(2);

    // Bajo el límite: nada que hacer
    expect(await s.tgRotarViejos()).toBe(0);
  });
});
