/**
 * Tests de las notificaciones periódicas, título y cuerpo (punto 6.2):
 * - aviso de arqueo pendiente: título/cuerpo exactos, solo tras la hora,
 *   una vez al día, y nada si ya hay arqueo hoy o no hay hora configurada.
 * - aviso de respaldo pendiente: título/cuerpo exactos con los días.
 * - aviso de cierre pendiente: salta a los 30 días sin cerrar.
 *
 * Hueco que cubre: notificaciones-respaldo.test.js prueba las condiciones
 * del aviso de respaldo y ui-transversal.test.js el marcador de arqueo,
 * pero nadie comprobaba el título/cuerpo real que recibe el usuario ni
 * el aviso de cierre pendiente.
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
  await Promise.all([db.config.clear(), db.productos.clear(), db.lotes.clear(), db.arqueos.clear(), db.cierres.clear()]);
  // Web con permiso: enviarNotif cae en `new Notification(...)`
  origNotification = window.Notification;
  notifMock = vi.fn();
  window.Notification = Object.assign(notifMock, {
    permission: 'granted',
    requestPermission: vi.fn(),
  });
  const config = useConfigStore();
  config.cfg.notifActivo = true;
  // Un producto con stock y sin mínimo para que no salte el aviso de stock
  useProductosStore().productos = [{ id: 'p1', nombre: 'Café', precio: 10, stockMinimo: 0 }];
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });
  // Respaldo reciente para que no salte el aviso de respaldo salvo que el
  // test lo quiera: cada test lo quita o lo envejece a propósito.
  await db.config.put({ key: 'backupAuto', value: { version: 11 }, fecha: new Date().toISOString() });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (origNotification === undefined) delete window.Notification;
  else window.Notification = origNotification;
});

/** [título, cuerpo] de cada notificación enviada en el chequeo. */
function avisos() {
  return notifMock.mock.calls.map((c) => [c[0], c[1] && c[1].body]);
}
function titulos() {
  return avisos().map(([t]) => t);
}

describe('aviso de arqueo pendiente', () => {
  it('tras la hora y sin arqueo hoy: título y cuerpo exactos, una sola vez al día', async () => {
    useConfigStore().cfg.horaArqueo = '00:01'; // ya pasó
    const s = useNotificacionesStore();

    await s.chequearNotificaciones();

    expect(avisos()).toContainEqual(['Arqueo pendiente', 'No hay arqueo registrado hoy']);
    expect(useConfigStore().cfg.ultimaNotifArqueo).toBe(hoyLocal());

    // Segunda pasada el mismo día: no se repite
    notifMock.mockClear();
    await s.chequearNotificaciones();
    expect(titulos()).not.toContain('Arqueo pendiente');
  });

  it('antes de la hora configurada no avisa', async () => {
    useConfigStore().cfg.horaArqueo = '23:58'; // aún no llegó
    await useNotificacionesStore().chequearNotificaciones();
    expect(titulos()).not.toContain('Arqueo pendiente');
  });

  it('con arqueo registrado hoy no avisa', async () => {
    useConfigStore().cfg.horaArqueo = '00:01';
    await db.arqueos.put({
      id: 'a1',
      fecha: new Date().toISOString(),
      cajaFisica: 0,
      cajaSistema: 0,
      faltanteSobrante: 0,
    });
    await useNotificacionesStore().chequearNotificaciones();
    expect(titulos()).not.toContain('Arqueo pendiente');
  });

  it('sin hora de arqueo configurada no hay aviso aunque no haya arqueo', async () => {
    useConfigStore().cfg.horaArqueo = '';
    await useNotificacionesStore().chequearNotificaciones();
    expect(titulos()).not.toContain('Arqueo pendiente');
  });
});

describe('aviso de respaldo pendiente: título y cuerpo', () => {
  it('backup de hace 10 días: avisa con los días en el cuerpo', async () => {
    await db.config.put({ key: 'backupAuto', value: { version: 11 }, fecha: haceDias(10) });
    await useNotificacionesStore().chequearNotificaciones();
    expect(avisos()).toContainEqual([
      'Respaldo pendiente',
      'Llevas 10 días sin respaldo: exporta o sincroniza con la nube',
    ]);
  });
});

describe('aviso de cierre pendiente', () => {
  it('40 días sin cerrar: avisa con los días en el cuerpo', async () => {
    useConfigStore().cfg.periodoInicio = haceDias(40);
    await useNotificacionesStore().chequearNotificaciones();
    expect(avisos()).toContainEqual(['Cierre pendiente', '40 dias sin cerrar periodo']);
    expect(useConfigStore().cfg.ultimaNotifCierre).toBe(hoyLocal());
  });

  it('10 días sin cerrar (umbral 30): no avisa', async () => {
    useConfigStore().cfg.periodoInicio = haceDias(10);
    await useNotificacionesStore().chequearNotificaciones();
    expect(titulos()).not.toContain('Cierre pendiente');
  });
});
