/**
 * Tests del respaldo automático del store (useBackupStore.backupAuto,
 * punto 6.2 — autosave):
 * - backupAuto guarda los datos ACTUALES: una segunda llamada tras
 *   cambiar los datos refleja el cambio (no un snapshot viejo).
 * - backupAuto no altera los datos vivos de la app.
 * - iniciarBackupInterval programa el respaldo cada 2h y
 *   detenerBackupInterval lo para.
 *
 * Hueco que cubre: autosave.test.js prueba el servicio Autosave
 * (archivo local, cada 10 operaciones) y backup-ui.test.js que backupAuto
 * escribe un registro, pero no que el snapshot se actualice con los
 * cambios posteriores ni el intervalo programado de 2h.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useVentasStore } from '../src/stores/useVentasStore';

const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

beforeEach(async () => {
  await Promise.all([db.config.clear(), db.productos.clear(), db.lotes.clear(), db.ventas.clear()]);
  setActivePinia(createPinia());
});

afterEach(() => {
  try {
    useBackupStore().detenerBackupInterval();
  } catch {
    /* sin pinia activa: nada que parar */
  }
  vi.restoreAllMocks();
});

describe('backupAuto guarda los datos actuales', () => {
  it('la segunda llamada refleja altas y bajas posteriores (no un snapshot viejo)', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 100 });
    await useProductosStore().cargarProductos();
    const s = useBackupStore();

    await s.backupAuto();
    let rec = await db.config.get('backupAuto');
    expect(rec.value.productos).toHaveLength(1);
    expect(rec.value.productos[0].nombre).toBe('Aceite');
    const primeraFecha = rec.fecha;

    // Cambian los datos: se da de baja Aceite y entra Café
    await db.productos.delete('p1');
    await db.productos.put({ id: 'p2', nombre: 'Café', precio: 50 });
    await useProductosStore().cargarProductos();

    await s.backupAuto();
    rec = await db.config.get('backupAuto');
    expect(rec.value.productos).toHaveLength(1);
    expect(rec.value.productos[0].nombre).toBe('Café');
    expect(new Date(rec.fecha).getTime()).toBeGreaterThanOrEqual(new Date(primeraFecha).getTime());
  });

  it('no altera los datos vivos: productos y ventas siguen intactos tras el respaldo', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 100 });
    await db.ventas.put({
      id: 'v1',
      fecha: new Date().toISOString(),
      items: [],
      total: 30,
      ganancia: 15,
      anulada: false,
    });
    await useProductosStore().cargarProductos();
    await useVentasStore().cargarVentas();

    await useBackupStore().backupAuto();

    expect(useProductosStore().productos).toHaveLength(1);
    expect(useVentasStore().ventas).toHaveLength(1);
    expect(await db.productos.count()).toBe(1);
    expect(await db.ventas.count()).toBe(1);
  });
});

describe('iniciarBackupInterval / detenerBackupInterval', () => {
  it('programa el respaldo cada 2h y detenerlo lo para', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 100 });
    await useProductosStore().cargarProductos();
    const s = useBackupStore();

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    s.iniciarBackupInterval();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), DOS_HORAS_MS);
    const callback = setIntervalSpy.mock.calls[0][0];

    // Disparar el intervalo a mano: guarda el respaldo con los datos actuales
    callback();
    await vi.waitFor(async () => {
      expect(await db.config.get('backupAuto')).toBeTruthy();
    });
    let rec = await db.config.get('backupAuto');
    expect(rec.value.productos).toHaveLength(1);
    expect(rec.value.productos[0].nombre).toBe('Aceite');

    // Cambian los datos y vuelve a disparar: el snapshot se actualiza
    await db.productos.put({ id: 'p2', nombre: 'Café', precio: 50 });
    await useProductosStore().cargarProductos();
    callback();
    await vi.waitFor(async () => {
      const r = await db.config.get('backupAuto');
      expect(r.value.productos).toHaveLength(2);
    });

    // Detener: se limpia el intervalo y ya no se programa otro
    const timerId = setIntervalSpy.mock.results[0].value;
    s.detenerBackupInterval();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timerId);
    rec = await db.config.get('backupAuto');
    expect(rec.value.productos).toHaveLength(2);
  });

  it('detener sin haber iniciado no rompe', () => {
    const s = useBackupStore();
    expect(() => {
      s.detenerBackupInterval();
      s.detenerBackupInterval();
    }).not.toThrow();
  });
});
