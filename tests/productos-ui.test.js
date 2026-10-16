/**
 * Tests PROFUNDOS de ProductosView + useProductosStore — Área 2 de la
 * campaña de cobertura profunda (80-90% de la app).
 *
 * El catálogo es la puerta de entrada de TODO: compras, ventas, inventario
 * y reportes derivan de estos productos. Aquí se ejercita el flujo REAL por
 * el DOM: crear/editar/duplicados, empaques, escalones, archivado, búsqueda,
 * filtros de stock y la vista de lotes expandida.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { toast } from 'vue-sonner';

import { db } from '../src/db';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useUIStore } from '../src/stores/useUIStore';
import AppIcon from '../src/components/AppIcon.vue';
import ProductosView from '../src/views/ProductosView.vue';

async function montar() {
  const wrapper = mount(ProductosView, {
    global: { components: { Icon: AppIcon }, stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

async function clickGuardar(w, cond) {
  await w.find('button.btn.pri').trigger('click');
  if (cond) {
    const fin = Date.now() + 3000;
    while (!cond() && Date.now() < fin) {
      await new Promise((r) => setTimeout(r, 25));
      await flushPromises();
    }
  } else {
    await new Promise((r) => setTimeout(r, 200));
    await flushPromises();
  }
}

/** Llena el formulario de producto por el DOM. */
async function llenarForm(w, o = {}) {
  if (o.nombre !== undefined) await w.find('input[placeholder="Nombre del producto"]').setValue(o.nombre);
  if (o.precio !== undefined) await w.find('input[placeholder="Precio base venta"]').setValue(o.precio);
  if (o.stockMin !== undefined) await w.find('input[placeholder="Stock mín."]').setValue(o.stockMin);
  if (o.unidad !== undefined) await w.find('input[placeholder^="Unidad (opcional"]').setValue(o.unidad);
  if (o.nota !== undefined) await w.find('textarea[placeholder^="Nota interna"]').setValue(o.nota);
}

/** Agrega una fila de empaque (o escalón) y la llena. */
async function agregarEmpaque(w, nombre, unidades) {
  const btns = w.findAll('button').filter((b) => b.text().includes('+ Agregar'));
  await btns[0].trigger('click');
  await flushPromises();
  if (nombre !== undefined) await w.find('input[placeholder="Nombre (caja...)"]').setValue(nombre);
  if (unidades !== undefined) await w.find('input[placeholder="Unidades"]').setValue(unidades);
}

async function agregarEscalon(w, min, precio) {
  const btns = w.findAll('button').filter((b) => b.text().includes('+ Agregar'));
  await btns[1].trigger('click');
  await flushPromises();
  if (min !== undefined) await w.find('input[placeholder="Desde (cant)"]').setValue(min);
  if (precio !== undefined) await w.find('input[placeholder="Precio c/u"]').setValue(precio);
}

async function sembrarProducto(p) {
  await db.productos.put({ archivado: false, stockMinimo: 5, ...p });
  await useProductosStore().cargarProductos();
}

async function sembrarLote(l) {
  await db.lotes.put({ cantidadVendida: 0, costo: 1, fecha: '2026-10-01T10:00:00.000Z', ...l });
  await useLotesStore().cargarLotes();
}

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear()]);
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
});

// ============================================================
// SONDA — bugs confirmados por lectura de código, a cazar
// ============================================================
describe('SONDA ProductosView: bugs del flujo real de edición', () => {
  it('editar y VACIAR la unidad la borra de verdad', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Harina', precio: 30, unidad: 'kg' });

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await llenarForm(w, { unidad: '' });
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.unidad === '');

    const p = await db.productos.get('p1');
    expect(p.unidad).toBe('');
    w.unmount();
  });

  it('filas VACÍAS de empaque/escalón no bloquean el guardado', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { nombre: 'Gaseosa Cola', precio: '100' });
    await agregarEmpaque(w, '', ''); // fila agregada y olvidada
    await agregarEscalon(w, '', ''); // ídem
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    const prods = await db.productos.toArray();
    expect(prods.length).toBe(1);
    expect(prods[0].empaques).toEqual([]);
    expect(prods[0].preciosEscalonados).toEqual([]);
    w.unmount();
  });

  it('editar la nota refresca la fila de la lista al instante (v-memo)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Harina', precio: 30, nota: 'nota vieja' });

    const w = await montar();
    expect(w.text()).toContain('nota vieja');
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await llenarForm(w, { nota: 'nota nueva' });
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.nota === 'nota nueva');

    expect(w.text()).toContain('nota nueva');
    expect(w.text()).not.toContain('nota vieja');
    w.unmount();
  });

  it('cambiar las unidades de un empaque refresca el Stock de la fila (v-memo)', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({
      id: 'p1',
      nombre: 'Refresco',
      precio: 100,
      unidad: 'und',
      empaques: [{ nombre: 'caja', unidades: 24 }],
    });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 53 });

    const w = await montar();
    expect(w.text()).toContain('2 cajas + 5 und');

    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await w.find('input[placeholder="Unidades"]').setValue('10');
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.empaques?.[0]?.unidades === 10);

    // 53 con cajas de 10 = 5 cajas + 3 und — la fila DEBE refrescarse
    expect(w.text()).toContain('5 cajas + 3 und');
    w.unmount();
  });
});

// ============================================================
// CREAR + VALIDACIÓN
// ============================================================
describe('ProductosView: crear producto', () => {
  it('crea el producto mínimo y resetea el formulario', async () => {
    const okSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { nombre: 'Gaseosa Cola', precio: '2400' });
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    const prods = await db.productos.toArray();
    expect(prods.length).toBe(1);
    expect(prods[0].nombre).toBe('Gaseosa Cola');
    expect(prods[0].precio).toBe(2400);
    expect(prods[0].stockMinimo).toBe(5);
    expect(prods[0].archivado).toBe(false);
    expect(w.find('input[placeholder="Nombre del producto"]').element.value).toBe('');
    expect(okSpy).toHaveBeenCalled();
    w.unmount();
  });

  it('crea con empaques, escalones, unidad y nota completos', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { nombre: 'Cerveza', precio: '150', unidad: 'und', nota: 'nacional' });
    await agregarEmpaque(w, 'caja', '24');
    await agregarEscalon(w, '12', '130');
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    const p = (await db.productos.toArray())[0];
    expect(p.unidad).toBe('und');
    expect(p.nota).toBe('nacional');
    expect(p.empaques).toEqual([{ nombre: 'caja', unidades: 24 }]);
    expect(p.preciosEscalonados).toEqual([{ min: 12, precio: 130 }]);
    w.unmount();
  });

  it('rechaza sin nombre, precio 0, negativo e Infinity sin escribir nada', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { precio: '100' }); // sin nombre
    await clickGuardar(w);
    await llenarForm(w, { nombre: 'X', precio: '0' });
    await clickGuardar(w);
    await llenarForm(w, { nombre: 'X', precio: '-5' });
    await clickGuardar(w);
    await llenarForm(w, { nombre: 'X', precio: '1e999' });
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalledTimes(4);
    expect(await db.productos.count()).toBe(0);
    w.unmount();
  });

  it('duplicados: mismo nombre en distinto caso rechazado; editarse a sí mismo permitido', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { nombre: 'Yogur', precio: '20' });
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    await llenarForm(w, { nombre: 'YOGUR', precio: '25' });
    await clickGuardar(w);
    expect(errSpy).toHaveBeenCalledWith('Ya existe un producto con ese nombre', expect.anything());
    expect(await db.productos.count()).toBe(1);

    // Editarse a sí mismo manteniendo el nombre: permitido
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    await llenarForm(w, { precio: '22' });
    await clickGuardar(w, () => useProductosStore().productos[0]?.precio === 22);
    expect(await db.productos.count()).toBe(1);
    expect((await db.productos.toArray())[0].precio).toBe(22);
    w.unmount();
  });
});

// ============================================================
// EDITAR — preserva lo que el formulario no edita
// ============================================================
describe('ProductosView: editar producto', () => {
  it('preserva id, codigo y fechaCreacion del original', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({
      id: 'p1',
      nombre: 'Viejo nombre',
      precio: 10,
      codigo: 'ABC-123',
      fechaCreacion: '2026-01-01T00:00:00.000Z',
    });

    const w = await montar();
    await w.find('button[aria-label="Editar"]').trigger('click');
    await flushPromises();
    // Prefill completo
    expect(w.find('input[placeholder="Nombre del producto"]').element.value).toBe('Viejo nombre');
    expect(w.find('input[placeholder="Precio base venta"]').element.value).toBe('10');
    await llenarForm(w, { nombre: 'Nombre nuevo', precio: '15' });
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.nombre === 'Nombre nuevo');

    const p = await db.productos.get('p1');
    expect(p.id).toBe('p1');
    expect(p.codigo).toBe('ABC-123');
    expect(p.fechaCreacion).toBe('2026-01-01T00:00:00.000Z');
    expect(p.precio).toBe(15);
    expect(await db.productos.count()).toBe(1); // sin duplicar
    w.unmount();
  });
});

// ============================================================
// LISTA — búsqueda, filtros, badges, archivado, expansión de lotes
// ============================================================
describe('ProductosView: lista y filtros', () => {
  it('búsqueda filtra por nombre (insensible) y por código', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Yogur natural', precio: 20, codigo: 'YB-1' });
    await sembrarProducto({ id: 'p2', nombre: 'Refresco', precio: 100, codigo: 'RB-2' });

    const w = await montar();
    await w.find('input[placeholder="Buscar..."]').setValue('yog');
    await flushPromises();
    expect(w.findAll('.prod-wrap').length).toBe(1);
    expect(w.text()).toContain('Yogur natural');

    await w.find('input[placeholder="Buscar..."]').setValue('rb-2');
    await flushPromises();
    expect(w.findAll('.prod-wrap').length).toBe(1);
    expect(w.text()).toContain('Refresco');

    await w.find('input[placeholder="Buscar..."]').setValue('zzz');
    await flushPromises();
    expect(w.text()).toContain('Sin productos');
    w.unmount();
  });

  it('filtroStock agotados (desde dashboard) muestra solo agotados y se quita', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Con stock', precio: 20 });
    await sembrarProducto({ id: 'p2', nombre: 'Agotado', precio: 20 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10 });

    const store = useProductosStore();
    store.setFiltroStock('agotados');
    const w = await montar();
    expect(w.text()).toContain('Filtro:');
    expect(w.findAll('.prod-wrap').length).toBe(1);
    expect(w.text()).toContain('Agotado');
    expect(w.text()).not.toContain('Con stock');

    await w.find('.info-box button').trigger('click'); // Quitar filtro
    await flushPromises();
    expect(w.findAll('.prod-wrap').length).toBe(2);
    w.unmount();
  });

  it('filtroStock bajos muestra solo los que están al límite', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Al limite', precio: 20, stockMinimo: 5 });
    await sembrarProducto({ id: 'p2', nombre: 'Holgado', precio: 20, stockMinimo: 2 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 4 });
    await sembrarLote({ id: 'l2', productoId: 'p2', cantidadInicial: 50 });

    useProductosStore().setFiltroStock('bajos');
    const w = await montar();
    expect(w.findAll('.prod-wrap').length).toBe(1);
    expect(w.text()).toContain('Al limite');
    w.unmount();
  });

  it('badges de estado: AGOTADO / BAJO / OK / ARCHIVADO', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Sin lotes', precio: 1 });
    await sembrarProducto({ id: 'p2', nombre: 'Al limite', precio: 1, stockMinimo: 5 });
    await sembrarProducto({ id: 'p3', nombre: 'Holgado', precio: 1, stockMinimo: 2 });
    await sembrarProducto({ id: 'p4', nombre: 'Viejo', precio: 1, archivado: true });
    await sembrarLote({ id: 'l2', productoId: 'p2', cantidadInicial: 4 });
    await sembrarLote({ id: 'l3', productoId: 'p3', cantidadInicial: 50 });

    const w = await montar();
    const txt = w.text();
    expect(txt).toContain('AGOTADO');
    expect(txt).toContain('BAJO');
    expect(txt).toContain('OK');
    // archivado no se ve por defecto
    expect(txt).not.toContain('Viejo');

    await w.findAll('button').filter((b) => b.text().includes('Ver archivados'))[0].trigger('click');
    await flushPromises();
    expect(w.text()).toContain('ARCHIVADO');
    w.unmount();
  });

  it('expandir un producto muestra sus lotes con Quedan X/Y y el valor total', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Harina', precio: 30, unidad: 'kg' });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 4, costo: 2 });

    const w = await montar();
    await w.find('.item').trigger('click'); // expandir
    await flushPromises();
    const txt = w.text();
    expect(txt).toContain('Quedan 6/10');
    expect(txt).toContain('kg');
    expect(txt).toContain('12.00'); // 6 * $2
    w.unmount();
  });

  it('expandir un producto sin lotes muestra el vacío explícito', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Recien creado', precio: 30 });
    const w = await montar();
    await w.find('.item').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Sin lotes activos (stock 0)');
    w.unmount();
  });
});

// ============================================================
// ARCHIVAR / RESTAURAR — con las reglas de negocio reales
// ============================================================
describe('ProductosView: archivar y restaurar', () => {
  it('bloquea archivar con stock > 0 (toast, sin confirmación)', async () => {
    const errSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Con stock', precio: 20 });
    await sembrarLote({ id: 'l1', productoId: 'p1', cantidadInicial: 5 });

    const w = await montar();
    await w.find('button[aria-label="Archivar"]').trigger('click');
    await flushPromises();
    expect(errSpy).toHaveBeenCalledWith('No archivar con stock > 0', expect.anything());
    expect((await db.productos.get('p1')).archivado).toBe(false);
    w.unmount();
  });

  it('con stock 0: confirmación → archivado, sale de la lista, Ver archivados lo muestra y Restaurar lo devuelve', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    await sembrarProducto({ id: 'p1', nombre: 'Vacío', precio: 20 });

    const w = await montar();
    await w.find('button[aria-label="Archivar"]').trigger('click');
    await flushPromises();
    useUIStore().okConfirm();
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.archivado === true);

    // Fuera de la lista activa
    expect(w.findAll('.prod-wrap').length).toBe(0);

    // Ver archivados
    await w.findAll('button').filter((b) => b.text().includes('Ver archivados'))[0].trigger('click');
    await flushPromises();
    expect(w.findAll('.prod-wrap').length).toBe(1);

    // Restaurar
    await w.find('button[aria-label="Restaurar"]').trigger('click');
    await clickGuardar(w, () => useProductosStore().productos.find((p) => p.id === 'p1')?.archivado === false);
    expect((await db.productos.get('p1')).archivado).toBe(false);
    expect(w.findAll('.prod-wrap').length).toBe(1);
    w.unmount();
  });
});

// ============================================================
// STORE — lógica de precios escalonados y formato de stock
// ============================================================
describe('useProductosStore: escalones y formatStock', () => {
  it('precioParaCantidad aplica el escalón correcto desde su mínimo', async () => {
    await sembrarProducto({
      id: 'p1',
      nombre: 'Mayorista',
      precio: 100,
      preciosEscalonados: [
        { min: 12, precio: 85 },
        { min: 24, precio: 80 },
      ],
    });
    const s = useProductosStore();
    expect(s.precioParaCantidad('p1', 11)).toBe(100); // base
    expect(s.precioParaCantidad('p1', 12)).toBe(85); // borde del primer escalón
    expect(s.precioParaCantidad('p1', 23)).toBe(85);
    expect(s.precioParaCantidad('p1', 24)).toBe(80); // segundo escalón
    expect(s.precioParaCantidad('p1', 100)).toBe(80);
    expect(s.precioParaCantidad('inexistente', 5)).toBe(0);
  });

  it('precioParaCantidad descarta escalones corruptos (min 0, precio negativo o infinito)', async () => {
    await sembrarProducto({
      id: 'p1',
      nombre: 'Corrupto',
      precio: 50,
      preciosEscalonados: [
        { min: 0, precio: 10 },
        { min: 5, precio: -1 },
        { min: 6, precio: Infinity },
        { min: 8, precio: 40 },
      ],
    });
    const s = useProductosStore();
    expect(s.precioParaCantidad('p1', 8)).toBe(40);
    expect(s.precioParaCantidad('p1', 5)).toBe(50); // todos los corruptos fuera → base
    expect(s.precioParaCantidad('p1', 4)).toBe(50);
  });

  it('formatStock descompone en empaques grandes primero + resto + fracción', async () => {
    await sembrarProducto({
      id: 'p1',
      nombre: 'Gaseosa',
      precio: 100,
      unidad: 'und',
      empaques: [
        { nombre: 'caja', unidades: 24 },
        { nombre: 'bandeja', unidades: 30 },
      ],
    });
    const s = useProductosStore();
    // 53 = 1 bandeja (30) + 23 und sueltas
    expect(s.formatStock('p1', 53)).toBe('1 bandeja + 23 und');
    // 54 = 1 bandeja + 1 caja exactas
    expect(s.formatStock('p1', 54)).toBe('1 bandeja + 1 caja');
    // 48 = 1 bandeja + 18 und (no alcanza para la caja)
    expect(s.formatStock('p1', 48)).toBe('1 bandeja + 18 und');
    // 53.5 = 1 bandeja + 23 und + 0.5
    expect(s.formatStock('p1', 53.5)).toBe('1 bandeja + 23 und + 0.5');
    // 0.5 (solo fracción)
    expect(s.formatStock('p1', 0.5)).toBe('0.5');
  });

  it('formatStock sin empaques respeta fracciones tal cual', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Queso', precio: 100, unidad: 'kg' });
    const s = useProductosStore();
    expect(s.formatStock('p1', 2.5)).toBe('2.5');
    expect(s.formatStock('p1', 7)).toBe('7');
  });
});
