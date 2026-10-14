/**
 * Tests de useHistorial — paginación y agrupación por períodos.
 *
 * Regresión clave: la vieja caché por firma (length + id primero/último)
 * devolvía referencias VIEJAS cuando un registro se mutaba sin cambiar la
 * firma (anular venta, editar gasto): la UI no reflejaba la anulación
 * hasta recargar la página. agrupar() debe devolver SIEMPRE los objetos
 * actuales del getter.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

import { db } from '../src/db';
import { useHistorial } from '../src/composables/useHistorial';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCierresStore } from '../src/stores/useCierresStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all([db.cierres.clear(), db.config.clear()]);
  useConfigStore().cfg.periodoInicio = '2026-10-01T16:09:41.717Z';
});

describe('useHistorial.agrupar', () => {
  it('mutaciones sin cambio de firma devuelven objetos FRESCOS (regresión caché)', () => {
    const items = ref([{ id: 'v1', fecha: '2026-10-14T12:00:00.000Z', anulada: false, total: 100 }]);
    const hist = useHistorial(() => items.value);

    const antes = hist.agruparActual();
    expect(antes.actual[0].anulada).toBe(false);

    // Simula cargarVentas(): se reemplaza el array por objetos NUEVOS con
    // la mutación aplicada (misma longitud, mismos ids → firma idéntica)
    items.value = [{ id: 'v1', fecha: '2026-10-14T12:00:00.000Z', anulada: true, total: 100 }];

    const despues = hist.agruparActual();
    expect(despues.actual[0].anulada).toBe(true);
    // y son las referencias actuales, no las viejas
    expect(despues.actual[0]).toBe(items.value[0]);
  });

  it('registros del día de inicio del período van al grupo actual (medianoche local)', () => {
    const items = ref([
      { id: 'v1', fecha: '2026-10-01T12:00:00.000Z' }, // mismo día que periodoInicio 16:09
      { id: 'v2', fecha: '2026-09-20T12:00:00.000Z' }, // antes: sin cierre → antiguos
    ]);
    const hist = useHistorial(() => items.value);
    const g = hist.agruparActual();
    expect(g.actual.map((x) => x.id)).toEqual(['v1']);
    expect(g.cerrados).toHaveLength(1);
    expect(g.cerrados[0].cierre.id).toBe('__antiguos__');
    expect(g.cerrados[0].items.map((x) => x.id)).toEqual(['v2']);
  });

  it('registros fuera del período actual se agrupan bajo su cierre', async () => {
    const cierres = useCierresStore();
    await db.cierres.put({
      id: 'cie1',
      periodo: 'Período septiembre',
      periodoInicio: '2026-09-01T10:00:00.000Z',
      periodoFin: '2026-09-30T20:00:00.000Z',
      fechaCierre: '2026-09-30T20:00:00.000Z',
      ganancia: 50,
    });
    await cierres.cargarCierres();

    const items = ref([{ id: 'v9', fecha: '2026-09-15T12:00:00.000Z' }]);
    const hist = useHistorial(() => items.value);
    const g = hist.agruparActual();
    expect(g.actual).toHaveLength(0);
    expect(g.cerrados[0].cierre.id).toBe('cie1');
    expect(g.cerrados[0].items[0].id).toBe('v9');
  });

  it('paginación incremental: itemsMostrados/hayMas/restantes/mostrarMas', () => {
    const items = ref(Array.from({ length: 45 }, (_, i) => ({ id: 'v' + i, fecha: '2026-10-14T12:00:00.000Z' })));
    const hist = useHistorial(() => items.value);
    const g = hist.agruparActual();
    expect(hist.itemsMostrados(g.actual)).toHaveLength(20);
    expect(hist.hayMas(g.actual)).toBe(true);
    expect(hist.restantes(g.actual)).toBe(25);
    hist.mostrarMas();
    expect(hist.itemsMostrados(g.actual)).toHaveLength(40);
    hist.mostrarMas();
    expect(hist.itemsMostrados(g.actual)).toHaveLength(45);
    expect(hist.hayMas(g.actual)).toBe(false);
    hist.reset();
    expect(hist.itemsMostrados(g.actual)).toHaveLength(20);
  });

  it('toggle de grupos cerrados y estado abierto', () => {
    const hist = useHistorial(() => []);
    expect(hist.abierto('c1')).toBe(false);
    hist.toggle('c1');
    expect(hist.abierto('c1')).toBe(true);
    hist.toggle('c1');
    expect(hist.abierto('c1')).toBe(false);
  });
});
