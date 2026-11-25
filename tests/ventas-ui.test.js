/**
 * Tests PROFUNDOS de VentasView — Área 3 de la campaña de cobertura
 * profunda (80-90% de la app).
 *
 * La venta es el corazón del negocio: carrito → cobro (con calculadora de
 * billetes) → FIFO de lotes → historial → anulaciones (totales y por ítem).
 * Todo por el DOM real: el mismo camino del dueño detrás del mostrador.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import VentasView from '../src/views/VentasView.vue';

async function montar() {
  const wrapper = mount(VentasView, {
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
  await useVentasStore().cargarVentas();
}

/** Agrega un producto al carrito vía búsqueda + click en el dropdown. */
async function agregarAlCarrito(w, nombre) {
  const input = w.find('input[placeholder="Buscar producto por nombre o código..."]');
  await input.trigger('focus');
  await input.setValue(nombre);
  await flushPromises();
  const items = w.findAll('.drop-item');
  expect(items.length).toBeGreaterThan(0);
  await items[0].trigger('click');
  await flushPromises();
}

async function clickBoton(w, texto) {
  const btn = w.findAll('button').filter((b) => b.text().includes(texto));
  expect(btn.length).toBeGreaterThan(0);
  await btn[0].trigger('click');
  await flushPromises();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.clear();
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear(), db.config.clear()]);
  useConfigStore().cfg.periodoInicio = '2026-09-01T00:00:00.000Z';
  await cargarTodo();
});

// ============================================================
// CARRITO — búsqueda, cantidades, precios, escalones
// ============================================================
describe('VentasView: carrito', () => {
  it('buscar por nombre, agregar al carrito y ver total con ganancia', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Refresco TuKola', precio: 100 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, costo: 40 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'tukola');

    expect(useVentasStore().carrito.length).toBe(1);
    expect(useVentasStore().carrito[0].precio).toBe('100');
    expect(w.text()).toContain('Refresco TuKola');
    // TOTAL $100 · Gan. $60 (costo FIFO 40)
    expect(w.text()).toContain('TOTAL $100.00');
    expect(w.text()).toContain('Gan. $60.00');
    w.unmount();
  });

  it('enter agrega el primer resultado sin tocar el dropdown', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Malta', precio: 50 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10 });
    await cargarTodo();

    const w = await montar();
    const input = w.find('input[placeholder="Buscar producto por nombre o código..."]');
    await input.trigger('focus');
    await input.setValue('malta');
    await flushPromises();
    await input.trigger('keyup.enter');
    await flushPromises();
    expect(useVentasStore().carrito.length).toBe(1);
    w.unmount();
  });

  it('sin stock no aparece en el dropdown ("o sin stock")', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Fantasma', precio: 10 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 5, cantidadVendida: 5 });
    await cargarTodo();

    const w = await montar();
    const input = w.find('input[placeholder="Buscar producto por nombre o código..."]');
    await input.trigger('focus');
    await input.setValue('fantasma');
    await flushPromises();
    expect(w.text()).toContain('Sin coincidencias (o sin stock)');
    expect(w.findAll('.drop-item').length).toBe(0);
    w.unmount();
  });

  it('botones +/- y blur: la cantidad se clampa al stock y revive de basura', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Caramelos', precio: 5 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 3, costo: 1 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'caramelos');
    const qtyInput = w.find('.qty-input input');

    // + dos veces: 1 → 2 → 3
    const btns = w.findAll('.qty-input button');
    await btns[1].trigger('click'); // +
    await btns[1].trigger('click');
    expect(qtyInput.element.value).toBe('3');
    // + otra vez: clampa al stock (3)
    await btns[1].trigger('click');
    expect(qtyInput.element.value).toBe('3');
    // − baja a 2, − de nuevo a 1, − no baja de 1
    await btns[0].trigger('click');
    expect(qtyInput.element.value).toBe('2');

    // Escribir basura y salir del campo: revive a 1
    await qtyInput.setValue('abc');
    await qtyInput.trigger('blur');
    await flushPromises();
    expect(qtyInput.element.value).toBe('1');

    // Escribir 999 y blur: clampa al stock
    await qtyInput.setValue('999');
    await qtyInput.trigger('blur');
    await flushPromises();
    expect(qtyInput.element.value).toBe('3');
    w.unmount();
  });

  it('precio a 0 o Infinity en blur: revive al precio del producto', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Pan', precio: 25 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, costo: 10 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'pan');
    const priceInput = w.find('.price-input');
    await priceInput.setValue('0');
    await priceInput.trigger('blur');
    await flushPromises();
    expect(priceInput.element.value).toBe('25');

    await priceInput.setValue('1e999');
    await priceInput.trigger('blur');
    await flushPromises();
    expect(priceInput.element.value).toBe('25');
    w.unmount();
  });

  it('escalones: cambiar la cantidad APLICA el precio por cantidad (regresión de migración)', async () => {
    await sembrarProducto({
      id: 'p1',
      nombre: 'Cerveza',
      precio: 150,
      preciosEscalonados: [{ min: 6, precio: 130 }],
    });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 20, costo: 80 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'cerveza');
    // 1 unidad: precio base 150, tag "Por unidad"
    expect(w.find('.price-input').element.value).toBe('150');
    expect(w.text()).toContain('Por unidad');

    // Subir a 6 con el botón +: el precio pasa SOLO a 130 (recalcularPrecio
    // del monolito, perdido en la migración) y el tag a "Por cantidad"
    const btns = w.findAll('.qty-input button');
    for (let i = 0; i < 5; i++) await btns[1].trigger('click');
    await flushPromises();
    expect(w.find('.qty-input input').element.value).toBe('6');
    expect(w.find('.price-input').element.value).toBe('130');
    expect(w.text()).toContain('Por cantidad');
    expect(w.text()).toContain('TOTAL $780.00');

    // Bajar de nuevo a 2: vuelve al precio base
    for (let i = 0; i < 4; i++) await btns[0].trigger('click');
    await flushPromises();
    expect(w.find('.price-input').element.value).toBe('150');
    expect(w.text()).toContain('Por unidad');
    w.unmount();
  });

  it('quitar item y limpiar carrito', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Pan', precio: 25 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'pan');
    await w.find('.del-btn').trigger('click');
    await flushPromises();
    expect(useVentasStore().carrito.length).toBe(0);

    await agregarAlCarrito(w, 'pan');
    await clickBoton(w, 'Limpiar carrito');
    expect(useVentasStore().carrito.length).toBe(0);
    w.unmount();
  });
});

// ============================================================
// COBRO — modal, calculadora de billetes, FIFO, venta con pérdida
// ============================================================
describe('VentasView: cobro', () => {
  it('cobro feliz: FIFO de 2 lotes, stock restado, carrito limpio, venta en historial', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await sembrarLote({
      id: 'lA',
      productoId: 'p1',
      cantidadInicial: 5,
      costo: 100,
      fecha: '2026-10-01T10:00:00.000Z',
    });
    await sembrarLote({
      id: 'lB',
      productoId: 'p1',
      cantidadInicial: 10,
      costo: 140,
      fecha: '2026-10-05T10:00:00.000Z',
    });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'aceite');
    const qtyInput = w.find('.qty-input input');
    await qtyInput.setValue('7');
    await qtyInput.trigger('blur');
    await flushPromises();

    await clickBoton(w, 'Cobrar Venta');
    expect(w.text()).toContain('Total a Pagar');
    expect(w.text()).toContain('1,400.00');

    await clickBoton(w, 'Confirmar Pago');
    await esperar(() => useVentasStore().ventas.length === 1);

    const v = (await db.ventas.toArray())[0];
    expect(v.total).toBe(1400);
    // FIFO: 5 × $100 + 2 × $140 = 780 → ganancia 620
    expect(v.items[0].costo).toBe(780);
    expect(v.ganancia).toBe(620);
    expect(v.anulada).toBe(false);

    // Stock: lote A agotado, lote B con 8 restantes
    expect((await db.lotes.get('lA')).cantidadVendida).toBe(5);
    expect((await db.lotes.get('lB')).cantidadVendida).toBe(2);
    expect(useLotesStore().stock('p1')).toBe(8);

    // Carrito limpio y modal cerrado
    expect(useVentasStore().carrito.length).toBe(0);
    expect(useUIStore().cobroAbierto).toBe(false);

    // Historial lo muestra
    expect(w.text()).toContain('Aceite ×7');
    w.unmount();
  });

  it('cantidad 0 al cobrar: rechazado antes de abrir el modal', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Pan', precio: 25 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'pan');
    await w.find('.qty-input input').setValue('0');
    await flushPromises();
    await clickBoton(w, 'Cobrar Venta');
    expect(errSpy).toHaveBeenCalledWith('Todas las cantidades deben ser > 0', expect.anything());
    expect(useUIStore().cobroAbierto).toBe(false);
    w.unmount();
  });

  it('venta con pérdida (precio < costo FIFO) pide confirmación antes del cobro', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Mermelada', precio: 50 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, costo: 80 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'mermelada');
    await w.find('.price-input').setValue('40'); // por debajo del costo 80
    await flushPromises();
    await clickBoton(w, 'Cobrar Venta');

    // Aviso de pérdida, modal de cobro aún cerrado
    expect(useUIStore().confirm.titulo).toContain('perdida');
    expect(useUIStore().cobroAbierto).toBe(false);

    useUIStore().okConfirm();
    await flushPromises();
    expect(useUIStore().cobroAbierto).toBe(true);

    await clickBoton(w, 'Confirmar Pago');
    await esperar(() => useVentasStore().ventas.length === 1);
    const v = (await db.ventas.toArray())[0];
    expect(v.ganancia).toBe(-40); // 40 - 80
    w.unmount();
  });

  it('calculadora de billetes: contado, falta, vuelto y confirmación con falta', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    useConfigStore().cfg.calcBilletesActiva = true;
    await sembrarProducto({ id: 'p1', nombre: 'Pan', precio: 250 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, costo: 100 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'pan');
    const qtyInput = w.find('.qty-input input');
    await qtyInput.setValue('2');
    await qtyInput.trigger('blur');
    await flushPromises();
    await clickBoton(w, 'Cobrar Venta');

    // Mostrar calculadora y contar: 2 × $100 + 1 × $500 = 700 para 500
    await clickBoton(w, 'Mostrar calculadora');
    const inputs = w.findAll('.denom-row input');
    // denominaciones [10,20,50,100,200,500,1000,2000,5000]
    await inputs[3].setValue(2); // 2 × 100
    await inputs[5].setValue(1); // 1 × 500
    await flushPromises();
    expect(w.text()).toContain('700.00'); // total contado
    expect(w.text()).toContain('Vuelto');
    expect(w.text()).toContain('200.00');

    // Ahora contar de menos: quitar el de 500 → falta
    await inputs[5].setValue(0);
    await flushPromises();
    expect(w.text()).toContain('Falta');
    expect(w.text()).toContain('100.00');

    // Confirmar Pago con falta pide confirmación explícita
    await clickBoton(w, 'Confirmar Pago');
    expect(useUIStore().confirm.titulo).toContain('Falta dinero');
    expect(useVentasStore().ventas.length).toBe(0);
    useUIStore().okConfirm();
    await esperar(() => useVentasStore().ventas.length === 1);
    expect((await db.ventas.toArray())[0].total).toBe(500);
    w.unmount();
  });

  it('cancelar el cobro deja el carrito intacto', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Pan', precio: 25 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10 });
    await cargarTodo();

    const w = await montar();
    await agregarAlCarrito(w, 'pan');
    await clickBoton(w, 'Cobrar Venta');
    await clickBoton(w, 'Cancelar');
    await flushPromises();
    expect(useUIStore().cobroAbierto).toBe(false);
    expect(useVentasStore().carrito.length).toBe(1);
    expect(await db.ventas.count()).toBe(0);
    w.unmount();
  });
});

// ============================================================
// HISTORIAL — expansión, anulaciones, búsqueda, agrupación
// ============================================================
describe('VentasView: historial y anulaciones', () => {
  async function sembrarVentaConLote(anulada = false) {
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 3, costo: 100 });
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-10T14:30:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'Aceite',
          cantidad: 3,
          unidad: '',
          precio: 200,
          costo: 300,
          ganancia: 300,
          lotesUsados: [{ loteId: 'l1', cantidad: 3 }],
        },
      ],
      total: 600,
      ganancia: 300,
      anulada,
    });
    await cargarTodo();
  }

  it('expandir la venta muestra sus items; título resume multi-item', async () => {
    await sembrarVentaConLote();
    await db.ventas.put({
      id: 'v2',
      fecha: '2026-10-11T14:30:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'Aceite',
          cantidad: 1,
          unidad: '',
          precio: 200,
          costo: 100,
          ganancia: 100,
          lotesUsados: [{ loteId: 'l1', cantidad: 1 }],
        },
        {
          productoId: 'p1',
          nombre: 'Aceite',
          cantidad: 2,
          unidad: '',
          precio: 200,
          costo: 200,
          ganancia: 200,
          lotesUsados: [{ loteId: 'l1', cantidad: 2 }],
        },
      ],
      total: 600,
      ganancia: 300,
      anulada: false,
    });
    await cargarTodo();

    const w = await montar();
    // Título multi-item: "Aceite +1 más"
    expect(w.text()).toContain('Aceite +1 más');

    // Expandir v2 (la más reciente) → items visibles
    const items = w.findAll('.item');
    await items[0].find('.info').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Anular');
    // detalle: precio × cantidad y subtotal
    expect(w.text()).toContain('200.00');
    w.unmount();
  });

  it('anular venta completa: confirmación → stock restaurado + badge ANULADA', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarVentaConLote();

    const w = await montar();
    // Botón Anular de la venta (columna derecha, sin expandir)
    const btn = w.findAll('button').filter((b) => b.text().trim() === 'Anular')[0];
    await btn.trigger('click');
    await flushPromises();
    expect(useUIStore().confirm.titulo).toBe('Anular venta');
    useUIStore().okConfirm();
    // Esperar también el stock (cargarLotes va después de cargarVentas:
    // esperar solo la venta deja el store de lotes obsoleto)
    await esperar(() => useLotesStore().stock('p1') === 10);

    const v = await db.ventas.get('v1');
    expect(v.anulada).toBe(true);
    expect(v.fechaAnulacion).toBeTruthy();
    // Stock restaurado: 10 - 3 + 3 = 10
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(0);
    expect(useLotesStore().stock('p1')).toBe(10);
    // El botón desaparece y aparece el badge
    expect(w.text()).toContain('ANULADA');
    w.unmount();
  });

  it('anular un SOLO item de la venta: total ajustado y stock del item restaurado', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Aceite', precio: 200 });
    await sembrarProducto({ id: 'p2', nombre: 'Pan', precio: 25 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 2, costo: 100 });
    await sembrarLote({ id: 'l2', productoId: 'p2', cantidadInicial: 20, cantidadVendida: 4, costo: 10 });
    await db.ventas.put({
      id: 'v1',
      fecha: '2026-10-10T14:30:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'Aceite',
          cantidad: 2,
          unidad: '',
          precio: 200,
          costo: 200,
          ganancia: 200,
          lotesUsados: [{ loteId: 'l1', cantidad: 2 }],
        },
        {
          productoId: 'p2',
          nombre: 'Pan',
          cantidad: 4,
          unidad: '',
          precio: 25,
          costo: 40,
          ganancia: 60,
          lotesUsados: [{ loteId: 'l2', cantidad: 4 }],
        },
      ],
      total: 500,
      ganancia: 260,
      anulada: false,
    });
    await cargarTodo();

    const w = await montar();
    // Expandir la venta → botón Anular del ITEM pan (índice 1)
    await w.find('.item .info').trigger('click');
    await flushPromises();
    const btnAnularItem = w.findAll('.venta-items-expand button').filter((b) => b.text().includes('Anular'))[1];
    await btnAnularItem.trigger('click');
    await flushPromises();

    // PIN inactivo → directo a confirmación
    expect(useUIStore().confirm.titulo).toBe('Anular producto');
    useUIStore().okConfirm();
    await esperar(() => useVentasStore().ventas[0]?.total === 400);

    const v = await db.ventas.get('v1');
    expect(v.items[1].anulado).toBe(true);
    expect(v.items[0].anulado).toBeFalsy();
    expect(v.total).toBe(400); // solo el aceite
    expect(v.ganancia).toBe(200);
    // Stock del pan restaurado, el del aceite intacto
    expect((await db.lotes.get('l2')).cantidadVendida).toBe(0);
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(2);
    // Badge del ítem
    expect(w.text()).toContain('ANULADO');
    w.unmount();
  });

  it('con PIN activo, anular item pide el PIN antes de confirmar', async () => {
    await sembrarVentaConLote();
    const config = useConfigStore();
    config.cfg.pinActivo = true;
    config.cfg.pin = '1234';

    const w = await montar();
    await w.find('.item .info').trigger('click');
    await flushPromises();
    const btnAnularItem = w.findAll('.venta-items-expand button').filter((b) => b.text().includes('Anular'))[0];
    await btnAnularItem.trigger('click');
    await flushPromises();

    // El prompt de PIN está abierto y la confirmación NO llegó
    const ui = useUIStore();
    expect(ui.prompt.activo).toBe(true);
    expect(ui.confirm.activo).toBe(false);

    // Cancelar el PIN no anula nada
    ui.cancelPrompt();
    await flushPromises();
    expect((await db.ventas.get('v1')).items[0].anulado).toBeUndefined();
    w.unmount();
  });

  it('búsqueda del historial filtra por nombre de item', async () => {
    await sembrarVentaConLote();
    await sembrarProducto({ id: 'p2', nombre: 'Jabón', precio: 60 });
    await db.ventas.put({
      id: 'v2',
      fecha: '2026-10-11T10:00:00.000Z',
      items: [
        {
          productoId: 'p2',
          nombre: 'Jabón',
          cantidad: 1,
          unidad: '',
          precio: 60,
          costo: 30,
          ganancia: 30,
          lotesUsados: [],
        },
      ],
      total: 60,
      ganancia: 30,
      anulada: false,
    });
    await cargarTodo();

    const w = await montar();
    expect(w.findAll('.item').length).toBe(2);
    await w.find('input[placeholder="Buscar en historial..."]').setValue('jab');
    await flushPromises();
    expect(w.findAll('.item').length).toBe(1);
    expect(w.text()).toContain('Jabón');

    await w.find('input[placeholder="Buscar en historial..."]').setValue('zzz');
    await flushPromises();
    expect(w.text()).toContain('Sin ventas');
    w.unmount();
  });

  it('ventas de períodos cerrados quedan agrupadas y colapsadas', async () => {
    await db.cierres.put({
      id: 'c1',
      periodo: 'Ago 2026',
      periodoInicio: '2026-08-01T00:00:00.000Z',
      periodoFin: '2026-09-01T00:00:00.000Z',
      fechaCierre: '2026-09-01T20:00:00.000Z',
      ganancia: 500,
    });
    await sembrarVentaConLote();
    await db.ventas.put({
      id: 'vOld',
      fecha: '2026-08-15T10:00:00.000Z',
      items: [
        {
          productoId: 'p1',
          nombre: 'Aceite viejo',
          cantidad: 1,
          unidad: '',
          precio: 150,
          costo: 100,
          ganancia: 50,
          lotesUsados: [],
        },
      ],
      total: 150,
      ganancia: 50,
      anulada: false,
    });
    const { useCierresStore } = await import('../src/stores/useCierresStore');
    await useCierresStore().cargarCierres();
    await cargarTodo();

    const w = await montar();
    expect(w.text()).toContain('Ago 2026');
    expect(w.text()).not.toContain('Aceite viejo'); // colapsado
    await w.find('.hist-head-click').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Aceite viejo');
    w.unmount();
  });

  it('paginación del historial: 25 ventas → 20 + resto', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Chicle', precio: 5 });
    const ventas = [];
    for (let i = 0; i < 25; i++) {
      ventas.push({
        id: 'v' + i,
        fecha: new Date(Date.UTC(2026, 9, 1 + Math.floor(i / 3), 12)).toISOString(),
        items: [
          {
            productoId: 'p1',
            nombre: 'Chicle',
            cantidad: 1,
            unidad: '',
            precio: 5,
            costo: 2,
            ganancia: 3,
            lotesUsados: [],
          },
        ],
        total: 5,
        ganancia: 3,
        anulada: false,
      });
    }
    await db.ventas.bulkPut(ventas);
    await cargarTodo();

    const w = await montar();
    expect(w.findAll('.item').length).toBe(20);
    expect(w.text()).toContain('5 restantes');
    await w.find('.hist-mas button').trigger('click');
    await flushPromises();
    expect(w.findAll('.item').length).toBe(25);
    w.unmount();
  });
});
