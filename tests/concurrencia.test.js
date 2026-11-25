/**
 * Tests de regresión de la familia de CONCURRENCIA / estado obsoleto.
 *
 * Vectores de ataque ejecutados (lista red-team #9/#10/#12/#13/#15):
 *  - Dos pestañas vendiendo el mismo stock: la transacción leía el lote del
 *    STORE REACTIVO (caché por pestaña) y el bulkPut del objeto entero PISABA
 *    la venta de la otra pestaña (last-writer-wins) → stock corrupto.
 *  - anularVenta restauraba el stock de TODOS los ítems, incluidos los ya
 *    anulados por ítem (su stock ya estaba restituido) → doble restauración.
 *  - eliminarCompra / editar compra validaban cantidadVendida FUERA de la
 *    transacción → lotes borrados/editados con ventas encima.
 *
 * La simulación de "otra pestaña" es una escritura directa a la BD dejando
 * el store reactivo obsoleto: exactamente el estado en que queda una segunda
 * pestaña (o la primera tras perder el foco) antes de recargar.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { n } from '../src/utils/numero';
import { aplicarLotesEnBD } from '../src/services/fifo';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useUIStore } from '../src/stores/useUIStore';
import { useCobro } from '../src/composables/useCobro';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all(db.tables.map((t) => t.clear()));
});

// ============================================================
// 1. HELPER aplicarLotesEnBD: lectura fresca + validación
// ============================================================
describe('concurrencia: aplicarLotesEnBD', () => {
  it('acumula los deltas del mismo lote en una sola llamada', async () => {
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      productoNombre: 'Leche',
      cantidadInicial: 100,
      cantidadVendida: 0,
      costo: 2,
    });
    await aplicarLotesEnBD(
      [
        { loteId: 'l1', cantidad: 3, costo: 2 },
        { loteId: 'l1', cantidad: 4, costo: 2 },
      ],
      1
    );
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(7);
  });

  it('la sobreventa aborta (nueva > cantidadInicial) y no escribe nada', async () => {
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      productoNombre: 'Leche',
      cantidadInicial: 10,
      cantidadVendida: 6,
      costo: 2,
    });
    await expect(aplicarLotesEnBD([{ loteId: 'l1', cantidad: 8, costo: 2 }], 1)).rejects.toThrow('cambió');
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(6); // intacta
  });

  it('la restauración jamás deja el lote negativo (clamp en 0)', async () => {
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 2, costo: 2 });
    await aplicarLotesEnBD([{ loteId: 'l1', cantidad: 5, costo: 2 }], -1);
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(0);
  });

  it('un loteId inexistente (huérfano) se salta sin reventar', async () => {
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 10, cantidadVendida: 0, costo: 2 });
    await aplicarLotesEnBD(
      [
        { loteId: 'l-fantasma', cantidad: 5, costo: 2 },
        { loteId: 'l1', cantidad: 2, costo: 2 },
      ],
      1
    );
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(2);
  });

  it('lista vacía no toca la BD', async () => {
    await expect(aplicarLotesEnBD([], 1)).resolves.toBeUndefined();
  });
});

// ============================================================
// 2. procesarVenta: el stock real de la BD manda, no la caché
// ============================================================
describe('concurrencia: procesarVenta contra stock que cambió (dos pestañas)', () => {
  async function sembrar() {
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      cantidadInicial: 10,
      cantidadVendida: 0,
      costo: 5,
      fecha: '2026-01-01',
    });
    const lotes = useLotesStore();
    const productos = useProductosStore();
    await lotes.cargarLotes();
    await productos.cargarProductos();
    return { lotes, productos };
  }

  it('otra pestaña vendió 6 y esta intenta vender 8: la venta ABORTA completa', async () => {
    await sembrar();
    const ventas = useVentasStore();
    const ui = useUIStore();
    ui.cobroAbierto = true;
    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 10 });
    ventas.carrito[0].cant = 8;

    // "Otra pestaña" vendió 6: la BD cambia, el store reactivo queda obsoleto
    await db.lotes.put({
      id: 'l1',
      productoId: 'p1',
      cantidadInicial: 10,
      cantidadVendida: 6,
      costo: 5,
      fecha: '2026-01-01',
    });

    const { procesarVenta } = useCobro();
    await procesarVenta(); // captura el error internamente (toast)

    // La venta NO se guardó (6+8=14 > 10 → rollback de la transacción)
    expect((await db.ventas.toArray()).length).toBe(0);
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(6); // ni pisada ni acumulada: intacta
    // El carrito sobrevive para reintentar con datos frescos
    expect(ventas.carrito.length).toBe(1);
  });

  it('happy path: sin cambios concurrentes la venta cuadra (vendida 0→8)', async () => {
    await sembrar();
    const ventas = useVentasStore();
    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 10 });
    ventas.carrito[0].cant = 8;

    const { procesarVenta } = useCobro();
    await procesarVenta();

    const ventasDB = await db.ventas.toArray();
    expect(ventasDB.length).toBe(1);
    expect(n(ventasDB[0].total)).toBe(80);
    expect(n(ventasDB[0].ganancia)).toBe(40); // 8×(10−5)
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(8);
    expect(ventas.carrito.length).toBe(0);
  });

  it('segunda venta legítima acumula sobre la primera (no la pisa)', async () => {
    await sembrar();
    const ventas = useVentasStore();

    // Venta 1 (dejar la BD avanzada, como quedaría tras cualquier venta)
    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 10 });
    ventas.carrito[0].cant = 6;
    let cobro = useCobro();
    await cobro.procesarVenta();

    // El store se refresca (recargarStores corrió) → venta 2 ve el stock real
    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 10 });
    ventas.carrito[0].cant = 4;
    cobro = useCobro();
    await cobro.procesarVenta();

    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(10); // 6+4, NO 4 pisando a 6
    expect((await db.ventas.toArray()).length).toBe(2);
  });
});

// ============================================================
// 3. ANULACIONES: sin dobles restauraciones ni ventas revividas
// ============================================================
describe('concurrencia: anulaciones', () => {
  async function sembrarVentaDosItems() {
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 5, costo: 5 });
    const venta = {
      id: 'v1',
      fecha: new Date().toISOString(),
      items: [
        {
          productoId: 'p1',
          nombre: 'Leche',
          cantidad: 3,
          precio: 10,
          costo: 15,
          ganancia: 15,
          lotesUsados: [{ loteId: 'l1', cantidad: 3, costo: 5 }],
        },
        {
          productoId: 'p1',
          nombre: 'Leche',
          cantidad: 2,
          precio: 10,
          costo: 10,
          ganancia: 10,
          lotesUsados: [{ loteId: 'l1', cantidad: 2, costo: 5 }],
        },
      ],
      total: 50,
      ganancia: 25,
      anulada: false,
    };
    await db.ventas.put(venta);
    return venta;
  }

  it('anularVenta NO restaura el stock de ítems ya anulados (doble restauración contable)', async () => {
    await sembrarVentaDosItems();
    const lotes = useLotesStore();
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    // 1) Se anula el ítem 0 (3 und): su stock ya se restituye aquí
    await ventas.anularProductoEnVenta('v1', 0);
    expect(n((await db.lotes.get('l1')).cantidadVendida)).toBe(2);

    // 2) "Otra pestaña" vende 4 und del mismo lote (v2): BD avanza a 6
    await db.ventas.put({
      id: 'v2',
      fecha: new Date().toISOString(),
      items: [
        {
          productoId: 'p1',
          nombre: 'Leche',
          cantidad: 4,
          precio: 10,
          costo: 20,
          ganancia: 20,
          lotesUsados: [{ loteId: 'l1', cantidad: 4, costo: 5 }],
        },
      ],
      total: 40,
      ganancia: 20,
      anulada: false,
    });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 6, costo: 5 });

    // 3) Se anula la venta v1 COMPLETA: solo el ítem 1 (2 und) debe restituirse.
    //    El código viejo restauraba también el ítem 0 (ya restituido): 6−3−2=1
    //    → 3 und de stock fantasma. El correcto: 6−2=4.
    await ventas.anularVenta('v1');

    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(4);
    const v = await db.ventas.get('v1');
    expect(v.anulada).toBe(true);
    expect(v.items[0].anulado).toBe(true); // preservado, no revivido
  });

  it('anularVenta con la venta ya anulada en la BD (otra pestaña) rechaza sin restaurar dos veces', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
    await db.ventas.put({
      id: 'v1',
      fecha: new Date().toISOString(),
      items: [
        {
          productoId: 'p1',
          nombre: 'Leche',
          cantidad: 3,
          precio: 10,
          costo: 15,
          ganancia: 15,
          lotesUsados: [{ loteId: 'l1', cantidad: 3, costo: 5 }],
        },
      ],
      total: 30,
      ganancia: 15,
      anulada: false,
    });
    const lotes = useLotesStore();
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    // "Otra pestaña" ya anuló la venta y restituyó el stock
    const vDB = await db.ventas.get('v1');
    await db.ventas.put({ ...vDB, anulada: true, fechaAnulacion: '2026-10-15T10:00:00.000Z' });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });

    // Esta pestaña (store obsoleto: anulada=false) intenta anular de nuevo
    await expect(ventas.anularVenta('v1')).rejects.toThrow('ya está anulada');
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(0); // sin segunda restauración
    const v = await db.ventas.get('v1');
    expect(v.fechaAnulacion).toBe('2026-10-15T10:00:00.000Z'); // no pisada
  });

  it('anularProductoEnVenta con el ítem ya anulado en la BD (otra pestaña) rechaza', async () => {
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
    const venta = {
      id: 'v1',
      fecha: new Date().toISOString(),
      items: [
        {
          productoId: 'p1',
          nombre: 'Leche',
          cantidad: 3,
          precio: 10,
          costo: 15,
          ganancia: 15,
          lotesUsados: [{ loteId: 'l1', cantidad: 3, costo: 5 }],
        },
      ],
      total: 30,
      ganancia: 15,
      anulada: false,
    };
    await db.ventas.put(venta);
    const lotes = useLotesStore();
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    // "Otra pestaña" ya anuló el ítem y restituyó
    await db.ventas.put({
      ...venta,
      items: [{ ...venta.items[0], anulado: true }],
      total: 0,
      ganancia: 0,
    });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });

    await expect(ventas.anularProductoEnVenta('v1', 0)).rejects.toThrow('ya está anulado');
    expect(n((await db.lotes.get('l1')).cantidadVendida)).toBe(0);
  });
});

// ============================================================
// 4. COMPRAS (vista montada): revalidación dentro de la transacción
// ============================================================
describe('concurrencia: compras revalidan contra la BD en la transacción', () => {
  async function sembrarYMontar() {
    const { mount, flushPromises } = await import('@vue/test-utils');
    const { default: ComprasView } = await import('../src/views/ComprasView.vue');
    const { useConfigStore } = await import('../src/stores/useConfigStore');

    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.compras.put({
      id: 'c1',
      productoId: 'p1',
      productoNombre: 'Leche',
      cantidad: 10,
      costo: 5,
      total: 50,
      fecha: '2026-10-10T10:00:00.000Z',
    });
    await db.lotes.put({
      id: 'l1',
      compraId: 'c1',
      productoId: 'p1',
      productoNombre: 'Leche',
      cantidadInicial: 10,
      cantidadVendida: 0,
      costo: 5,
      fecha: '2026-10-10T10:00:00.000Z',
    });

    const lotes = useLotesStore();
    const productos = useProductosStore();
    const compras = useComprasStore();
    const config = useConfigStore();
    // La compra del 10-10 debe caer en el período ACTUAL para que el
    // historial renderice sus botones Editar/Eliminar
    config.cfg.periodoInicio = '2026-10-01T00:00:00.000Z';
    await Promise.all([lotes.cargarLotes(), productos.cargarProductos(), compras.cargarCompras()]);

    const wrapper = mount(ComprasView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    return { wrapper, flushPromises };
  }

  it('eliminar compra cuando el lote se vendió mientras el modal estaba abierto → ABORTA', async () => {
    const { wrapper, flushPromises } = await sembrarYMontar();
    const ui = useUIStore();

    // El botón Eliminar existe (check reactivo: sin ventas)
    const btnDel = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Eliminar');
    expect(btnDel).toBeTruthy();
    await btnDel.trigger('click');
    await flushPromises();
    expect(ui.confirm.activo).toBe(true); // modal de confirmación abierto

    // "Otra pestaña" vende 5 del lote mientras el modal está abierto
    await db.lotes.put({
      id: 'l1',
      compraId: 'c1',
      productoId: 'p1',
      cantidadInicial: 10,
      cantidadVendida: 5,
      costo: 5,
      fecha: '2026-10-10T10:00:00.000Z',
    });

    ui.okConfirm(); // ejecuta el onOk → transacción → revalidación FRESCA
    await flushPromises();
    await new Promise((r) => setTimeout(r, 30));

    // La compra NO se eliminó y el lote conserva la venta de la otra pestaña
    expect(await db.compras.get('c1')).toBeTruthy();
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(5);
    wrapper.unmount();
  });

  it('editar compra con el lote ya vendido en otra pestaña → ABORTA sin pisar cantidadVendida', async () => {
    const { wrapper, flushPromises } = await sembrarYMontar();

    // Abrir el formulario de edición (check reactivo: sin ventas)
    const btnEdit = wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Editar');
    expect(btnEdit).toBeTruthy();
    await btnEdit.trigger('click');
    await flushPromises();

    // "Otra pestaña" vende TODO el lote mientras el formulario está abierto
    await db.lotes.put({
      id: 'l1',
      compraId: 'c1',
      productoId: 'p1',
      cantidadInicial: 10,
      cantidadVendida: 10,
      costo: 5,
      fecha: '2026-10-10T10:00:00.000Z',
    });

    // Intentar actualizar: la transacción revalida contra la BD y aborta
    const btnGuardar = wrapper.findAll('button').find((b) => b.text().includes('Actualizar'));
    expect(btnGuardar).toBeTruthy();
    await btnGuardar.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 30));

    // El lote NO fue pisado con cantidadVendida obsoleta
    const l = await db.lotes.get('l1');
    expect(n(l.cantidadVendida)).toBe(10);
    expect(n(l.cantidadInicial)).toBe(10); // la edición (p.ej. 10) no aplicó cambios destructivos... y la compra sigue igual
    const c = await db.compras.get('c1');
    expect(n(c.cantidad)).toBe(10);
    wrapper.unmount();
  });
});
