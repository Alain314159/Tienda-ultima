/**
 * Tests del store de compras (solo lectura: computeds) tras la limpieza
 * de código muerto, + wrappers de UI (toast y navegación).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useConfigStore } from '../src/stores/useConfigStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await db.compras.clear();
  await db.config.clear();
});

describe('useComprasStore (computeds)', () => {
  it('comprasTotal excluye las anuladas', async () => {
    await db.compras.bulkPut([
      { id: 'c1', total: 100, anulada: false, fecha: '2026-10-01' },
      { id: 'c2', total: 250, anulada: false, fecha: '2026-10-02' },
      { id: 'c3', total: 999, anulada: true, fecha: '2026-10-03' },
    ]);
    const s = useComprasStore();
    await s.cargarCompras();
    expect(s.comprasTotal).toBe(350);
  });

  it('comprasPeriodo solo suma desde periodoInicio', async () => {
    const config = useConfigStore();
    config.cfg.periodoInicio = '2026-10-10T00:00:00.000Z';
    await db.compras.bulkPut([
      { id: 'c1', total: 100, anulada: false, fecha: '2026-10-01T10:00:00.000Z' }, // antes del período
      { id: 'c2', total: 250, anulada: false, fecha: '2026-10-12T10:00:00.000Z' }, // dentro
      { id: 'c3', total: 50, anulada: true, fecha: '2026-10-13T10:00:00.000Z' }, // anulada dentro
    ]);
    const s = useComprasStore();
    await s.cargarCompras();
    expect(s.comprasPeriodo).toBe(250);
  });

  it('comprasOrdenadas va de la más reciente a la más vieja', async () => {
    await db.compras.bulkPut([
      { id: 'c1', total: 1, anulada: false, fecha: '2026-10-01T10:00:00.000Z' },
      { id: 'c2', total: 2, anulada: false, fecha: '2026-10-05T10:00:00.000Z' },
      { id: 'c3', total: 3, anulada: false, fecha: '2026-10-03T10:00:00.000Z' },
    ]);
    const s = useComprasStore();
    await s.cargarCompras();
    expect(s.comprasOrdenadas.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
  });
});

describe('toastMsg (wrapper de vue-sonner)', () => {
  it('mapea tipos internos a success/warning/error con su vibración', async () => {
    const { toastMsg } = await import('../src/utils/toast');
    const { toast } = await import('vue-sonner');
    const spyS = vi.spyOn(toast, 'success').mockImplementation(() => {});
    const spyW = vi.spyOn(toast, 'warning').mockImplementation(() => {});
    const spyE = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const vib = vi.fn();
    navigator.vibrate = vib;

    toastMsg('Guardado');
    expect(spyS).toHaveBeenCalledWith('Guardado', { duration: 3000 });
    toastMsg('Cuidado', 'warn');
    expect(spyW).toHaveBeenCalledWith('Cuidado', { duration: 3000 });
    toastMsg('Error', 'bad');
    expect(spyE).toHaveBeenCalledWith('Error', { duration: 3000 });
    // ok vibra corto (20), problemas vibran más (40)
    expect(vib).toHaveBeenNthCalledWith(1, 20);
    expect(vib).toHaveBeenNthCalledWith(2, 40);
    expect(vib).toHaveBeenNthCalledWith(3, 40);
  });

  it('una acción opcional alarga el toast y conecta el callback', async () => {
    const { toastMsg } = await import('../src/utils/toast');
    const { toast } = await import('vue-sonner');
    const spy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    navigator.vibrate = vi.fn();
    const cb = vi.fn();
    toastMsg('Venta ok', 'ok', 'Ver', cb);
    const opts = spy.mock.calls[0][1];
    expect(opts.duration).toBe(5000);
    opts.action.onClick();
    expect(cb).toHaveBeenCalled();
  });
});

describe('ir (navegación con highlight)', () => {
  it('empuja la ruta si es distinta y resalta el elemento ref-', async () => {
    vi.useFakeTimers();
    const { ir } = await import('../src/utils/navegacion');
    const push = vi.fn();
    const router = { currentRoute: { value: { name: 'inicio' } }, push };
    const el = document.createElement('div');
    el.id = 'ref-stock';
    document.body.appendChild(el);

    ir(router, 'reportes', 'stock');
    expect(push).toHaveBeenCalledWith({ name: 'reportes' });
    vi.advanceTimersByTime(400);
    expect(el.classList.contains('highlight-flash')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(el.classList.contains('highlight-flash')).toBe(false);

    // misma ruta: no vuelve a empujar
    ir({ currentRoute: { value: { name: 'inicio' } }, push }, 'inicio');
    expect(push).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
