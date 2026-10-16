/**
 * Tests PROFUNDOS de InventarioView — Área 5 de la campaña de cobertura
 * profunda (80-90% de la app).
 *
 * Merma (consume lotes FIFO real), sobrante (crea lote nuevo), valoración
 * del inventario, agrupación expandible por producto y ajustes recientes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import InventarioView from '../src/views/InventarioView.vue';

async function montar() {
  const wrapper = mount(InventarioView, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
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

async function sembrarProducto(p) {
  await db.productos.put({ archivado: false, stockMinimo: 5, ...p });
}

async function sembrarLote(l) {
  await db.lotes.put({ cantidadVendida: 0, costo: 1, fecha: '2026-10-01T10:00:00.000Z', ...l });
}

async function cargarTodo() {
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
  await useAjustesStore().cargarAjustes();
}

/** Dos lotes FIFO: 10 und @ $1 (viejo) + 10 und @ $3 (nuevo). */
async function sembrarInventarioBase() {
  await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200, unidad: 'und' });
  await sembrarLote({ id: 'lA', productoId: 'p1', cantidadInicial: 10, costo: 1, fecha: '2026-10-01T10:00:00.000Z' });
  await sembrarLote({ id: 'lB', productoId: 'p1', cantidadInicial: 10, costo: 3, fecha: '2026-10-05T10:00:00.000Z' });
  await cargarTodo();
}

async function llenarAjuste(w, { productoId, cantidad, motivo, costoSobrante } = {}) {
  if (productoId !== undefined) await w.find('select').setValue(productoId);
  if (cantidad !== undefined) await w.find('input[placeholder="- merma / + sobrante"]').setValue(cantidad);
  if (motivo !== undefined) await w.findAll('select')[1].setValue(motivo);
  if (costoSobrante !== undefined && w.find('input[placeholder="Costo unit. del sobrante"]').exists()) {
    await w.find('input[placeholder="Costo unit. del sobrante"]').setValue(costoSobrante);
  }
}

async function clickAjuste(w) {
  await w.find('button.btn.warn').trigger('click');
  await new Promise((r) => setTimeout(r, 150));
  await flushPromises();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ajustes.clear()]);
  await cargarTodo();
});

// ============================================================
// MERMA — consume lotes FIFO reales
// ============================================================
describe('InventarioView: merma', () => {
  it('merma simple consume el lote más viejo y registra la pérdida a costo', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarInventarioBase();

    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '-5', motivo: 'robo' });
    await clickAjuste(w);

    await esperar(() => useAjustesStore().ajustes.length === 1);
    const aj = (await db.ajustes.toArray())[0];
    expect(aj.cantidad).toBe(-5);
    expect(aj.motivo).toBe('robo');
    expect(aj.productoNombre).toBe('Aceite');
    // FIFO: 5 × $1 = $5 de pérdida
    expect(aj.costoPerdida).toBe(5);
    expect(aj.lotesUsados).toEqual([{ loteId: 'lA', cantidad: 5, costo: 1 }]);

    // Lote viejo consumido, stock 15
    expect((await db.lotes.get('lA')).cantidadVendida).toBe(5);
    expect(useLotesStore().stock('p1')).toBe(15);
    // Formulario reseteado
    expect(w.find('select').element.value).toBe('');
    w.unmount();
  });

  it('merma que cruza lotes usa FIFO encadenado', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarInventarioBase();

    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '-12', motivo: 'vencimiento' });
    await clickAjuste(w);

    await esperar(() => useAjustesStore().ajustes.length === 1);
    const aj = (await db.ajustes.toArray())[0];
    // 10 × $1 + 2 × $3 = $16
    expect(aj.costoPerdida).toBe(16);
    expect(aj.lotesUsados).toEqual([
      { loteId: 'lA', cantidad: 10, costo: 1 },
      { loteId: 'lB', cantidad: 2, costo: 3 },
    ]);
    expect((await db.lotes.get('lA')).cantidadVendida).toBe(10);
    expect((await db.lotes.get('lB')).cantidadVendida).toBe(2);
    expect(useLotesStore().stock('p1')).toBe(8);
    w.unmount();
  });

  it('merma mayor que el stock rechazada sin escribir', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarInventarioBase();

    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '-25', motivo: 'robo' });
    await clickAjuste(w);
    expect(errSpy).toHaveBeenCalledWith('Solo hay 20', expect.anything());
    expect(await db.ajustes.count()).toBe(0);
    expect((await db.lotes.get('lA')).cantidadVendida).toBe(0);
    w.unmount();
  });

  it('validaciones: producto, cantidad 0/Infinity, motivo', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarInventarioBase();

    const w = await montar();
    // (el early-return NO resetea el formulario: cada caso fija TODOS los campos)
    await llenarAjuste(w, { productoId: '', cantidad: '-5', motivo: 'robo' }); // sin producto
    await clickAjuste(w);
    await llenarAjuste(w, { productoId: 'p1', cantidad: '', motivo: 'robo' }); // sin cantidad
    await clickAjuste(w);
    await llenarAjuste(w, { productoId: 'p1', cantidad: '1e999', motivo: 'robo' }); // Infinity
    await clickAjuste(w);
    await llenarAjuste(w, { productoId: 'p1', cantidad: '-5', motivo: '' }); // sin motivo
    await clickAjuste(w);
    expect(errSpy).toHaveBeenCalledTimes(4);
    expect(await db.ajustes.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// SOBRANTE — crea lote nuevo
// ============================================================
describe('InventarioView: sobrante', () => {
  it('sobrante crea un lote nuevo al costo indicado y suma al valor', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarInventarioBase();
    const valorAntes = useLotesStore().valorInventario; // 10×1 + 10×3 = 40

    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '8', motivo: 'sobrante', costoSobrante: '2' });
    await clickAjuste(w);

    await esperar(() => useLotesStore().lotes.length === 3);
    const loteNuevo = (await db.lotes.toArray()).find((l) => l.id !== 'lA' && l.id !== 'lB');
    expect(loteNuevo.cantidadInicial).toBe(8);
    expect(loteNuevo.costo).toBe(2);
    expect(loteNuevo.cantidadVendida).toBe(0);
    expect(useLotesStore().stock('p1')).toBe(28);
    expect(useLotesStore().valorInventario).toBe(valorAntes + 16);

    const aj = (await db.ajustes.toArray())[0];
    expect(aj.cantidad).toBe(8);
    expect(aj.costoPerdida).toBe(0);
    w.unmount();
  });

  it('costo del sobrante: negativo e Infinity rechazados', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarInventarioBase();

    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '5', motivo: 'sobrante', costoSobrante: '-3' });
    await clickAjuste(w);
    await llenarAjuste(w, { productoId: 'p1', cantidad: '5', motivo: 'sobrante', costoSobrante: '1e999' });
    await clickAjuste(w);
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(await db.lotes.count()).toBe(2);
    expect(await db.ajustes.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// INVENTARIO AGRUPADO + RESUMEN
// ============================================================
describe('InventarioView: resumen y agrupación', () => {
  it('balance: valor, unidades y lotes activos; grupos expandibles con sus lotes', async () => {
    await sembrarInventarioBase();
    await sembrarProducto({ id: 'p2', nombre: 'Vacio sin lotes', precio: 10 });
    await sembrarProducto({ id: 'p3', nombre: 'Archivado con lote', precio: 10, archivado: true });
    await sembrarLote({ id: 'lC', productoId: 'p3', cantidadInicial: 5, costo: 1 });
    await cargarTodo();

    const w = await montar();
    // Balance: 40 + 5 = 45 · 25 unidades · 3 lotes activos
    expect(w.text()).toContain('$45.00');
    expect(w.text()).toContain('25 unidades');
    expect(w.text()).toContain('3 lotes');

    // Grupos del inventario: SOLO productos con stock o lotes, NO archivados.
    // (el select de merma legítimamente lista todos los activos)
    const grupos = w.findAll('.inv-group');
    expect(grupos.length).toBe(1);
    expect(grupos[0].text()).toContain('Aceite');
    expect(grupos.map((g) => g.text()).join(' ')).not.toContain('Vacio sin lotes');
    expect(grupos.map((g) => g.text()).join(' ')).not.toContain('Archivado con lote');

    // Expandir Aceite: lotes con quedan/total y valor
    await w.find('.inv-head').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('10/10');
    expect(w.text()).toContain('10.00'); // 10 × $1
    expect(w.text()).toContain('30.00'); // 10 × $3
    w.unmount();
  });

  it('inventario vacío muestra el vacío explícito', async () => {
    const w = await montar();
    expect(w.text()).toContain('Sin inventario');
    expect(w.text()).toContain('$0.00');
    w.unmount();
  });

  it('ajustes recientes: lista con motivo, signo y pérdida', async () => {
    await sembrarInventarioBase();
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarAjuste(w, { productoId: 'p1', cantidad: '-3', motivo: 'merma' });
    await clickAjuste(w);
    await esperar(() => w.text().includes('Merma / Daño') === false || w.text().includes('merma'));

    // En "Últimos ajustes": nombre, motivo, -3 y pérdida $3.00
    expect(w.text()).toContain('Aceite');
    expect(w.text()).toContain('merma');
    expect(w.text()).toContain('-3');
    expect(w.text()).toContain('-$3.00');
    w.unmount();
  });

  it('share sheet: se abre desde el botón y se cierra', async () => {
    await sembrarInventarioBase();
    const w = await montar();
    await w.find('button').trigger('click'); // Compartir lista (primer botón)
    await flushPromises();
    expect(useUIStore().shareSheetAbierto).toBe(true);
    expect(w.text()).toContain('Precios');
    expect(w.text()).toContain('Existencia');

    // Cerrar por el overlay
    await w.find('.overlay').trigger('click');
    await flushPromises();
    expect(useUIStore().shareSheetAbierto).toBe(false);
    w.unmount();
  });
});
