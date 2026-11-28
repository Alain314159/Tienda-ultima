/**
 * Tests de los recordatorios que faltaban (3.7): «sync pendiente»
 * (cambios sin subir y más de un día sin sync correcta) y «deuda vencida»
 * (pasivos con vencimiento pasado y no pagados). Máximo una vez al día
 * por tema, como el resto de avisos del store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useNotificacionesStore } from '../src/stores/useNotificacionesStore';
import { useNubeStore } from '../src/stores/useNubeStore';
import { hoyLocal } from '../src/utils/fecha';

const haceDias = (d) => new Date(Date.now() - d * 86400000).toISOString();

let notifMock;
let origNotification;

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([
    db.config.clear(),
    db.productos.clear(),
    db.lotes.clear(),
    db.pasivos.clear(),
    db.cambios.clear(),
    db.syncMeta.clear(),
  ]);
  // Web con permiso: enviarNotif cae en `new Notification(...)`
  origNotification = window.Notification;
  notifMock = vi.fn();
  window.Notification = Object.assign(notifMock, {
    permission: 'granted',
    requestPermission: vi.fn(),
  });
  const config = useConfigStore();
  config.cfg.notifActivo = true;
  // Un producto con stock para que no salte el aviso de stock bajo, y un
  // respaldo reciente para que no salte el de respaldo.
  useProductosStore().productos = [{ id: 'p1', nombre: 'Café', precio: 10, stockMinimo: 0 }];
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });
  await db.config.put({ key: 'backupAuto', value: { version: 10 }, fecha: new Date().toISOString() });
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

describe('recordatorio de sync pendiente', () => {
  it('cambios sin subir y más de un día sin sync: avisa una sola vez al día', async () => {
    useNubeStore().setSesion('dueño@example.com');
    await db.config.put({ key: 'ultimaSyncNube', value: haceDias(3) });
    await db.productos.put({ id: 'p2', nombre: 'Azúcar' }); // crea una entrada en cambios

    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).toContain('Sincronización pendiente');
    expect((await db.config.get('ultimaNotifSyncPendiente'))?.value).toBe(hoyLocal());

    // Segunda pasada el mismo día: no se repite
    notifMock.mockClear();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Sincronización pendiente');
  });

  it('sync reciente: no avisa aunque haya cambios sin subir', async () => {
    useNubeStore().setSesion('dueño@example.com');
    await db.config.put({ key: 'ultimaSyncNube', value: new Date().toISOString() });
    await db.productos.put({ id: 'p2', nombre: 'Azúcar' });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Sincronización pendiente');
  });

  it('sin cambios pendientes (todo subido): no avisa', async () => {
    useNubeStore().setSesion('dueño@example.com');
    await db.config.put({ key: 'ultimaSyncNube', value: haceDias(3) });
    await db.productos.put({ id: 'p2', nombre: 'Azúcar' });
    const ultimo = await db.cambios.orderBy('id').last();
    await db.syncMeta.put({ clave: 'nube_enviado_hasta', value: ultimo.id });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Sincronización pendiente');
  });

  it('sin sesión en la nube: no avisa (el remedio es entrar, no un aviso)', async () => {
    await db.config.put({ key: 'ultimaSyncNube', value: haceDias(3) });
    await db.productos.put({ id: 'p2', nombre: 'Azúcar' });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Sincronización pendiente');
  });
});

describe('recordatorio de deuda vencida', () => {
  it('pasivo vencido y no pagado: avisa una sola vez al día', async () => {
    await db.pasivos.put({
      id: 'd1',
      fecha: haceDias(40),
      acreedor: 'Proveedor',
      monto: 500,
      pagado: false,
      vencimiento: haceDias(5).slice(0, 10),
    });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).toContain('Deuda vencida');
    expect((await db.config.get('ultimaNotifDeudaVencida'))?.value).toBe(hoyLocal());

    notifMock.mockClear();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Deuda vencida');
  });

  it('pasivo pagado o con vencimiento futuro: no avisa', async () => {
    await db.pasivos.put({
      id: 'd1',
      fecha: haceDias(40),
      acreedor: 'Proveedor',
      monto: 500,
      pagado: true,
      vencimiento: haceDias(5).slice(0, 10),
    });
    await db.pasivos.put({
      id: 'd2',
      fecha: new Date().toISOString(),
      acreedor: 'Otro',
      monto: 100,
      pagado: false,
      vencimiento: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Deuda vencida');
  });

  it('varias deudas vencidas: el aviso cuenta cuántas son', async () => {
    await db.pasivos.put({
      id: 'd1',
      fecha: haceDias(40),
      acreedor: 'A',
      monto: 500,
      pagado: false,
      vencimiento: haceDias(5).slice(0, 10),
    });
    await db.pasivos.put({
      id: 'd2',
      fecha: haceDias(40),
      acreedor: 'B',
      monto: 200,
      pagado: 0,
      vencimiento: haceDias(2).slice(0, 10),
    });
    const s = useNotificacionesStore();
    await s.chequearNotificaciones();
    const llamada = notifMock.mock.calls.find((c) => c[0] === 'Deuda vencida');
    expect(llamada).toBeTruthy();
    expect(llamada[1].body).toMatch(/2 deudas/);
  });
});
