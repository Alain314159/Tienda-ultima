/**
 * Tests del límite de período (utils/fecha.ts + filtros de stores).
 *
 * Semántica fijada:
 * - El PRIMER período arranca a medianoche local del día de alta (default
 *   del config + migración one-shot en cargarCierres): los registros de ese
 *   día (guardados con fecha local-mediodía) cuentan en el período.
 * - Tras un cierre, el nuevo período arranca en el MOMENTO EXACTO del
 *   cierre: un registro de ese mismo día pero anterior al cierre pertenece
 *   al período CERRADO — contar también en el nuevo sería doble conteo de
 *   ganancia (cierres.ganancia + gananciaNetaPeriodo).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { inicioDiaLocal } from '../src/utils/fecha';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useConfigStore } from '../src/stores/useConfigStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([db.gastos.clear(), db.compras.clear(), db.ventas.clear(), db.config.clear(), db.cierres.clear()]);
});

describe('inicioDiaLocal', () => {
  it('normaliza a medianoche local del mismo día', () => {
    const iso = '2026-10-14T16:09:41.717Z';
    const d = inicioDiaLocal(iso);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    const orig = new Date(iso);
    expect(d.getFullYear()).toBe(orig.getFullYear());
    expect(d.getMonth()).toBe(orig.getMonth());
    expect(d.getDate()).toBe(orig.getDate());
  });

  it('fecha inválida degrada a epoch (incluye todo el histórico)', () => {
    expect(inicioDiaLocal('chatarra').getTime()).toBe(0);
    expect(inicioDiaLocal(undefined).getTime()).toBe(0);
  });
});

describe('migración del primer período a medianoche', () => {
  it('sin cierres, cargarCierres normaliza un periodoInicio con hora y persiste', async () => {
    const config = useConfigStore();
    const mediodia = '2026-10-14T12:00:00.000Z'; // como lo guardaría la BD vieja
    config.cfg.periodoInicio = mediodia;
    const s = useCierresStore();
    await s.cargarCierres();
    expect(new Date(config.cfg.periodoInicio).getHours()).toBe(0);
    expect(new Date(config.cfg.periodoInicio).getDate()).toBe(new Date(mediodia).getDate());
    const enDb = await db.config.get('cfg');
    expect(new Date(enDb.value.periodoInicio).getHours()).toBe(0);
  });

  it('con cierres existentes NO se toca el momento exacto del último cierre', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:33.000Z'; // momento de un cierre
    await db.cierres.put({ id: 'c1', periodo: 'x', fechaCierre: '2026-10-14T17:20:33.000Z', ganancia: 5 });
    const s = useCierresStore();
    await s.cargarCierres();
    expect(config.cfg.periodoInicio).toBe('2026-10-14T17:20:33.000Z');
  });
});

describe('límites del período', () => {
  it('primer período (medianoche): un gasto del MISMO día pertenece', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = inicioDiaLocal('2026-10-14T16:09:41.717Z').toISOString();
    await db.gastos.put({ id: 'g1', fecha: '2026-10-14T12:00:00.000Z', monto: 85, categoria: 'Luz' });
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(85);
    // un gasto de días antes sigue FUERA
    await db.gastos.put({ id: 'g2', fecha: '2026-10-11T12:00:00.000Z', monto: 30, categoria: 'Agua' });
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(85);
  });

  it('tras cierre a media tarde: registro ANTERIOR al cierre queda fuera del nuevo período (sin doble conteo)', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z'; // momento exacto del cierre
    await db.ventas.put({ id: 'v1', fecha: '2026-10-14T16:23:00.000Z', total: 120, ganancia: 30, anulada: false });
    await db.ventas.put({ id: 'v2', fecha: '2026-10-14T18:00:00.000Z', total: 90, ganancia: 20, anulada: false });
    const s = useVentasStore();
    await s.cargarVentas();
    // solo la venta POSTERIOR al momento del cierre
    expect(s.ventasPeriodo).toBe(90);
    expect(s.gananciaBrutaPeriodo).toBe(20);
  });

  it('compras y gastos respetan el mismo límite exacto', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-14T17:20:00.000Z';
    await db.compras.put({ id: 'c1', fecha: '2026-10-14T16:00:00.000Z', total: 360, anulada: false });
    await db.compras.put({ id: 'c2', fecha: '2026-10-14T19:00:00.000Z', total: 100, anulada: false });
    await db.gastos.put({ id: 'g1', fecha: '2026-10-14T16:30:00.000Z', monto: 50, categoria: 'Otros' });
    const c = useComprasStore();
    await c.cargarCompras();
    expect(c.comprasPeriodo).toBe(100);
    const g = useGastosStore();
    await g.cargarGastos();
    expect(g.gastosOpPeriodo).toBe(0);
  });
});
