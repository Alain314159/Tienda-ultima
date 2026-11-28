/**
 * Regresión de la reorganización de navegación (2026-11-27):
 * - SheetMas: grupos "Tienda" y "Sincronización y ajustes" (antes
 *   "Operaciones" y "Sistema"); "Finanzas y reportes" sin cambio.
 * - DashboardView: fila de accesos rápidos con sus 4 destinos.
 * - ReportesView: tarjetas ordenadas por frecuencia de uso
 *   (Cuadre, Arqueo, Cerrar, Historial, Libro) y ancla ref-arqueo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import AppIcon from '../src/components/AppIcon.vue';
import SheetMas from '../src/components/SheetMas.vue';
import DashboardView from '../src/views/DashboardView.vue';
import ReportesView from '../src/views/ReportesView.vue';

// DashboardView/ReportesView navegan con useRouter/ir: mock con push espiable
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), currentRoute: { value: { name: 'dashboard' } } }),
  useRoute: () => ({ hash: '', query: {} }),
}));

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  mockPush.mockClear();
  localStorage.clear();
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.cierres.clear(),
    db.movCaja.clear(),
    db.arqueos.clear(),
    db.asientos.clear(),
    db.config.clear(),
  ]);
  useConfigStore().cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
});

function montar(componente, props = {}) {
  return mount(componente, {
    props,
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
}

describe('SheetMas: grupos renombrados', () => {
  it('muestra Tienda, Finanzas y reportes y Sincronización y ajustes (sin los nombres viejos)', async () => {
    const w = montar(SheetMas, { abierto: true, sec: 'dashboard' });
    const grupos = w.findAll('.sheet-group').map((g) => g.text().trim());
    expect(grupos).toEqual(['Tienda', 'Finanzas y reportes', 'Sincronización y ajustes']);
    expect(w.text()).not.toContain('Operaciones');
    w.unmount();
  });

  it('los botones y sus destinos no cambiaron con el renombre', async () => {
    const w = montar(SheetMas, { abierto: true, sec: 'productos' });
    const porTexto = (t) =>
      w.findAll('.sheet-btn').filter((b) => b.text().includes(t))[0];

    await porTexto('Gastos').trigger('click');
    expect(w.emitted('ir')).toEqual([['gastos']]);
    await porTexto('Compartir por WiFi').trigger('click');
    expect(w.emitted('abrir-sync')).toHaveLength(1);
    await porTexto('Nube y cuenta').trigger('click');
    expect(w.emitted('abrir-cuenta')).toHaveLength(1);
    await porTexto('Ajustes').trigger('click');
    expect(w.emitted('abrir-ajustes')).toHaveLength(1);
    w.unmount();
  });
});

describe('DashboardView: accesos rápidos', () => {
  it('tiene los 4 accesos, en orden, debajo de las stats y encima del gráfico', async () => {
    const w = montar(DashboardView);
    await flushPromises();

    expect(w.text()).toContain('Accesos rápidos');
    const fila = w.find('.quick-row');
    expect(fila.exists()).toBe(true);
    const textos = fila.findAll('button').map((b) => b.text().trim());
    expect(textos).toEqual(['Nueva venta', 'Nueva compra', 'Nuevo gasto', 'Registrar arqueo']);

    // Altura táctil mínima 44px (2.75rem) en cada botón
    for (const b of fila.findAll('button')) {
      expect(b.attributes('style')).toContain('min-height: 2.75rem');
    }

    // Posición: después de las stats (.grid2) y antes del gráfico
    const html = w.html();
    expect(html.indexOf('quick-row')).toBeGreaterThan(html.indexOf('grid2'));
    expect(html.indexOf('quick-row')).toBeLessThan(html.indexOf('Ventas vs Ganancia'));
    w.unmount();
  });

  it('cada acceso navega a su destino (arqueo a reportes con refId arqueo)', async () => {
    const w = montar(DashboardView);
    await flushPromises();
    const fila = w.find('.quick-row');
    const botones = fila.findAll('button');

    await botones[0].trigger('click');
    expect(mockPush).toHaveBeenCalledWith({ name: 'ventas' });
    await botones[1].trigger('click');
    expect(mockPush).toHaveBeenCalledWith({ name: 'compras' });
    await botones[2].trigger('click');
    expect(mockPush).toHaveBeenCalledWith({ name: 'gastos' });
    await botones[3].trigger('click');
    // El helper ir() navega a reportes y luego busca #ref-arqueo (400ms):
    // aquí solo se verifica la navegación; el ancla se cubre en ReportesView
    expect(mockPush).toHaveBeenCalledWith({ name: 'reportes' });
    w.unmount();
  });
});

describe('ReportesView: orden por frecuencia de uso + ancla de arqueo', () => {
  it('las tarjetas van Cuadre, Arqueo, Cerrar, Historial, Libro Diario', async () => {
    const w = montar(ReportesView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 100));
    await flushPromises();

    const titulos = w.findAll('.card > h2.card-title').map((h) => h.text().trim());
    expect(titulos).toEqual([
      'Cuadre por Período',
      'Arqueo de Caja',
      'Cerrar Período',
      'Historial de Cierres',
      'Libro Diario',
    ]);
    w.unmount();
  });

  it('la tarjeta de arqueo tiene id ref-arqueo para el atajo del dashboard', async () => {
    const w = montar(ReportesView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 100));
    await flushPromises();

    const ancla = w.find('#ref-arqueo');
    expect(ancla.exists()).toBe(true);
    expect(ancla.text()).toContain('Arqueo de Caja');
    expect(ancla.text()).toContain('Registrar arqueo');
    w.unmount();
  });
});
