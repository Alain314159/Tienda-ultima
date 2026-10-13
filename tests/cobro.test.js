/**
 * Tests del composable de cobro (useCobro): el proceso transaccional
 * de venta (FIFO + actualización de lotes + persistencia).
 * - iniciarCobro: validación de cantidades, detección de venta con pérdida
 * - calcBilletes: conteo por denominaciones, falta/sobra
 * - procesarVenta: venta simple y multi-lote (FIFO), error con stock
 *   insuficiente (rollback), limpieza de carrito y UI
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { db } from '../src/db';
import { useCobro } from '../src/composables/useCobro';
import { useUIStore } from '../src/stores/useUIStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { toastMsg } from '../src/utils/toast';
import { TOAST } from '../src/constants';

async function limpiarDb() {
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear(), db.config.clear()]);
}

/** Siembra un producto con lotes FIFO y devuelve los ids. */
async function semillar(producto, lotes) {
  await db.productos.put(producto);
  for (const l of lotes) await db.lotes.put(l);
  const productosStore = useProductosStore();
  const lotesStore = useLotesStore();
  await productosStore.cargarProductos();
  await lotesStore.cargarLotes();
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await limpiarDb();
  setActivePinia(createPinia());
});

describe('iniciarCobro: validaciones y apertura del modal', () => {
  it('rechaza carrito con cantidad <= 0 sin abrir el cobro', async () => {
    const { iniciarCobro } = useCobro();
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'X', cant: 0, precio: 10 }];

    iniciarCobro();

    expect(toastMsg).toHaveBeenCalledWith('Todas las cantidades deben ser > 0', TOAST.BAD);
    expect(useUIStore().cobroAbierto).toBe(false);
  });

  it('abre el modal con el total del carrito cuando todo es válido', async () => {
    await semillar({ id: 'p_1', nombre: 'Refresco', precio: 15 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 10,
        fecha: new Date().toISOString(),
      },
    ]);
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 2, precio: 15, unidad: 'u' }];

    const { iniciarCobro, cobroModal } = useCobro();
    iniciarCobro();

    const ui = useUIStore();
    expect(ui.cobroAbierto).toBe(true);
    expect(cobroModal.total).toBe(30);
    expect(cobroModal.billetes).toEqual({});
    expect(toastMsg).not.toHaveBeenCalled();
  });

  it('venta por debajo del costo pide confirmación y onOk abre el cobro', async () => {
    await semillar({ id: 'p_1', nombre: 'Refresco', precio: 15 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 10,
        fecha: new Date().toISOString(),
      },
    ]);
    const ventas = useVentasStore();
    // 2 x 5 = 10 de ingreso vs 20 de costo -> perdida 10
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 2, precio: 5 }];

    const { iniciarCobro, cobroModal } = useCobro();
    iniciarCobro();

    const ui = useUIStore();
    expect(ui.cobroAbierto).toBe(false); // a la espera de confirmación
    expect(ui.confirm.activo).toBe(true);
    expect(ui.confirm.titulo).toContain('perdida');
    expect(ui.confirm.msg).toContain('Refresco');

    ui.confirm.onOk?.(); // el usuario acepta
    expect(ui.cobroAbierto).toBe(true);
    expect(cobroModal.total).toBe(10);
  });
});

describe('calcBilletes: conteo de efectivo', () => {
  it('suma denominaciones y calcula falta/sobra contra el total', async () => {
    const { cobroModal, calcBilletes } = useCobro();
    cobroModal.total = 1000;
    cobroModal.billetes = { 500: 2, 100: 1, 10: '3' }; // 1000 + 100 + 30 = 1130

    calcBilletes();

    expect(cobroModal.totalContado).toBe(1130);
    expect(cobroModal.sobra).toBe(130);
    expect(cobroModal.falta).toBe(0);
  });

  it('reporta falta cuando el efectivo no alcanza', async () => {
    const { cobroModal, calcBilletes } = useCobro();
    cobroModal.total = 2000;
    cobroModal.billetes = { 500: 1, 200: '2', 100: 1 }; // 1000

    calcBilletes();

    expect(cobroModal.totalContado).toBe(1000);
    expect(cobroModal.falta).toBe(1000);
    expect(cobroModal.sobra).toBe(0);
  });

  it('entradas vacías o no numéricas cuentan como 0', async () => {
    const { cobroModal, calcBilletes } = useCobro();
    cobroModal.total = 500;
    cobroModal.billetes = { 500: 1, 100: '', 50: 'abc' };

    calcBilletes();

    expect(cobroModal.totalContado).toBe(500);
    expect(cobroModal.falta).toBe(0);
    expect(cobroModal.sobra).toBe(0);
  });
});

describe('procesarVenta: transacción FIFO + persistencia', () => {
  it('venta simple: guarda venta, descuenta lote, limpia carrito y cierra modal', async () => {
    await semillar({ id: 'p_1', nombre: 'Refresco', precio: 15 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 10,
        fecha: new Date().toISOString(),
      },
    ]);
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 6, precio: 15, unidad: 'u' }];
    localStorage.setItem('carritoPro', 'x');

    const { procesarVenta, procesandoVenta } = useCobro();
    await procesarVenta();

    // Venta persistida con costo FIFO y ganancia
    const ventasDb = await db.ventas.toArray();
    expect(ventasDb).toHaveLength(1);
    const v = ventasDb[0];
    expect(v.id).toMatch(/^v_/);
    expect(v.anulada).toBe(false);
    expect(v.total).toBe(90);
    expect(v.ganancia).toBe(30);
    expect(v.items[0].costo).toBe(60); // 6 x 10 (FIFO)
    expect(v.items[0].lotesUsados).toEqual([{ loteId: 'l_1', cantidad: 6, costo: 10 }]);

    // Lote actualizado y store recargado
    const lote = await db.lotes.get('l_1');
    expect(lote.cantidadVendida).toBe(6);
    expect(useLotesStore().lotes[0].cantidadVendida).toBe(6);

    // UI liberada
    expect(ventas.carrito).toHaveLength(0);
    expect(useUIStore().cobroAbierto).toBe(false);
    expect(procesandoVenta.value).toBe(false);
    expect(localStorage.getItem('carritoPro')).toBeNull();
    expect(toastMsg).toHaveBeenCalledWith('Venta exitosa: $90.00');
  });

  it('venta multi-lote consume FIFO en orden de fecha', async () => {
    await semillar({ id: 'p_1', nombre: 'Galleta', precio: 20 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 4,
        cantidadVendida: 0,
        costo: 10,
        fecha: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'l_2',
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 12,
        fecha: '2026-10-05T00:00:00.000Z',
      },
    ]);
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Galleta', cant: 6, precio: 20 }];

    const { procesarVenta } = useCobro();
    await procesarVenta();

    const v = (await db.ventas.toArray())[0];
    // FIFO: 4 del lote viejo (costo 10) + 2 del nuevo (costo 12) = 64
    expect(v.items[0].costo).toBe(64);
    expect(v.items[0].lotesUsados).toEqual([
      { loteId: 'l_1', cantidad: 4, costo: 10 },
      { loteId: 'l_2', cantidad: 2, costo: 12 },
    ]);
    expect(v.ganancia).toBe(120 - 64);

    const lotes = await db.lotes.toArray();
    const porId = Object.fromEntries(lotes.map((l) => [l.id, l.cantidadVendida]));
    expect(porId).toEqual({ l_1: 4, l_2: 2 });
  });

  it('stock insuficiente: no guarda nada y muestra el error', async () => {
    await semillar({ id: 'p_1', nombre: 'Refresco', precio: 15 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 2,
        cantidadVendida: 0,
        costo: 10,
        fecha: new Date().toISOString(),
      },
    ]);
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_1', nombre: 'Refresco', cant: 5, precio: 15 }];
    const ui = useUIStore();
    ui.cobroAbierto = true;

    const { procesarVenta, procesandoVenta } = useCobro();
    await procesarVenta();

    expect(await db.ventas.count()).toBe(0);
    const lote = await db.lotes.get('l_1');
    expect(lote.cantidadVendida).toBe(0);
    expect(toastMsg).toHaveBeenCalledTimes(1);
    expect(toastMsg.mock.calls[0][1]).toBe(TOAST.BAD);
    expect(procesandoVenta.value).toBe(false);
  });

  it('producto sin lotes: error de FIFO, sin venta', async () => {
    await semillar({ id: 'p_fantasma', nombre: 'Fantasma', precio: 9 }, []);
    const ventas = useVentasStore();
    ventas.carrito = [{ productoId: 'p_fantasma', nombre: 'Fantasma', cant: 1, precio: 9 }];

    const { procesarVenta } = useCobro();
    await procesarVenta();

    expect(await db.ventas.count()).toBe(0);
    expect(toastMsg).toHaveBeenCalledTimes(1);
    expect(toastMsg.mock.calls[0][1]).toBe(TOAST.BAD);
  });

  it('carrito con dos productos procesa ambos ítems en una venta', async () => {
    await semillar({ id: 'p_1', nombre: 'A', precio: 10 }, [
      {
        id: 'l_1',
        productoId: 'p_1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 5,
        fecha: new Date().toISOString(),
      },
    ]);
    await semillar({ id: 'p_2', nombre: 'B', precio: 4 }, [
      {
        id: 'l_2',
        productoId: 'p_2',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 2,
        fecha: new Date().toISOString(),
      },
    ]);
    const ventas = useVentasStore();
    ventas.carrito = [
      { productoId: 'p_1', nombre: 'A', cant: 2, precio: 10 },
      { productoId: 'p_2', nombre: 'B', cant: 3, precio: 4 },
    ];

    const { procesarVenta } = useCobro();
    await procesarVenta();

    const v = (await db.ventas.toArray())[0];
    expect(v.items).toHaveLength(2);
    expect(v.total).toBe(32); // 2*10 + 3*4
    expect(v.ganancia).toBe(32 - (2 * 5 + 3 * 2)); // 13
    expect(toastMsg).toHaveBeenCalledWith('Venta exitosa: $32.00');
  });
});

describe('cerrarCobro', () => {
  it('cierra el modal sin efectos secundarios', async () => {
    const ui = useUIStore();
    ui.cobroAbierto = true;
    const { cerrarCobro } = useCobro();
    cerrarCobro();
    expect(ui.cobroAbierto).toBe(false);
  });
});
