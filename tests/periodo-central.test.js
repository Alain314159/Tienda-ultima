/**
 * Tests del predicado central «en el período» (utils/fecha.ts: enPeriodo,
 * fechaMs, crearEnPeriodo) y de los 8 sitios que lo usan (4.1/4.2).
 *
 * Contrato que se fija (el mismo de tests/periodo.test.js):
 * - Un 'YYYY-MM-DD' sin hora es medianoche LOCAL, nunca UTC.
 * - periodoInicio es el INSTANTE exacto: tras un cierre, un registro del
 *   mismo día pero anterior al cierre queda FUERA (sin doble conteo).
 * - El primer período ya viene normalizado a medianoche local, así que
 *   ahí instante exacto y medianoche coinciden.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { fechaMs, enPeriodo, crearEnPeriodo } from '../src/utils/fecha';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useHistorial } from '../src/composables/useHistorial';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.ajustes.clear(),
    db.cierres.clear(),
    db.config.clear(),
  ]);
});

describe('fechaMs', () => {
  it("'YYYY-MM-DD' es medianoche local, no UTC", () => {
    expect(fechaMs('2026-10-14')).toBe(new Date(2026, 9, 14).getTime());
    expect(new Date(fechaMs('2026-10-14')).getHours()).toBe(0);
  });

  it('un ISO completo es su instante exacto (sin normalizar a medianoche)', () => {
    expect(fechaMs('2026-10-14T17:20:00.000Z')).toBe(new Date('2026-10-14T17:20:00.000Z').getTime());
  });

  it('Date y número pasan tal cual; inválido degrada a 0', () => {
    const d = new Date('2026-10-14T12:00:00.000Z');
    expect(fechaMs(d)).toBe(d.getTime());
    expect(fechaMs(123456)).toBe(123456);
    expect(fechaMs('chatarra')).toBe(0);
    expect(fechaMs('')).toBe(0);
  });
});

describe('enPeriodo / crearEnPeriodo', () => {
  it('inicio con fecha simple incluye un registro de ese día al mediodía', () => {
    expect(enPeriodo('2026-10-14T12:00:00.000Z', '2026-10-14')).toBe(true);
    expect(enPeriodo('2026-10-13T12:00:00.000Z', '2026-10-14')).toBe(false);
  });

  it('inicio con momento exacto excluye un registro anterior del mismo día', () => {
    expect(enPeriodo('2026-10-14T16:23:00.000Z', '2026-10-14T17:20:00.000Z')).toBe(false);
    expect(enPeriodo('2026-10-14T18:00:00.000Z', '2026-10-14T17:20:00.000Z')).toBe(true);
  });

  it('el fin es inclusivo', () => {
    expect(enPeriodo('2026-10-14T12:00:00.000Z', '2026-10-01', '2026-10-14T12:00:00.000Z')).toBe(true);
    expect(enPeriodo('2026-10-14T12:00:01.000Z', '2026-10-01', '2026-10-14T12:00:00.000Z')).toBe(false);
  });

  it('crearEnPeriodo da el mismo predicado con los límites pre-parseados', () => {
    const pred = crearEnPeriodo('2026-10-14T17:20:00.000Z');
    expect(pred('2026-10-14T16:23:00.000Z')).toBe(false);
    expect(pred('2026-10-14T18:00:00.000Z')).toBe(true);
    const rango = crearEnPeriodo('2026-10-10', '2026-10-12T23:59:59.999Z');
    expect(rango('2026-10-11T12:00:00.000Z')).toBe(true);
    expect(rango('2026-10-13T00:00:00.000Z')).toBe(false);
  });
});

describe('los stores de período usan el predicado central', () => {
  it('ventasPeriodo y gananciaBrutaPeriodo derivan de una sola lista filtrada', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z';
    await db.ventas.bulkPut([
      { id: 'v1', fecha: '2026-10-14T16:23:00.000Z', total: 120, ganancia: 30, anulada: false },
      { id: 'v2', fecha: '2026-10-14T18:00:00.000Z', total: 90, ganancia: 20, anulada: false },
      { id: 'v3', fecha: '2026-10-15T10:00:00.000Z', total: 50, ganancia: 10, anulada: true },
    ]);
    const s = useVentasStore();
    await s.cargarVentas();
    expect(s.ventasPeriodoLista.map((v) => v.id)).toEqual(['v2']);
    expect(s.ventasPeriodo).toBe(90);
    expect(s.gananciaBrutaPeriodo).toBe(20);
  });

  it('compras, gastos y mermas respetan el mismo límite exacto', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z';
    await db.compras.put({ id: 'c1', fecha: '2026-10-14T16:00:00.000Z', total: 360, anulada: false });
    await db.compras.put({ id: 'c2', fecha: '2026-10-14T19:00:00.000Z', total: 100, anulada: false });
    await db.gastos.put({ id: 'g1', fecha: '2026-10-14T16:30:00.000Z', monto: 50, categoria: 'Otros' });
    await db.gastos.put({ id: 'g2', fecha: '2026-10-14T19:00:00.000Z', monto: 7, categoria: 'Otros' });
    await db.ajustes.put({ id: 'a1', fecha: '2026-10-14T16:00:00.000Z', cantidad: -2, costoPerdida: 40 });
    await db.ajustes.put({ id: 'a2', fecha: '2026-10-14T19:00:00.000Z', cantidad: -1, costoPerdida: 5 });
    const c = useComprasStore();
    await c.cargarCompras();
    expect(c.comprasPeriodo).toBe(100);
    const g = useGastosStore();
    await g.cargarGastos();
    expect(g.gastosOpPeriodo).toBe(7);
    const a = useAjustesStore();
    await a.cargarAjustes();
    expect(a.mermasPeriodo).toBe(5);
  });

  it('cerrarPeriodo usa el mismo rango (sin doble conteo del día del cierre)', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z';
    await db.ventas.bulkPut([
      {
        id: 'v1',
        fecha: '2026-10-14T16:23:00.000Z',
        total: 120,
        ganancia: 30,
        anulada: false,
        items: [],
      },
      {
        id: 'v2',
        fecha: '2026-10-14T18:00:00.000Z',
        total: 90,
        ganancia: 20,
        anulada: false,
        items: [{ productoId: 'p1', precio: 90, cantidad: 1, costo: 70, ganancia: 20 }],
      },
    ]);
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    const cierres = useCierresStore();
    const cierre = await cierres.cerrarPeriodo();
    expect(cierre.ventas).toBe(90);
    expect(cierre.numVentas).toBe(1);
  });
});

describe('useHistorial agrupa con el predicado central', () => {
  it('un registro anterior al momento del cierre va a cerrados, no al actual', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z';
    await db.cierres.put({
      id: 'c1',
      periodo: 'Período 1',
      periodoInicio: '2026-10-01T00:00:00.000Z',
      periodoFin: '2026-10-14T17:20:00.000Z',
      fechaCierre: '2026-10-14T17:20:00.000Z',
      fecha: '2026-10-14T17:20:00.000Z',
      ganancia: 0,
    });
    const cierres = useCierresStore();
    await cierres.cargarCierres();
    const items = [
      { id: 'a', fecha: '2026-10-14T16:00:00.000Z' },
      { id: 'b', fecha: '2026-10-14T18:00:00.000Z' },
      { id: 'c', fecha: '2026-10-05T12:00:00.000Z' },
    ];
    const { agrupar } = useHistorial(() => items);
    const g = agrupar(items);
    expect(g.actual.map((x) => x.id)).toEqual(['b']);
    expect(g.cerrados).toHaveLength(1);
    expect(g.cerrados[0].items.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
});
