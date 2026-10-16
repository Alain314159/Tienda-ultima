/**
 * Tests PROFUNDOS de BackupPanel + useBackupStore — Área 8 de la campaña
 * de cobertura profunda (80-90% de la app).
 *
 * El panel del respaldo automático (lista, backup ahora, restaurar con
 * confirmación propia) con el servicio BackupFolder moqueado, y los flujos
 * del store: backupAuto (con y sin Telegram), safety net pre-import y la
 * zona peligrosa de borrarTodo con doble confirmación.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useTelegramStore } from '../src/stores/useTelegramStore';

const mockInfo = vi.fn();
const mockListar = vi.fn();
const mockGuardar = vi.fn();
const mockLeer = vi.fn();
const mockRotar = vi.fn();
let mockEsNativo = false;

vi.mock('../src/services/backupFolder', () => ({
  BackupFolder: {
    info: (...a) => mockInfo(...a),
    listar: (...a) => mockListar(...a),
    guardar: (...a) => mockGuardar(...a),
    leer: (...a) => mockLeer(...a),
    rotar: (...a) => mockRotar(...a),
  },
}));
vi.mock('../src/services/platform', () => ({
  esNativo: () => mockEsNativo,
  esWeb: () => !mockEsNativo,
}));

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

const RESPALDO_MIN = {
  version: '6.0',
  fecha: new Date().toISOString(),
  productos: [],
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

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  mockEsNativo = false;
  mockInfo.mockReset().mockResolvedValue({ cantidad: 0, ultimo: null });
  mockListar.mockReset().mockResolvedValue([]);
  mockGuardar.mockReset().mockResolvedValue('backup-2026-10-14-1000.json.gz');
  mockLeer.mockReset().mockResolvedValue(null);
  mockRotar.mockReset().mockResolvedValue(undefined);
  await Promise.all([db.config.clear(), db.productos.clear(), db.tgQueue.clear()]);
  await useConfigStore().cargarCfg?.();
});

// ============================================================
// BackupPanel (servicio moqueado)
// ============================================================
describe('BackupPanel', () => {
  async function montar() {
    const { default: BackupPanel } = await import('../src/components/BackupPanel.vue');
    const { default: AppIcon } = await import('../src/components/AppIcon.vue');
    const w = mount(BackupPanel, { global: { components: { Icon: AppIcon } } });
    await flushPromises();
    return w;
  }

  it('muestra estado inicial, lista vacía y aviso de modo web', async () => {
    mockInfo.mockResolvedValue({ cantidad: 3, ultimo: '2026-10-14 08:00' });
    const w = await montar();
    expect(w.text()).toContain('2026-10-14 08:00');
    expect(w.text()).toContain('3');
    expect(w.text()).toContain('Sin backups todavía');
    expect(w.text()).toContain('los backups se descargan');
    expect(w.find('.btn.warn').attributes('disabled')).toBeDefined();
    w.unmount();
  });

  it('en nativo muestra el aviso de almacenamiento privado', async () => {
    mockEsNativo = true;
    const w = await montar();
    expect(w.text()).toContain('almacenamiento privado');
    expect(w.text()).not.toContain('los backups se descargan');
    w.unmount();
  });

  it('Backup ahora: guarda los datos de los stores, rota y recarga la lista', async () => {
    mockGuardar.mockResolvedValue('backup-nuevo.json.gz');
    mockListar.mockResolvedValueOnce([]).mockResolvedValue([{ name: 'backup-nuevo.json.gz' }]);
    const w = await montar();
    await w.find('.btn.pri').trigger('click');
    await flushPromises();

    expect(mockGuardar).toHaveBeenCalledTimes(1);
    const datos = mockGuardar.mock.calls[0][0];
    expect(datos).toHaveProperty('productos');
    expect(datos).toHaveProperty('ventas');
    expect(mockRotar).toHaveBeenCalledWith(30);
    expect(w.text()).toContain('Backup creado: backup-nuevo.json.gz');
    expect(w.text()).toContain('backup-nuevo.json.gz');
    w.unmount();
  });

  it('restaurar un archivo: confirmación propia → leer → emit restore', async () => {
    mockListar.mockResolvedValue([{ name: 'backup-2026-10-14.json.gz' }]);
    mockLeer.mockResolvedValue(RESPALDO_MIN);
    const w = await montar();
    await w.findAll('button').filter((b) => b.text().trim() === 'Restaurar')[0].trigger('click');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Restaurar backup');
    expect(ui.confirm.msg).toContain('TODOS los datos');
    expect(mockLeer).not.toHaveBeenCalled();

    ui.okConfirm();
    await flushPromises();
    expect(mockLeer).toHaveBeenCalledWith('backup-2026-10-14.json.gz');
    expect(w.emitted('restore')[0]).toEqual([RESPALDO_MIN]);
    expect(w.text()).toContain('restaurado correctamente');
    w.unmount();
  });

  it('restaurar el más reciente toma el primer archivo de la lista', async () => {
    mockListar.mockResolvedValue([{ name: 'a.json.gz' }, { name: 'b.json.gz' }]);
    mockLeer.mockResolvedValue(RESPALDO_MIN);
    const w = await montar();
    await w.find('.btn.warn').trigger('click');
    await flushPromises();
    useUIStore().okConfirm();
    await flushPromises();
    expect(mockLeer).toHaveBeenCalledWith('a.json.gz');
    w.unmount();
  });

  it('error de lectura: mensaje de error y sin emit', async () => {
    mockListar.mockResolvedValue([{ name: 'roto.json.gz' }]);
    mockLeer.mockRejectedValue(new Error('corrupto'));
    const w = await montar();
    await w.findAll('button').filter((b) => b.text().trim() === 'Restaurar')[0].trigger('click');
    await flushPromises();
    useUIStore().okConfirm();
    await flushPromises();
    expect(w.text()).toContain('Error: corrupto');
    expect(w.emitted('restore')).toBeUndefined();
    w.unmount();
  });

  it('error cargando lista: mensaje de error visible', async () => {
    mockInfo.mockRejectedValue(new Error('sin permisos'));
    const w = await montar();
    expect(w.text()).toContain('Error cargando lista: sin permisos');
    w.unmount();
  });

  it('el botón × emite close', async () => {
    const w = await montar();
    await w.find('.modal-title .link-btn').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });
});

// ============================================================
// useBackupStore — backupAuto, safety net y zona peligrosa
// ============================================================
describe('useBackupStore: backupAuto', () => {
  it('escribe el respaldo en db.config; con Telegram configurado y base VACÍA omite la subida', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = useConfigStore();
    config.cfg.tgChatId = '12345';
    config.cfg.nombreTienda = 'Mi Tienda';
    config.cfg.tiendaConfigurada = true;
    const tg = useTelegramStore();
    const encolarSpy = vi.spyOn(tg, 'tgEncolar').mockResolvedValue(5);
    vi.spyOn(tg, 'tgProcesarCola').mockResolvedValue(undefined);

    const s = useBackupStore();
    await s.backupAuto();

    const rec = await db.config.get('backupAuto');
    expect(rec).toBeTruthy();
    expect(rec.value).toHaveProperty('productos');
    expect(rec.fecha).toBeTruthy();
    // Base vacía: NO se sube a Telegram aunque esté configurado
    expect(encolarSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('base vacia'));
  });

  it('con datos y Telegram configurado: encola como auto solo si el hash cambió', async () => {
    const config = useConfigStore();
    config.cfg.tgChatId = '12345';
    config.cfg.nombreTienda = 'Mi Tienda';
    config.cfg.tiendaConfigurada = true;

    const { useProductosStore } = await import('../src/stores/useProductosStore');
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 100 });
    await useProductosStore().cargarProductos();

    const tg = useTelegramStore();
    const encolarSpy = vi.spyOn(tg, 'tgEncolar').mockResolvedValue(1);
    vi.spyOn(tg, 'tgProcesarCola').mockResolvedValue(undefined);

    const s = useBackupStore();
    await s.backupAuto();
    expect(encolarSpy).toHaveBeenCalledTimes(1);
    expect(encolarSpy.mock.calls[0][1]).toBe('auto');

    // El envío real persiste tgUltimoHash al tener éxito (useTelegramStore):
    // simularlo para que la segunda pasada vea el mismo hash y NO re-encole
    const { hashRespaldoEstable } = await import('../src/services/hash');
    const { datosDeStores } = await import('../src/stores/exportar');
    // El envío real persiste este hash al triunfar (tgEnviarDatos paso 8)
    config.cfg.tgUltimoHash = await hashRespaldoEstable(datosDeStores());

    await s.backupAuto();
    expect(encolarSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useBackupStore: restauraciones y safety net', () => {
  it('restaurarBackupAuto: sin último backup no hace nada; con él, confirma e importa', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const s = useBackupStore();
    s.restaurarBackupAuto();
    expect(useUIStore().confirm.activo).toBe(false);

    s.ultimoBackup = { fecha: '2026-10-14T08:00:00.000Z', value: RESPALDO_MIN };
    s.restaurarBackupAuto();
    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Restaurar backup');
    expect(ui.confirm.msg).toContain('14/10/26');
    ui.ajustesAbierto = true;
    ui.okConfirm();
    await esperar(() => useUIStore().ajustesAbierto === false);
  });

  it('onRestoreBackup: importa y avisa; con datos inválidos avisa del error', async () => {
    const okSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const s = useBackupStore();
    await s.onRestoreBackup(RESPALDO_MIN);
    expect(okSpy).toHaveBeenCalled();

    await s.onRestoreBackup({ ...RESPALDO_MIN, ventas: [{ id: 'v1' }] }); // inválido
    expect(errSpy).toHaveBeenCalled();
  });

  it('cargarPreImportInfo y restaurarPreImport: la red de seguridad del import', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'warning').mockImplementation(() => {});
    const s = useBackupStore();

    // Sin registro previo
    await s.cargarPreImportInfo();
    expect(s.preImportDisponible).toBe(false);
    s.restaurarPreImport();
    await flushPromises();
    expect(useUIStore().confirm.activo).toBe(false); // no hay nada que confirmar

    // Con registro previo
    await db.config.put({ key: 'preImportBackup', value: RESPALDO_MIN, fecha: '2026-10-13T20:00:00.000Z' });
    await s.cargarPreImportInfo();
    expect(s.preImportDisponible).toBe(true);
    expect(s.preImportFecha).toBe('2026-10-13T20:00:00.000Z');

    s.restaurarPreImport();
    await flushPromises();
    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Deshacer importación');
    ui.okConfirm();
    await esperar(() => vi.mocked(toast.success).mock.calls.some((c) => c[0] === 'Datos restaurados'));
  });
});

describe('useBackupStore: borrarTodo (zona peligrosa)', () => {
  it('doble confirmación: BORRAR exacto limpia todo; otra cosa cancela', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'warning').mockImplementation(() => {});
    await db.productos.put({ id: 'p1', nombre: 'X', precio: 1 });
    await db.ventas.put({
      id: 'v1', fecha: new Date().toISOString(), items: [], total: 0, ganancia: 0, anulada: false,
    });
    await db.config.put({ key: 'cfg', value: { nombreTienda: 'T' } });

    const s = useBackupStore();
    const ui = useUIStore();
    s.borrarTodo();
    expect(ui.confirm.titulo).toContain('BORRAR TODO');
    ui.okConfirm();
    await flushPromises();

    // Prompt final: texto incorrecto → cancelado, datos intactos
    expect(ui.prompt.activo).toBe(true);
    ui.prompt.value = 'borrar';
    ui.okPrompt();
    await flushPromises();
    expect(await db.productos.count()).toBe(1);

    // Texto exacto → borra todo
    s.borrarTodo();
    ui.okConfirm();
    await flushPromises();
    ui.prompt.value = 'BORRAR';
    ui.okPrompt();
    await flushPromises();

    expect(await db.productos.count()).toBe(0);
    expect(await db.ventas.count()).toBe(0);
    expect(await db.config.count()).toBe(0);
  });
});
