/**
 * Tests del flujo completo de anular una venta (punto 6.2):
 * - anularVenta: la venta queda marcada anulada (con fechaAnulacion),
 *   el stock vuelve al lote y los totales/ganancia se corrigen.
 * - anularProductoEnVenta: corrige total/ganancia y restaura solo ese ítem.
 * - anular y luego cerrar el período: la venta anulada no entra al cierre.
 *
 * Hueco que cubre: los tests existentes prueban el doble-tap idempotente,
 * la concurrencia entre pestañas y la UI, pero no el camino feliz a nivel
 * de store (venta → anulada → stock y totales corregidos).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useConfigStore } from '../src/stores/useConfigStore';

const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

/** Venta v1: 3 uds. de Leche a 10 (costo 15, ganancia 15), lote l1 con 3 vendidas. */
async function sembrarVentaSimple(fecha = new Date().toISOString()) {
  await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
  await db.ventas.put({
    id: 'v1',
    fecha,
    items: [
      {
        productoId: 'p1',
        nombre: 'Leche',
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
  await useVentasStore().cargarVentas();
  await useLotesStore().cargarLotes();
}

/** Venta v1 con dos ítems (lotes l1 y l2): total 50, ganancia 25. */
async function sembrarVentaDosItems() {
  await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
  await db.productos.put({ id: 'p2', nombre: 'Pan', precio: 10, archivado: false });
  await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
  await db.lotes.put({ id: 'l2', productoId: 'p2', cantidadInicial: 50, cantidadVendida: 2, costo: 5 });
  await db.ventas.put({
    id: 'v1',
    fecha: new Date().toISOString(),
    items: [
      {
        productoId: 'p1',
        nombre: 'Leche',
        cantidad: 3,
        precio: 10,
        costo: 15,
        ganancia: 15,
        lotesUsados: [{ loteId: 'l1', cantidad: 3, costo: 5 }],
      },
      {
        productoId: 'p2',
        nombre: 'Pan',
        cantidad: 2,
        precio: 10,
        costo: 10,
        ganancia: 10,
        lotesUsados: [{ loteId: 'l2', cantidad: 2, costo: 5 }],
      },
    ],
    total: 50,
    ganancia: 25,
    anulada: false,
  });
  await useVentasStore().cargarVentas();
  await useLotesStore().cargarLotes();
}

beforeEach(async () => {
  await Promise.all([
    db.ventas.clear(),
    db.lotes.clear(),
    db.productos.clear(),
    db.cierres.clear(),
    db.config.clear(),
    db.movCaja.clear(),
    db.arqueos.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.ajustes.clear(),
  ]);
  setActivePinia(createPinia());
});

describe('anularVenta: camino feliz', () => {
  it('marca la venta anulada con fechaAnulacion y persiste en la BD', async () => {
    await sembrarVentaSimple();
    const ventas = useVentasStore();

    await ventas.anularVenta('v1');

    const enMemoria = ventas.ventas.find((v) => v.id === 'v1');
    expect(enMemoria.anulada).toBe(true);
    expect(enMemoria.fechaAnulacion).toBeTruthy();
    const enDb = await db.ventas.get('v1');
    expect(enDb.anulada).toBe(true);
    expect(enDb.fechaAnulacion).toBeTruthy();
    // La venta sigue existiendo (no se borra): queda como registro anulado
    expect(await db.ventas.count()).toBe(1);
  });

  it('devuelve el stock al lote (cantidadVendida 3 → 0, disponible 97 → 100)', async () => {
    await sembrarVentaSimple();
    const lotes = useLotesStore();
    expect(lotes.stockMap.p1).toBe(97);

    await useVentasStore().anularVenta('v1');
    await lotes.cargarLotes();

    expect((await db.lotes.get('l1')).cantidadVendida).toBe(0);
    expect(lotes.stockMap.p1).toBe(100);
  });

  it('corrige los totales: ventasTotal, ventasPeriodo, ganancia y caja caen a 0', async () => {
    await sembrarVentaSimple();
    const ventas = useVentasStore();
    const caja = useCajaStore();
    expect(ventas.ventasTotal).toBe(30);
    expect(ventas.ventasPeriodo).toBe(30);
    expect(ventas.gananciaBrutaPeriodo).toBe(15);
    expect(caja.saldoCaja).toBe(30);

    await ventas.anularVenta('v1');

    expect(ventas.ventasTotal).toBe(0);
    expect(ventas.ventasPeriodo).toBe(0);
    expect(ventas.gananciaBrutaPeriodo).toBe(0);
    expect(caja.saldoCaja).toBe(0);
  });

  it('anular dos veces seguidas no restaura el stock dos veces', async () => {
    await sembrarVentaSimple();
    const ventas = useVentasStore();

    await ventas.anularVenta('v1');
    await expect(ventas.anularVenta('v1')).resolves.toBeUndefined();

    expect((await db.lotes.get('l1')).cantidadVendida).toBe(0);
    expect(useLotesStore().stockMap.p1).toBe(100);
  });
});

describe('anularProductoEnVenta: camino feliz', () => {
  it('anula solo ese ítem: total 50 → 30, ganancia 25 → 15, solo su lote vuelve', async () => {
    await sembrarVentaDosItems();
    const ventas = useVentasStore();
    const lotes = useLotesStore();

    await ventas.anularProductoEnVenta('v1', 1);

    const v = await db.ventas.get('v1');
    expect(v.anulada).toBe(false); // la venta sigue vigente
    expect(v.items[1].anulado).toBe(true);
    expect(v.items[0].anulado).toBeFalsy();
    expect(v.total).toBe(30);
    expect(v.ganancia).toBe(15);
    expect(ventas.ventasTotal).toBe(30);
    expect(ventas.gananciaBrutaPeriodo).toBe(15);
    // Solo el lote del ítem anulado se restaura
    expect((await db.lotes.get('l2')).cantidadVendida).toBe(0);
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(3);
    expect(lotes.stockMap.p2).toBe(50);
    expect(lotes.stockMap.p1).toBe(97);
  });
});

describe('anularVenta + cerrarPeriodo', () => {
  it('la venta anulada no entra al cierre (ventas 0, numVentas 0, ganancia 0)', async () => {
    await sembrarVentaSimple();
    // La venta es de hoy; el período arranca a medianoche de hoy por defecto
    const ventas = useVentasStore();
    expect(ventas.ventasPeriodo).toBe(30);

    await ventas.anularVenta('v1');
    const cierre = await useCierresStore().cerrarPeriodo();

    expect(cierre.ventas).toBe(0);
    expect(cierre.numVentas).toBe(0);
    expect(cierre.cogs).toBe(0);
    expect(cierre.gananciaBruta).toBe(0);
    expect(cierre.ganancia).toBe(0);
    expect(cierre.cajaFinal).toBe(0);
    // El inventario sí se restaura y se valora en el cierre
    expect(cierre.valorInventario).toBe(500); // 100 uds. x 5
    expect(await db.cierres.count()).toBe(1);
    // El período se reinicia tras el cierre
    expect(useConfigStore().cfg.periodoInicio).toBe(cierre.periodoFin);
  });

  it('cerrar con la venta vigente y luego anular no reabre el período cerrado', async () => {
    // Venta de ayer, dentro del período viejo (30 días atrás)
    await sembrarVentaSimple(HACE(1));
    const ventas = useVentasStore();
    useConfigStore().cfg.periodoInicio = HACE(30);

    const cierre = await useCierresStore().cerrarPeriodo();
    expect(cierre.ventas).toBe(30);
    expect(cierre.numVentas).toBe(1);

    // Anular después del cierre: el cierre ya guardado no cambia
    await ventas.anularVenta('v1');
    const guardado = await db.cierres.get(cierre.id);
    expect(guardado.ventas).toBe(30);
    expect(guardado.ganancia).toBe(15);
    // Pero los totales del período nuevo ya no la cuentan
    expect(ventas.ventasTotal).toBe(0);
  });
});
