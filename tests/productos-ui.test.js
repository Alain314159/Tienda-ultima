/**
 * Tests PROFUNDOS de ProductosView + useProductosStore — Área 2 de la
 * campaña de cobertura profunda (80-90% de la app).
 *
 * El catálogo es la puerta de entrada de TODO: compras, ventas, inventario
 * y reportes derivan de estos productos. Aquí se ejercita el flujo REAL por
 * el DOM: crear/editar/duplicados, archivado, búsqueda,
 * filtros de stock y la vista de lotes expandida. El precio es único por
 * producto: ni empaques ni precios por cantidad.
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
  if (o.precio !== undefined) await w.find('input[placeholder="Precio de venta"]').setValue(o.precio);
  if (o.stockMin !== undefined) await w.find('input[placeholder="Stock mín."]').setValue(o.stockMin);
  if (o.unidad !== undefined) await w.find('input[placeholder^="Unidad (opcional"]').setValue(o.unidad);
  if (o.nota !== undefined) await w.find('textarea[placeholder^="Nota interna"]').setValue(o.nota);
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

  it('el formulario ya no ofrece empaques ni precio por cantidad', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    const w = await montar();
    expect(w.text()).not.toContain('Empaques');
    expect(w.text()).not.toContain('Precio por cantidad');
    expect(w.findAll('button').filter((b) => b.text().includes('+ Agregar')).length).toBe(0);
    // El guardado sigue funcionando con solo nombre y precio único
    await llenarForm(w, { nombre: 'Gaseosa Cola', precio: '100' });
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    const prods = await db.productos.toArray();
    expect(prods.length).toBe(1);
    expect('empaques' in prods[0]).toBe(false);
    expect('preciosEscalonados' in prods[0]).toBe(false);
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

  it('el stock de la fila ignora los empaques heredados: se muestra en unidades base', async () => {
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
    // 53 unidades tal cual: nada de "2 cajas + 5 und"
    expect(w.text()).toContain('Stock: 53');
    expect(w.text()).not.toContain('cajas');
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

  it('crea con unidad y nota completos y precio único', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    const w = await montar();
    await llenarForm(w, { nombre: 'Cerveza', precio: '150', unidad: 'und', nota: 'nacional' });
    await clickGuardar(w, () => useProductosStore().productos.length === 1);

    const p = (await db.productos.toArray())[0];
    expect(p.unidad).toBe('und');
    expect(p.nota).toBe('nacional');
    expect(p.precio).toBe(150);
    expect('empaques' in p).toBe(false);
    expect('preciosEscalonados' in p).toBe(false);
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
    expect(w.find('input[placeholder="Precio de venta"]').element.value).toBe('10');
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

    await w
      .findAll('button')
      .filter((b) => b.text().includes('Ver archivados'))[0]
      .trigger('click');
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
    await w
      .findAll('button')
      .filter((b) => b.text().includes('Ver archivados'))[0]
      .trigger('click');
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
// STORE — precio único y formato de stock
// ============================================================
describe('useProductosStore: precio único y formatStock', () => {
  it('guardarProducto NO persiste escalones ni empaques heredados en un alta', async () => {
    const s = useProductosStore();
    await s.guardarProducto({
      nombre: 'Mayorista',
      precio: 100,
      // Campos de una versión vieja: el store debe ignorarlos
      preciosEscalonados: [{ min: 12, precio: 85 }],
      empaques: [{ nombre: 'caja', unidades: 24 }],
    });
    const p = await db.productos.get(s.productos[0].id);
    expect(p.precio).toBe(100);
    expect('preciosEscalonados' in p).toBe(false);
    expect('empaques' in p).toBe(false);
  });

  it('formatStock ignora los empaques heredados: cantidad tal cual', async () => {
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
    // Antes: "1 bandeja + 23 und". Ahora: unidades base, sin descomponer
    expect(s.formatStock('p1', 53)).toBe('53');
    expect(s.formatStock('p1', 54)).toBe('54');
    expect(s.formatStock('p1', 53.5)).toBe('53.5');
    expect(s.formatStock('p1', 0.5)).toBe('0.5');
  });

  it('formatStock sin empaques respeta fracciones tal cual', async () => {
    await sembrarProducto({ id: 'p1', nombre: 'Queso', precio: 100, unidad: 'kg' });
    const s = useProductosStore();
    expect(s.formatStock('p1', 2.5)).toBe('2.5');
    expect(s.formatStock('p1', 7)).toBe('7');
  });
});
