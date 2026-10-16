/**
 * Tests PROFUNDOS de ReportesView montada — Área 7 (parte B).
 * Arqueo con confirmación y espejo en movCaja, cierre de período con
 * confirmación, y el libro diario visible y balanceado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useCierresStore } from '../src/stores/useCierresStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import ReportesView from '../src/views/ReportesView.vue';

async function montar() {
  const wrapper = mount(ReportesView, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 100));
  await flushPromises();
  return wrapper;
}

async function esperar(cond, ms = 3000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 25));
    await flushPromises();
  }
  return cond();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([
    db.cierres.clear(),
    db.movCaja.clear(),
    db.arqueos.clear(),
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.capital.clear(),
    db.retiros.clear(),
    db.distribuciones.clear(),
    db.socios.clear(),
    db.asientos.clear(),
    db.config.clear(),
  ]);
  const config = useConfigStore();
  config.cfg.capitalInicial = 1000;
  config.cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
  await useCajaStore().cargarTodo();
  await useCierresStore().cargarTodo();
});

describe('ReportesView: arqueo de caja', () => {
  it('conteo vacío o Infinity rechazado sin confirmación', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    const input = w.find('input[placeholder="Contado físico en caja"]');
    await w
      .findAll('button')
      .filter((b) => b.text().includes('Registrar arqueo'))[0]
      .trigger('click');
    await flushPromises();
    await input.setValue('1e999');
    await w
      .findAll('button')
      .filter((b) => b.text().includes('Registrar arqueo'))[0]
      .trigger('click');
    await flushPromises();
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.arqueos.count()).toBe(0);
    expect(useUIStore().confirm.activo).toBe(false);
    w.unmount();
  });

  it('conteo con SOBRA: confirmación explícita → arqueo + ingreso en movCaja', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await w.find('input[placeholder="Contado físico en caja"]').setValue('1200');
    await flushPromises();
    // Diferencia en vivo (la UI dice "Sobra", el confirmatorio "SOBRA")
    expect(w.text()).toContain('Sobra');
    expect(w.text()).toContain('$200.00');

    await w
      .findAll('button')
      .filter((b) => b.text().includes('Registrar arqueo'))[0]
      .trigger('click');
    await flushPromises();
    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Registrar arqueo');
    expect(ui.confirm.msg).toContain('SOBRA $200.00');
    ui.okConfirm();
    await esperar(() => (useCajaStore().arqueos || []).length === 1);

    const arq = (await db.arqueos.toArray())[0];
    expect(arq.cajaFisica).toBe(1200);
    expect(arq.cajaSistema).toBe(1000);
    expect(arq.faltanteSobrante).toBe(200);
    // El sobrante entra a caja como ingreso
    const movs = await db.movCaja.toArray();
    expect(movs.length).toBe(1);
    expect(movs[0].tipo).toBe('ingreso');
    expect(movs[0].monto).toBe(200);
    expect(useCajaStore().saldoCaja).toBe(1200);
    // Historial visible y form reseteado
    expect(w.text()).toContain('1,200.00');
    expect(w.find('input[placeholder="Contado físico en caja"]').element.value).toBe('');
    w.unmount();
  });

  it('conteo con FALTA: egreso en movCaja y saldo a la baja', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await w.find('input[placeholder="Contado físico en caja"]').setValue('950');
    await flushPromises();
    expect(w.text()).toContain('Falta');
    expect(w.text()).toContain('$50.00');

    await w
      .findAll('button')
      .filter((b) => b.text().includes('Registrar arqueo'))[0]
      .trigger('click');
    await flushPromises();
    expect(useUIStore().confirm.msg).toContain('FALTA $50.00');
    useUIStore().okConfirm();
    await esperar(() => (useCajaStore().arqueos || []).length === 1);

    expect((await db.movCaja.toArray())[0].tipo).toBe('egreso');
    expect(useCajaStore().saldoCaja).toBe(950);
    w.unmount();
  });

  it('conteo exacto: mensaje de cuadre, sin movimiento en caja', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await w.find('input[placeholder="Contado físico en caja"]').setValue('1000');
    await flushPromises();
    expect(w.text()).toContain('Cuadra');

    await w
      .findAll('button')
      .filter((b) => b.text().includes('Registrar arqueo'))[0]
      .trigger('click');
    await flushPromises();
    expect(useUIStore().confirm.msg).toContain('cuadra');
    useUIStore().okConfirm();
    await esperar(() => (useCajaStore().arqueos || []).length === 1);
    expect(await db.movCaja.count()).toBe(0);
    expect(useCajaStore().saldoCaja).toBe(1000);
    w.unmount();
  });
});

describe('ReportesView: cierre de período', () => {
  it('cerrar período exige confirmación y crea el cierre', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    // Ganancia del período para que el cierre tenga sustancia
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-05T12:00:00.000Z',
      items: [
        {
          productoId: 'px',
          nombre: 'X',
          cantidad: 1,
          unidad: '',
          precio: 500,
          costo: 200,
          ganancia: 300,
          lotesUsados: [],
        },
      ],
      total: 500,
      ganancia: 300,
      anulada: false,
    });
    const { useVentasStore } = await import('../src/stores/useVentasStore');
    await useVentasStore().cargarVentas();
    await import('../src/stores/recarga').then((m) => m.recargarStores('asientos'));

    const w = await montar();
    const btnCerrar = w.findAll('button').filter((b) => b.text().includes('Cerrar Per'));
    expect(btnCerrar.length).toBeGreaterThan(0);
    await btnCerrar[0].trigger('click');
    await flushPromises();

    const ui = useUIStore();
    expect(ui.confirm.titulo).toBe('Cerrar período');
    expect(ui.confirm.msg).toContain('ganancia del período');
    ui.okConfirm();
    await esperar(() => useCierresStore().cierres.length === 1);

    const cierre = (await db.cierres.toArray())[0];
    expect(cierre.ganancia).toBe(300);
    expect(cierre.periodoInicio).toBe('2026-09-01T00:00:00.000Z');
    // El período se reinicia
    expect(useConfigStore().cfg.periodoInicio > '2026-10-14').toBe(true);
    w.unmount();
  });
});

describe('ReportesView: libro diario', () => {
  it('muestra asientos, balanza balanceada y cuadre con el sistema', async () => {
    // Capital inicial + una venta: el libro debe reflejar ambos
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-05T12:00:00.000Z',
      items: [
        {
          productoId: 'px',
          nombre: 'X',
          cantidad: 2,
          unidad: '',
          precio: 100,
          costo: 40,
          ganancia: 120,
          lotesUsados: [],
        },
      ],
      total: 200,
      ganancia: 120,
      anulada: false,
    });
    const { useVentasStore } = await import('../src/stores/useVentasStore');
    await useVentasStore().cargarVentas();
    await import('../src/stores/recarga').then((m) => m.recargarStores('asientos'));

    const w = await montar();
    const txt = w.text();
    expect(txt).toContain('Libro Diario');
    expect(txt).toContain('Balanceado');
    expect(txt).not.toContain('Descuadre');
    // Asientos con sus cuentas
    expect(txt).toContain('Caja');
    expect(txt).toContain('Ventas');
    w.unmount();
  });
});
