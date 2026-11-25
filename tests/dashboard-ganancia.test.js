/**
 * Bug del dueño (2026-10-17): "Yo retiro la ganancia pero el Dashboard
 * sigue mostrando la ganancia como si la tuviera".
 *
 * El card "Ganancia" del Dashboard mostraba la ganancia NETA DEL PERÍODO
 * (métrica de gestión que por diseño no descuenta retiros). El dueño
 * retira y el número no se mueve → parece que la app "no se entera".
 *
 * Contrato nuevo: el card muestra la ganancia DISPONIBLE (acumulada −
 * retirada, la misma cifra que valida el retiro en SociosView) y, si hay
 * retiros, un desglose "Generada / Retirada".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import AppIcon from '../src/components/AppIcon.vue';
import DashboardView from '../src/views/DashboardView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { name: 'dashboard' } } }),
  useRoute: () => ({ hash: '', query: {} }),
}));

function montarDashboard() {
  return mount(DashboardView, {
    global: {
      components: { Icon: AppIcon },
      provide: { sec: 'dashboard' },
      stubs: { teleport: true },
    },
  });
}

/** Extrae el card de Ganancia (lbl "Ganancia") del grid de stats. */
function cardGanancia(w) {
  const stats = w.findAll('.stat');
  return stats.find((s) => s.find('.lbl').text().includes('Ganancia'));
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.cierres.clear(),
    db.movCaja.clear(),
    db.retiros.clear(),
    db.capital.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
});

describe('Dashboard: el card Ganancia refleja los retiros', () => {
  it('sin retiros muestra la ganancia acumulada disponible', async () => {
    // Un cierre anterior con ganancia 100 y sin ventas en el período actual:
    // disponible = 100
    await db.cierres.put({ id: 'c1', fecha: '2026-09-15T00:00:00.000Z', ganancia: 100 });
    await useCierresStore().cargarCierres();
    await useCapitalStore().cargarTodo();

    const w = montarDashboard();
    await flushPromises();

    const card = cardGanancia(w);
    expect(card).toBeTruthy();
    expect(card.find('.val').text()).toBe('$100.00');
    // Sin retiros no hay desglose
    expect(card.find('.stat-sub').exists()).toBe(false);
    w.unmount();
  });

  it('tras retirar, el número BAJA y aparece el desglose Generada/Retirada', async () => {
    await db.cierres.put({ id: 'c1', fecha: '2026-09-15T00:00:00.000Z', ganancia: 100 });
    await db.retiros.put({
      id: 'r1',
      fecha: '2026-10-10T00:00:00.000Z',
      monto: 60,
      concepto: 'retiro del dueño',
      tipoRetiro: 'ganancia',
    });
    await useCierresStore().cargarCierres();
    await useCapitalStore().cargarTodo();

    const capital = useCapitalStore();
    expect(capital.gananciaDisponible).toBe(40); // sanity del fixture

    const w = montarDashboard();
    await flushPromises();

    const card = cardGanancia(w);
    expect(card.find('.val').text()).toBe('$40.00');

    const sub = card.find('.stat-sub');
    expect(sub.exists()).toBe(true);
    expect(sub.text()).toContain('Generada');
    expect(sub.text()).toContain('$100.00');
    expect(sub.text()).toContain('Retirada');
    expect(sub.text()).toContain('$60.00');
    w.unmount();
  });

  it('retiro de TODO lo generado → el card muestra $0.00', async () => {
    await db.cierres.put({ id: 'c1', fecha: '2026-09-15T00:00:00.000Z', ganancia: 100 });
    await db.retiros.put({
      id: 'r1',
      fecha: '2026-10-10T00:00:00.000Z',
      monto: 100,
      concepto: 'retiro total',
      tipoRetiro: 'ganancia',
    });
    await useCierresStore().cargarCierres();
    await useCapitalStore().cargarTodo();

    const w = montarDashboard();
    await flushPromises();

    const card = cardGanancia(w);
    expect(card.find('.val').text()).toBe('$0.00');
    w.unmount();
  });

  it('los retiros de CAPITAL no tocan la ganancia disponible mostrada', async () => {
    await db.cierres.put({ id: 'c1', fecha: '2026-09-15T00:00:00.000Z', ganancia: 100 });
    await db.retiros.put({
      id: 'r1',
      fecha: '2026-10-10T00:00:00.000Z',
      monto: 50,
      concepto: 'retiro de capital',
      tipoRetiro: 'capital',
    });
    await useCierresStore().cargarCierres();
    await useCapitalStore().cargarTodo();

    const w = montarDashboard();
    await flushPromises();

    const card = cardGanancia(w);
    expect(card.find('.val').text()).toBe('$100.00');
    expect(card.find('.stat-sub').exists()).toBe(false); // solo cuenta retiros de ganancia
    w.unmount();
  });
});
