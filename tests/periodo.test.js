/**
 * Tests del límite de período (utils/fecha.ts + filtros de stores).
 *
 * Regresión: periodoInicio se guarda como timestamp exacto del momento de
 * inicialización (p.ej. 16:09:41Z) mientras que gastos/compras guardan la
 * fecha local-mediodía (fecha + T12:00:00). Un registro creado ese mismo
 * día quedaba FUERA de su período (12:00 < 16:09). Los filtros ahora
 * normalizan el inicio del período a medianoche local.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { inicioDiaLocal } from '../src/utils/fecha';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useConfigStore } from '../src/stores/useConfigStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([db.gastos.clear(), db.compras.clear(), db.ventas.clear(), db.config.clear()]);
});

describe('inicioDiaLocal', () => {
  it('normaliza a medianoche local del mismo día', () => {
    const iso = '2026-10-14T16:09:41.717Z';
    const d = inicioDiaLocal(iso);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    // sigue siendo el MISMO día local que la fecha original
    const orig = new Date(iso);
    expect(d.getFullYear()).toBe(orig.getFullYear());
    expect(d.getMonth()).toBe(orig.getMonth());
    expect(d.getDate()).toBe(orig.getDate());
  });

  it('fecha inválía degrada a epoch (incluye todo el histórico)', () => {
    const d = inicioDiaLocal('chatarra');
    expect(d.getTime()).toBe(0);
    expect(inicioDiaLocal(undefined).getTime()).toBe(0);
  });
});

describe('límites de período con periodoInicio a media tarde', () => {
  // Escenario del bug: la app se inicializó a las 16:09 y el gasto del
  // mismo día se registró con fecha local-mediodía (12:00Z en UTC-4)
  const TARDE = '2026-10-14T16:09:41.717Z';

  it('un gasto del MISMO día pertenece al período', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = TARDE;
    await db.gastos.put({ id: 'g1', fecha: '2026-10-14T12:00:00.000Z', monto: 85, categoria: 'Luz' });
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(85);
    // un gasto de ayer sigue FUERA
    await db.gastos.put({ id: 'g2', fecha: '2026-10-13T12:00:00.000Z', monto: 30, categoria: 'Agua' });
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(85);
  });

  it('una compra del MISMO día pertenece al período', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = TARDE;
    await db.compras.put({ id: 'c1', fecha: '2026-10-14T12:00:00.000Z', total: 360, anulada: false });
    const s = useComprasStore();
    await s.cargarCompras();
    expect(s.comprasPeriodo).toBe(360);
    // anuladas no cuentan aunque estén en el período
    await db.compras.put({ id: 'c2', fecha: '2026-10-14T13:00:00.000Z', total: 100, anulada: true });
    await s.cargarCompras();
    expect(s.comprasPeriodo).toBe(360);
  });

  it('una venta del MISMO día pertenece al período', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = TARDE;
    await db.ventas.put({ id: 'v1', fecha: '2026-10-14T12:00:00.000Z', total: 120, ganancia: 30, anulada: false });
    const s = useVentasStore();
    await s.cargarVentas();
    expect(s.ventasPeriodo).toBe(120);
    expect(s.gananciaBrutaPeriodo).toBe(30);
  });

  it('registros de días ANTERIORES al arranque quedan fuera', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = TARDE;
    // dos días antes, a cualquier hora: fuera en cualquier huso horario
    await db.gastos.put({ id: 'g0', fecha: '2026-10-12T12:00:00.000Z', monto: 50, categoria: 'Otros' });
    const s = useGastosStore();
    await s.cargarGastos();
    expect(s.gastosOpPeriodo).toBe(0);
  });
});
