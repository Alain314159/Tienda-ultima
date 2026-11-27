/**
 * Tests del recordatorio de backups (useNotificacionesStore, chequeo 5):
 * más de umbralBackupDias (def. 7) sin respaldo válido — backup local
 * automático, export manual o sync correcta con la nube — avisa una vez
 * al día y solo si hay datos que perder.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useNotificacionesStore } from '../src/stores/useNotificacionesStore';
import { hoyLocal } from '../src/utils/fecha';

const haceDias = (d) => new Date(Date.now() - d * 86400000).toISOString();

let notifMock;
let origNotification;

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([db.config.clear(), db.productos.clear(), db.lotes.clear()]);
  // Web con permiso: enviarNotif cae en `new Notification(...)`
  origNotification = window.Notification;
  notifMock = vi.fn();
  window.Notification = Object.assign(notifMock, {
    permission: 'granted',
    requestPermission: vi.fn(),
  });
  const config = useConfigStore();
  config.cfg.notifActivo = true;
  // Un producto con stock para que no salte el aviso de stock bajo
  useProductosStore().productos = [{ id: 'p1', nombre: 'Café', precio: 10, stockMinimo: 0 }];
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (origNotification === undefined) delete window.Notification;
  else window.Notification = origNotification;
});

/** Títulos de las notificaciones enviadas en el chequeo. */
function titulos() {
  return notifMock.mock.calls.map((c) => c[0]);
}

describe('recordatorio de backups', () => {
  it('sin ningún respaldo y con datos: avisa una sola vez al día', async () => {
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).toContain('Respaldo pendiente');
    expect(useConfigStore().cfg.ultimaNotifRespaldo).toBe(hoyLocal());

    // Segunda pasada el mismo día: no se repite
    notifMock.mockClear();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('backup automático local reciente: no avisa', async () => {
    await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: new Date().toISOString() });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('backup automático de hace 10 días: avisa', async () => {
    await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: haceDias(10) });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).toContain('Respaldo pendiente');
  });

  it('export manual reciente compensa un backup automático viejo', async () => {
    await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: haceDias(30) });
    useConfigStore().cfg.ultimoExport = new Date().toISOString();
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('sync correcta con la nube reciente también vale como respaldo', async () => {
    await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: haceDias(30) });
    await db.config.put({ key: 'ultimaSyncNube', value: new Date().toISOString() });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('sin datos en la app: no avisa aunque nunca haya respaldo', async () => {
    useProductosStore().productos = [];
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('notificaciones desactivadas: no avisa', async () => {
    useConfigStore().cfg.notifActivo = false;
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Respaldo pendiente');
  });

  it('respeta umbralBackupDias configurado', async () => {
    // Umbral de 3 días: un backup de hace 4 días ya avisa
    useConfigStore().cfg.umbralBackupDias = 3;
    await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: haceDias(4) });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).toContain('Respaldo pendiente');
  });
});
