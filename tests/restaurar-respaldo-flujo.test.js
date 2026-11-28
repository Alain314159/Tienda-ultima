/**
 * Tests del flujo completo de restaurar un respaldo (punto 6.2):
 * - exportar (datosDeStores) → ensuciar los datos → importarData:
 *   los datos vuelven como estaban y lo posterior al respaldo desaparece
 *   (reemplazo total, no fusión).
 * - el PIN local no cambia aunque el archivo traiga otro PIN.
 * - onRestoreBackup restaura y avisa; con un archivo inválido no borra nada.
 *
 * Hueco que cubre: import-seguro.test.js prueba el saneado de la cfg y
 * que el PIN no viaja, y backup-ui.test.js el diálogo de confirmación,
 * pero no la vuelta completa de los datos (productos + ventas + lotes)
 * con reemplazo total ni onRestoreBackup de punta a punta.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { datosDeStores } from '../src/stores/exportar';
import { hashPin, verificarPin } from '../src/services/pin';

async function sembrarDatos() {
  await db.productos.put({ id: 'p1', nombre: 'Aceite', precio: 100, archivado: false });
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
  await db.ventas.put({
    id: 'v1',
    fecha: new Date().toISOString(),
    items: [
      {
        productoId: 'p1',
        nombre: 'Aceite',
        cantidad: 3,
        precio: 10,
        costo: 15,
        ganancia: 15,
        lotesUsados: [{ loteId: 'l1', cantidad: 3, costo: 5 }],
      },
    ],
    total: 30,
    ganancia: 15,
    anulada: false,
  });
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
  await useVentasStore().cargarVentas();
}

beforeEach(async () => {
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.ajustes.clear(),
    db.arqueos.clear(),
    db.movCaja.clear(),
    db.cierres.clear(),
    db.capital.clear(),
    db.retiros.clear(),
    db.socios.clear(),
    db.distribuciones.clear(),
    db.gastos.clear(),
    db.pasivos.clear(),
    db.auditorias.clear(),
    db.config.clear(),
  ]);
  setActivePinia(createPinia());
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importarData: restauración completa', () => {
  it('los datos vuelven como estaban y lo posterior al respaldo desaparece', async () => {
    await sembrarDatos();
    const respaldo = await datosDeStores();
    expect(respaldo.productos).toHaveLength(1);
    expect(respaldo.ventas).toHaveLength(1);

    // Ensuciar: producto nuevo, venta borrada, lote cambiado
    await db.productos.put({ id: 'p-basura', nombre: 'Basura', precio: 1 });
    await db.ventas.delete('v1');
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 99, costo: 5 });
    await useProductosStore().cargarProductos();
    await useVentasStore().cargarVentas();
    await useLotesStore().cargarLotes();
    expect(useProductosStore().productos).toHaveLength(2);
    expect(useVentasStore().ventas).toHaveLength(0);

    await useBackupStore().importarData(respaldo);

    // Reemplazo total, no fusión: la basura posterior desaparece
    expect(useProductosStore().productos).toHaveLength(1);
    expect(useProductosStore().productos[0].nombre).toBe('Aceite');
    expect(useVentasStore().ventas).toHaveLength(1);
    expect(useVentasStore().ventas[0].id).toBe('v1');
    expect(useVentasStore().ventas[0].total).toBe(30);
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(3);
    expect(await db.productos.get('p-basura')).toBeUndefined();
  });

  it('el PIN local no cambia aunque el archivo traiga otro PIN y pinActivo=false', async () => {
    await sembrarDatos();
    const config = useConfigStore();
    config.cfg.pin = await hashPin('1234');
    config.cfg.pinActivo = true;

    const respaldo = await datosDeStores();
    // El export no lleva PIN; se lo inyecta un archivo ajeno con otro PIN
    const respaldoAjeno = {
      ...respaldo,
      cfg: { ...respaldo.cfg, pin: await hashPin('0000'), pinActivo: false },
    };
    // Ensuciar para comprobar que los datos sí se restauran
    await db.productos.put({ id: 'p-basura', nombre: 'Basura', precio: 1 });

    await useBackupStore().importarData(respaldoAjeno);

    expect(await verificarPin('1234', useConfigStore().cfg.pin)).toBe(true);
    expect(await verificarPin('0000', useConfigStore().cfg.pin)).toBe(false);
    expect(useConfigStore().cfg.pinActivo).toBe(true);
    expect(useProductosStore().productos).toHaveLength(1);
    expect(await db.productos.get('p-basura')).toBeUndefined();
  });
});

describe('onRestoreBackup: de punta a punta', () => {
  it('restaura los datos y muestra «Backup restaurado»', async () => {
    await sembrarDatos();
    const respaldo = await datosDeStores();
    await db.ventas.delete('v1');
    await useVentasStore().cargarVentas();
    expect(useVentasStore().ventas).toHaveLength(0);

    await useBackupStore().onRestoreBackup(respaldo);

    expect(useVentasStore().ventas).toHaveLength(1);
    expect(useVentasStore().ventas[0].id).toBe('v1');
    expect(toast.success).toHaveBeenCalledWith('Backup restaurado', expect.anything());
  });

  it('con un archivo inválido no borra nada y avisa del error', async () => {
    await sembrarDatos();

    await useBackupStore().onRestoreBackup({});

    expect(useProductosStore().productos).toHaveLength(1);
    expect(useVentasStore().ventas).toHaveLength(1);
    expect((await db.productos.toArray())).toHaveLength(1);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith('Backup restaurado', expect.anything());
  });
});
