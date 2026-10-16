/**
 * Tests PROFUNDOS de ComprasView — Área 6 de la campaña de cobertura
 * profunda (80-90% de la app).
 *
 * Los casos TOCTOU (editar/eliminar con ventas de otra pestaña) ya viven en
 * tests/concurrencia.test.js. Aquí el flujo REAL del mostrador: buscar,
 * comprar con y sin empaque, resumen en vivo, caja insuficiente, editar y
 * eliminar felices, y el gate visual de lotes con ventas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import ComprasView from '../src/views/ComprasView.vue';

async function montar() {
  const wrapper = mount(ComprasView, {
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

async function cargarTodo() {
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
  await useComprasStore().cargarCompras();
  await useCajaStore().cargarMovCaja();
}

/** Busca y selecciona el producto en el formulario de compra. */
async function seleccionarProducto(w, nombre) {
  const input = w.find('input[placeholder="Buscar producto..."]');
  await input.trigger('focus');
  await input.setValue(nombre);
  await flushPromises();
  const items = w.findAll('.drop-item');
  expect(items.length).toBeGreaterThan(0);
  await items[0].trigger('click');
  await flushPromises();
}

async function clickGuardar(w) {
  await w.find('button.btn.pri').trigger('click');
  await new Promise((r) => setTimeout(r, 150));
  await flushPromises();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.compras.clear(), db.ventas.clear(), db.movCaja.clear(), db.capital.clear(), db.config.clear()]);
  useConfigStore().cfg.capitalInicial = 1000;
  useConfigStore().cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
  await cargarTodo();
});

describe('ComprasView: registrar compra', () => {
  it('compra simple: lote creado, stock y caja al día, historial visible', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200, unidad: 'und' });
    await cargarTodo();

    const w = await montar();
    await seleccionarProducto(w, 'aceite');
    await w.find('input[placeholder="Cantidad"]').setValue('10');
    await w.find('input[placeholder="Costo por unidad"]').setValue('2');
    await flushPromises();
    // Resumen en vivo
    expect(w.text()).toContain('TOTAL');
    expect(w.text()).toContain('$20.00');

    await clickGuardar(w);
    await esperar(() => useComprasStore().compras.length === 1);

    const c = (await db.compras.toArray())[0];
    expect(c.productoId).toBe('p1');
    expect(c.cantidad).toBe(10);
    expect(c.costo).toBe(2);
    expect(c.total).toBe(20);
    expect(c.anulada).toBe(false);

    const l = (await db.lotes.toArray())[0];
    expect(l.compraId).toBe(c.id);
    expect(l.cantidadInicial).toBe(10);
    expect(l.cantidadVendida).toBe(0);
    expect(l.costo).toBe(2);

    expect(useLotesStore().stock('p1')).toBe(10);
    // La caja paga la compra: 1000 - 20
    expect(useCajaStore().saldoCaja).toBe(980);
    // Historial
    expect(w.text()).toContain('Aceite');
    expect(w.text()).toContain('$20.00');
    // Formulario reseteado al buscador
    expect(w.find('input[placeholder="Buscar producto..."]').exists()).toBe(true);
    w.unmount();
  });

  it('compra por empaque: unidades, costo unitario y empaqueInfo persistidos', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarProducto({
      id: 'p1',
      nombre: 'Gaseosa',
      precio: 100,
      unidad: 'und',
      empaques: [{ nombre: 'caja', unidades: 24 }],
    });
    await cargarTodo();

    const w = await montar();
    await seleccionarProducto(w, 'gaseosa');
    // Elegir empaque y costo POR EMPAQUE
    await w.find('select').setValue('caja');
    await flushPromises();
    await w.find('input[placeholder="Cant. empaques"]').setValue('2');
    // El placeholder del costo cambia a "por empaque" SOLO tras activar el switch
    await w.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await w.find('input[placeholder="Costo por empaque"]').setValue('48');
    await flushPromises();

    // Resumen en vivo: 2 cajas = 48 und, $2.00/unidad, TOTAL $96.00
    expect(w.text()).toContain('2 cajas');
    expect(w.text()).toContain('48 und');
    expect(w.text()).toContain('$2.00');
    expect(w.text()).toContain('$96.00');

    await clickGuardar(w);
    await esperar(() => useComprasStore().compras.length === 1);

    const c = (await db.compras.toArray())[0];
    expect(c.cantidad).toBe(48);
    expect(c.costo).toBe(2); // 48 / 24
    expect(c.total).toBe(96);
    expect(c.empaqueInfo).toEqual({ nombre: 'caja', unidades: 24, cantidad: 2 });
    expect(useLotesStore().stock('p1')).toBe(48);
    expect(useCajaStore().saldoCaja).toBe(904);
    w.unmount();
  });

  it('costo por unidad (sin switch) con empaque: el costo no se divide', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarProducto({
      id: 'p1',
      nombre: 'Gaseosa',
      precio: 100,
      empaques: [{ nombre: 'caja', unidades: 24 }],
    });
    await cargarTodo();

    const w = await montar();
    await seleccionarProducto(w, 'gaseosa');
    await w.find('select').setValue('caja');
    await flushPromises();
    await w.find('input[placeholder="Cant. empaques"]').setValue('1');
    await w.find('input[placeholder="Costo por unidad"]').setValue('3');
    await flushPromises();
    // 1 caja = 24 und × $3 = $72
    expect(w.text()).toContain('$72.00');

    await clickGuardar(w);
    await esperar(() => useComprasStore().compras.length === 1);
    const c = (await db.compras.toArray())[0];
    expect(c.cantidad).toBe(24);
    expect(c.costo).toBe(3);
    expect(c.total).toBe(72);
    w.unmount();
  });

  it('caja insuficiente: pide confirmación y no escribe hasta aceptar', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await cargarTodo();

    const w = await montar();
    await seleccionarProducto(w, 'aceite');
    await w.find('input[placeholder="Cantidad"]').setValue('600'); // 600 × $2 = $1200 > $1000
    await w.find('input[placeholder="Costo por unidad"]').setValue('2');
    await clickGuardar(w);

    expect(useUIStore().confirm.titulo).toBe('Caja insuficiente');
    expect(useUIStore().confirm.msg).toContain('$1,200.00');
    expect(await db.compras.count()).toBe(0);

    useUIStore().okConfirm();
    await esperar(() => useComprasStore().compras.length === 1);
    expect(useCajaStore().saldoCaja).toBe(-200);
    w.unmount();
  });

  it('validaciones: cantidad 0/Infinity y costo negativo/Infinity', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await cargarTodo();

    const w = await montar();
    await seleccionarProducto(w, 'aceite');
    await w.find('input[placeholder="Cantidad"]').setValue('0');
    await w.find('input[placeholder="Costo por unidad"]').setValue('2');
    await clickGuardar(w);
    await w.find('input[placeholder="Cantidad"]').setValue('1e999');
    await clickGuardar(w);
    await w.find('input[placeholder="Cantidad"]').setValue('5');
    await w.find('input[placeholder="Costo por unidad"]').setValue('-1');
    await clickGuardar(w);
    await w.find('input[placeholder="Costo por unidad"]').setValue('1e999');
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalledTimes(4);
    expect(await db.compras.count()).toBe(0);
    expect(await db.lotes.count()).toBe(0);
    w.unmount();
  });

  it('cancelar devuelve el formulario al buscador sin escribir', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await cargarTodo();
    const w = await montar();
    await seleccionarProducto(w, 'aceite');
    await w.find('input[placeholder="Cantidad"]').setValue('10');
    await w.find('input[placeholder="Costo por unidad"]').setValue('2');
    await w.find('button.btn.ghost').trigger('click');
    await flushPromises();
    expect(w.find('input[placeholder="Buscar producto..."]').exists()).toBe(true);
    expect(await db.compras.count()).toBe(0);
    w.unmount();
  });
});

describe('ComprasView: editar y eliminar', () => {
  async function sembrarCompra(vendida = 0) {
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200, unidad: 'und' });
    await db.compras.put({
      id: 'c1',
      fecha: '2026-10-01T10:00:00.000Z',
      productoId: 'p1',
      productoNombre: 'Aceite',
      productoUnidad: 'und',
      cantidad: 10,
      costo: 2,
      total: 20,
      anulada: false,
    });
    await db.lotes.put({
      id: 'l1',
      compraId: 'c1',
      productoId: 'p1',
      productoNombre: 'Aceite',
      cantidadInicial: 10,
      cantidadVendida: vendida,
      costo: 2,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await cargarTodo();
  }

  it('editar compra sin ventas: compra y lote actualizados en espejo', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarCompra();

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    expect(w.find('input[placeholder="Cantidad"]').element.value).toBe('10');
    expect(w.find('input[placeholder="Costo por unidad"]').element.value).toBe('2');

    await w.find('input[placeholder="Cantidad"]').setValue('15');
    await w.find('input[placeholder="Costo por unidad"]').setValue('3');
    await clickGuardar(w);
    await esperar(() => useComprasStore().compras[0]?.cantidad === 15);

    const c = await db.compras.get('c1');
    expect(c.cantidad).toBe(15);
    expect(c.costo).toBe(3);
    expect(c.total).toBe(45);
    const l = await db.lotes.get('l1');
    expect(l.cantidadInicial).toBe(15);
    expect(l.costo).toBe(3);
    expect(useLotesStore().stock('p1')).toBe(15);
    expect(useCajaStore().saldoCaja).toBe(955); // 1000 - 45
    w.unmount();
  });

  it('con ventas encima: botones de editar y eliminar DESAPARECEN', async () => {
    await sembrarCompra(3); // 3 unidades vendidas del lote

    const w = await montar();
    expect(w.find('button[aria-label="Editar"]').exists()).toBe(false);
    expect(w.find('button[aria-label="Eliminar"]').exists()).toBe(false);
    // El historial sigue mostrando la compra
    expect(w.text()).toContain('Aceite');
    w.unmount();
  });

  it('eliminar compra sin ventas: confirmación → compra y lote fuera, stock a 0', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarCompra();

    const w = await montar();
    await w.find('button[aria-label="Eliminar"]').trigger('click');
    await flushPromises();
    expect(useUIStore().confirm.titulo).toBe('Eliminar compra');
    useUIStore().okConfirm();
    await esperar(() => (useComprasStore().compras || []).length === 0);

    expect(await db.compras.count()).toBe(0);
    expect(await db.lotes.count()).toBe(0);
    expect(useLotesStore().stock('p1')).toBe(0);
    expect(useCajaStore().saldoCaja).toBe(1000);
    w.unmount();
  });
});
