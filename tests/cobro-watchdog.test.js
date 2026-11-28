/**
 * Tests del arreglo del watchdog mentiroso (MEJORAS 1.3):
 * cuando el cobro supera el timeout, ANTES de mostrar error se comprueba
 * si la venta quedó guardada en la BD por su id; si se guardó, el flujo
 * termina como éxito para que el usuario no vuelva a cobrarla.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { db } from '../src/db';
import { conWatchdogVerificado } from '../src/utils/watchdog';
import { useCobro } from '../src/composables/useCobro';
import { useUIStore } from '../src/stores/useUIStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { toastMsg } from '../src/utils/toast';

async function limpiarDb() {
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear(), db.config.clear()]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await limpiarDb();
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('conWatchdogVerificado', () => {
  it('resuelve con el valor si la promesa es rápida (sin verificar)', async () => {
    const r = await conWatchdogVerificado('op', Promise.resolve(7), async () => false, 1000);
    expect(r).toBe(7);
  });

  it('si expira el timeout pero verificar dice que se guardó, resuelve como éxito', async () => {
    const lenta = new Promise(() => {}); // nunca resuelve
    const r = await conWatchdogVerificado('op', lenta, async () => true, 30);
    expect(r).toBeUndefined();
  });

  it('si expira el timeout y verificar dice que NO se guardó, rechaza con error de timeout', async () => {
    const lenta = new Promise(() => {});
    await expect(conWatchdogVerificado('op', lenta, async () => false, 30)).rejects.toThrow(/tardo mas de/);
  });

  it('si verificar falla, rechaza con error de timeout (no con el fallo interno)', async () => {
    const lenta = new Promise(() => {});
    await expect(
      conWatchdogVerificado('op', lenta, async () => {
        throw new Error('bd caída');
      }, 30)
    ).rejects.toThrow(/tardo mas de/);
  });
});

describe('procesarVenta con timeout pero venta guardada', () => {
  it('muestra éxito (no error) y no deja la venta para cobrar de nuevo', async () => {
    await db.productos.put({ id: 'p_1', nombre: 'Refresco', precio: 15, archivado: false });
    await db.lotes.put({
      id: 'l_1',
      productoId: 'p_1',
      cantidadInicial: 10,
      cantidadVendida: 0,
      costo: 10,
      fecha: new Date().toISOString(),
    });
    await useProductosStore().cargarProductos();
    await useLotesStore().cargarLotes();
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 2, precio: 15, unidad: 'u' }];
    localStorage.setItem('carritoPro', 'x');
    useUIStore().cobroAbierto = true;

    // Simular transacción lenta: escribe la venta y los lotes, pero la
    // promesa nunca resuelve (el watchdog expira mientras tanto).
    // Solo la PRIMERA transacción (la de la venta) se simula lenta: las
    // siguientes (recarga de stores, regenerar asientos) usan la real,
    // o el flujo posterior quedaría colgado por el propio mock.
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
      const cb = args[args.length - 1];
      await cb();
      return new Promise(() => {});
    });

    const { procesarVenta, procesandoVenta } = useCobro();
    await procesarVenta(50);

    // La venta SÍ quedó en BD y el flujo terminó como éxito
    const ventasDb = await db.ventas.toArray();
    expect(ventasDb).toHaveLength(1);
    expect(ventasDb[0].total).toBe(30);
    expect(ventas.carrito).toHaveLength(0);
    expect(useUIStore().cobroAbierto).toBe(false);
    expect(procesandoVenta.value).toBe(false);
    expect(localStorage.getItem('carritoPro')).toBeNull();
    expect(toastMsg).not.toHaveBeenCalledWith(expect.stringContaining('tardo mas de'), expect.anything());
    const mensajesExito = toastMsg.mock.calls.map((c) => c[0]);
    expect(mensajesExito.some((m) => typeof m === 'string' && m.includes('tardó más de lo normal'))).toBe(true);
    expect(mensajesExito.some((m) => typeof m === 'string' && m.includes('no la cobres de nuevo'))).toBe(true);
  });

  it('si expira el timeout y la venta NO se guardó, muestra error y conserva el carrito', async () => {
    await db.productos.put({ id: 'p_1', nombre: 'Refresco', precio: 15, archivado: false });
    await db.lotes.put({
      id: 'l_1',
      productoId: 'p_1',
      cantidadInicial: 10,
      cantidadVendida: 0,
      costo: 10,
      fecha: new Date().toISOString(),
    });
    await useProductosStore().cargarProductos();
    await useLotesStore().cargarLotes();
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 2, precio: 15, unidad: 'u' }];
    useUIStore().cobroAbierto = true;

    // Transacción que nunca escribe ni resuelve: la verificación no
    // encuentra la venta y el error de timeout debe aparecer.
    vi.spyOn(db, 'transaction').mockImplementation(async () => new Promise(() => {}));

    const { procesarVenta, procesandoVenta } = useCobro();
    await procesarVenta(50);

    expect(await db.ventas.count()).toBe(0);
    expect(ventas.carrito).toHaveLength(1);
    expect(useUIStore().cobroAbierto).toBe(true);
    expect(procesandoVenta.value).toBe(false);
    expect(toastMsg).toHaveBeenCalledWith(expect.stringContaining('tardo mas de'), expect.anything());
  });
});
