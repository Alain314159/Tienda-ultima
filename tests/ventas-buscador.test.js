/**
 * Tests del buscador de Ventas que no se cierra al añadir (MEJORAS 2.1):
 * agregarCarrito conserva el texto de búsqueda y deja el desplegable
 * abierto para añadir el siguiente producto sin reabrirlo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { db } from '../src/db';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';

async function limpiarDb() {
  await Promise.all([db.productos.clear(), db.lotes.clear(), db.ventas.clear(), db.config.clear()]);
}

async function semillar() {
  await db.productos.put({ id: 'p_1', nombre: 'Refresco', precio: 15, archivado: false });
  await db.lotes.put({
    id: 'l_1',
    productoId: 'p_1',
    cantidadInicial: 10,
    cantidadVendida: 0,
    costo: 10,
    fecha: new Date().toISOString(),
  });
  await useProductosStore().cargarProductos();
  await useLotesStore().cargarLotes();
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await limpiarDb();
  setActivePinia(createPinia());
});

describe('agregarCarrito mantiene el buscador abierto', () => {
  it('conserva el texto de búsqueda y deja focusVenta en true', async () => {
    await semillar();
    const ventas = useVentasStore();
    const productos = useProductosStore();
    ventas.busqVenta = 'refr';
    ventas.focusVenta = true;

    ventas.agregarCarrito(productos.productos[0]);

    expect(ventas.carrito).toHaveLength(1);
    expect(ventas.busqVenta).toBe('refr');
    expect(ventas.focusVenta).toBe(true);
  });

  it('añadir el mismo producto otra vez suma cantidad sin cerrar el buscador', async () => {
    await semillar();
    const ventas = useVentasStore();
    const p = useProductosStore().productos[0];
    ventas.busqVenta = 'refr';

    ventas.agregarCarrito(p);
    ventas.agregarCarrito(p);

    expect(ventas.carrito).toHaveLength(1);
    expect(ventas.carrito[0].cant).toBe('2');
    expect(ventas.busqVenta).toBe('refr');
    expect(ventas.focusVenta).toBe(true);
  });

  it('el producto añadido sigue visible en la lista filtrada por el texto', async () => {
    await semillar();
    const ventas = useVentasStore();
    const p = useProductosStore().productos[0];
    ventas.busqVenta = 'refr';

    ventas.agregarCarrito(p);

    expect(ventas.listaVenta.map((x) => x.id)).toContain('p_1');
  });

  it('sin stock sigue lanzando el error (el flujo de error no cambia)', async () => {
    await semillar();
    const ventas = useVentasStore();
    await db.lotes.put({
      id: 'l_2',
      productoId: 'p_2',
      cantidadInicial: 0,
      cantidadVendida: 0,
      costo: 1,
      fecha: new Date().toISOString(),
    });
    await db.productos.put({ id: 'p_2', nombre: 'Agotado', precio: 5, archivado: false });
    await useProductosStore().cargarProductos();
    await useLotesStore().cargarLotes();
    const sinStock = useProductosStore().productos.find((x) => x.id === 'p_2');

    expect(() => ventas.agregarCarrito(sinStock)).toThrow(/Sin stock/);
  });
});
