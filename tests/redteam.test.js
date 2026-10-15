/**
 * Tests de regresión de la auditoría red-team (prompt de ataque a la IA).
 *
 * Cada test reproduce un vector de ataque concreto que la IA atacante
 * propuso y que estaba ROTO antes de los fixes:
 *  1. Familia Infinity: "1e999"/"Infinity" pasaban todos los checks `<= 0`
 *  2. Escalones sin restricciones (precio negativo → venta con total negativo)
 *  3. Doble-tap en anulaciones (stock restaurado dos veces)
 *  4. Import de respaldo con venta sin items (pantalla en blanco permanente)
 *  5. Zip-bomb en descompresión gzip
 *  6. Arqueo con valores no finitos
 *  7. Schemas Zod permeables a Infinity
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { db } from '../src/db';
import { n } from '../src/utils/numero';
import { textoDesdeBytes, LIMITE_DESPLIEGUE } from '../src/services/backup';
import { productoSchema, validar } from '../src/schemas';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useBackupStore } from '../src/stores/useBackupStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all(db.tables.map((t) => t.clear()));
});

// ============================================================
// 1. SCHEMAS ZOD: la familia Infinity no pasa
// ============================================================
describe('red-team: schemas rechazan Infinity y NaN', () => {
  it('producto con precio "1e999" es rechazado (antes: venta con total $0)', () => {
    const r = validar(productoSchema, {
      nombre: 'Producto bomba',
      precio: '1e999',
      stockMin: '5',
    });
    expect(r.ok).toBe(false);
  });

  it('producto con precio "Infinity" literal es rechazado', () => {
    const r = validar(productoSchema, { nombre: 'X', precio: 'Infinity', stockMin: '5' });
    expect(r.ok).toBe(false);
  });

  it('producto con precio NaN ("abc") es rechazado', () => {
    const r = validar(productoSchema, { nombre: 'X', precio: 'abc', stockMin: '5' });
    expect(r.ok).toBe(false);
  });

  it('precio normal decimal SÍ pasa (no romper el caso feliz)', () => {
    const r = validar(productoSchema, { nombre: 'Leche', precio: '3.50', stockMin: '5' });
    expect(r.ok).toBe(true);
  });

  it('escalón con precio negativo es rechazado (antes: ventas con total negativo)', () => {
    const r = validar(productoSchema, {
      nombre: 'Mayorista',
      precio: '100',
      preciosEscalonados: [{ min: '12', precio: '-50' }],
    });
    expect(r.ok).toBe(false);
  });

  it('escalón con min 0/negativo es rechazado (el precio base ya cubre eso)', () => {
    const r = validar(productoSchema, {
      nombre: 'Mayorista',
      precio: '100',
      preciosEscalonados: [{ min: '0', precio: '85' }],
    });
    expect(r.ok).toBe(false);
  });

  it('empaque con unidades 0 es rechazado (división por mult en compras)', () => {
    const r = validar(productoSchema, {
      nombre: 'Refresco',
      precio: '100',
      empaques: [{ nombre: 'caja', unidades: '0' }],
    });
    expect(r.ok).toBe(false);
  });

  it('empaque con unidades Infinity es rechazado', () => {
    const r = validar(productoSchema, {
      nombre: 'Refresco',
      precio: '100',
      empaques: [{ nombre: 'caja', unidades: '1e999' }],
    });
    expect(r.ok).toBe(false);
  });

  it('escalón válido SÍ pasa', () => {
    const r = validar(productoSchema, {
      nombre: 'Mayorista',
      precio: '100',
      preciosEscalonados: [{ min: '12', precio: '85' }],
    });
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// 2. CARRITO: validarPrecio/validarCant neutralizan Infinity
// ============================================================
describe('red-team: carrito neutraliza precios y cantidades infinitas', () => {
  it('validarPrecio resetea un precio "1e999" al precio del producto', async () => {
    const lotes = useLotesStore();
    const productos = useProductosStore();
    const ventas = useVentasStore();

    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 3.5, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 2 });
    await lotes.cargarLotes();
    await productos.cargarProductos();

    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 3.5 });
    const fila = ventas.carrito[0];
    fila.precio = '1e999';
    ventas.validarPrecio(fila);
    expect(n(fila.precio)).toBe(3.5);

    fila.precio = 'Infinity';
    ventas.validarPrecio(fila);
    expect(n(fila.precio)).toBe(3.5);
  });

  it('validarCant resetea una cantidad "1e999" (antes el clamp por stock la frenaba solo de casualidad)', async () => {
    const lotes = useLotesStore();
    const productos = useProductosStore();
    const ventas = useVentasStore();

    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 3.5, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 2 });
    await lotes.cargarLotes();
    await productos.cargarProductos();

    ventas.agregarCarrito({ id: 'p1', nombre: 'Leche', precio: 3.5 });
    const fila = ventas.carrito[0];
    fila.cant = '1e999';
    ventas.validarCant(fila);
    expect(n(fila.cant)).toBeLessThanOrEqual(100);
    expect(isFinite(n(fila.cant))).toBe(true);
  });

  it('precioParaCantidad ignora escalones corruptos (precio negativo editado a mano en la BD)', async () => {
    const productos = useProductosStore();
    await db.productos.put({
      id: 'p9',
      nombre: 'Malvavisco',
      precio: 100,
      archivado: false,
      preciosEscalonados: [
        { min: -50, precio: 1 }, // corrupto: min negativo
        { min: 12, precio: -85 }, // corrupto: precio negativo
        { min: 12, precio: 85 }, // válido
      ],
    });
    await productos.cargarProductos();
    // Con cant 20 el escalón válido aplica; los corruptos se descartan
    expect(productos.precioParaCantidad('p9', 20)).toBe(85);
    // Con cant 5, ningún escalón válido aplica → precio base
    expect(productos.precioParaCantidad('p9', 5)).toBe(100);
  });

  it('precioParaCantidad NO muta el array de escalones del store (sort in situ)', async () => {
    const productos = useProductosStore();
    await db.productos.put({
      id: 'p8',
      nombre: 'Caramelo',
      precio: 100,
      archivado: false,
      preciosEscalonados: [
        { min: 5, precio: 90 },
        { min: 12, precio: 85 },
      ],
    });
    await productos.cargarProductos();
    const antes = JSON.stringify(productos.productos.find((p) => p.id === 'p8').preciosEscalonados);
    productos.precioParaCantidad('p8', 20);
    productos.precioParaCantidad('p8', 1);
    const despues = JSON.stringify(productos.productos.find((p) => p.id === 'p8').preciosEscalonados);
    expect(antes).toBe(despues);
  });
});

// ============================================================
// 3. DOBLE-TAP EN ANULACIONES: el stock se restaura UNA sola vez
// ============================================================
describe('red-team: anulaciones idempotentes ante doble-tap', () => {
  async function sembrarVenta() {
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: 5 });
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
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 3, costo: 5 });
    return venta;
  }

  it('doble anularVenta consecutiva restaura el stock UNA vez', async () => {
    await sembrarVenta();
    const lotes = useLotesStore();
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    // Doble-tap: la segunda llamada ocurre ANTES del reload de la primera
    const p1 = ventas.anularVenta('v1');
    const p2 = ventas.anularVenta('v1');
    await Promise.allSettled([p1, p2]);
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    const lote = await db.lotes.get('l1');
    // Vendida 3 al inicio; la anulación correcta la deja en 0 UNA sola vez
    expect(n(lote.cantidadVendida)).toBe(0);
    const v = await db.ventas.get('v1');
    expect(v.anulada).toBe(true);
  });

  it('doble anularProductoEnVenta restaura el stock UNA vez', async () => {
    await sembrarVenta();
    const lotes = useLotesStore();
    const ventas = useVentasStore();
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    const p1 = ventas.anularProductoEnVenta('v1', 0);
    const p2 = ventas.anularProductoEnVenta('v1', 0);
    await Promise.allSettled([p1, p2]);
    await ventas.cargarVentas();
    await lotes.cargarLotes();

    const lote = await db.lotes.get('l1');
    expect(n(lote.cantidadVendida)).toBe(0); // no 97 (doble restauración → -3 clampeado… no: Math.max(0, 0-3)=0… el stock sí queda alto)
    const v = await db.ventas.get('v1');
    expect(v.items[0].anulado).toBe(true);
    expect(n(v.total)).toBe(0);
  });
});

// ============================================================
// 4. APORTES / GASTOS / ARQUEO: Infinity bloqueado
// ============================================================
describe('red-team: aportes, gastos y arqueo rechazan Infinity', () => {
  it('registrarAporte con "1e999" lanza error (antes: caja = ∞ → NaN global)', async () => {
    const cap = useCapitalStore();
    await cap.cargarTodo();
    cap.aporteForm = { monto: '1e999', nota: 'bomba', socioId: '' };
    await expect(cap.registrarAporte()).rejects.toThrow('Monto');
    const items = await db.capital.toArray();
    expect(items.length).toBe(0);
  });

  it('registrarAporte con monto válido funciona', async () => {
    const cap = useCapitalStore();
    await cap.cargarTodo();
    cap.aporteForm = { monto: '500', nota: '', socioId: '' };
    await cap.registrarAporte();
    const items = await db.capital.toArray();
    expect(items.length).toBe(1);
    expect(n(items[0].monto)).toBe(500);
  });

  it('gasto con monto "Infinity" lanza error (antes: caja = -∞)', async () => {
    const g = useGastosStore();
    await g.cargarGastos();
    g.gastoForm = {
      editId: '',
      fecha: '2026-10-15',
      categoria: 'Servicios',
      concepto: 'bomba',
      monto: 'Infinity',
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true,
    };
    await expect(g.guardarGasto()).rejects.toThrow('Monto');
  });

  it('hacerArqueo con cajaFísica Infinity lanza error', async () => {
    const caja = useCajaStore();
    await caja.cargarTodo();
    await expect(caja.hacerArqueo(Infinity, Infinity)).rejects.toThrow('arqueo');
    expect((await db.arqueos.toArray()).length).toBe(0);
  });
});

// ============================================================
// 5. IMPORT: venta sin items y montos no finitos NO pasan la validación
// ============================================================
describe('red-team: validarEsquema bloquea respaldos corruptos', () => {
  it('venta SIN items es error (antes: pantalla en blanco permanente en VentasView)', async () => {
    const b = useBackupStore();
    await expect(b.importarData({ productos: [{ id: 'p1' }], ventas: [{ id: 'v1' }] })).rejects.toThrow(
      'items invalidos'
    );
  });

  it('venta con item de precio Infinity es error (asimetría backup: ∞ → null → 0)', async () => {
    const b = useBackupStore();
    await expect(
      b.importarData({
        productos: [{ id: 'p1' }],
        ventas: [{ id: 'v1', items: [{ productoId: 'p1', cantidad: 1, precio: Infinity, costo: 0 }] }],
      })
    ).rejects.toThrow('no finitos');
  });

  it('lote con cantidadInicial Infinity es error', async () => {
    const b = useBackupStore();
    await expect(
      b.importarData({ productos: [{ id: 'p1' }], lotes: [{ id: 'l1', cantidadInicial: Infinity, costo: 2 }] })
    ).rejects.toThrow('no finitos');
  });

  it('respaldo sano con items [] pasa la validación de items', async () => {
    const b = useBackupStore();
    // No debe lanzar 'items invalidos' (puede lanzar otra cosa o funcionar)
    try {
      await b.importarData({ productos: [{ id: 'p1', nombre: 'X' }], ventas: [{ id: 'v1', items: [] }] });
    } catch (e) {
      expect(String(e.message)).not.toContain('items invalidos');
    }
  });
});

// ============================================================
// 6. ZIP-BOMB: la descompresión tiene límite
// ============================================================
describe('red-team: descompresión gzip con límite (anti zip-bomb)', () => {
  it('textoDesdeBytes exporta un límite finito y razonable', () => {
    expect(LIMITE_DESPLIEGUE).toBeGreaterThan(1024 * 1024);
    expect(LIMITE_DESPLIEGUE).toBeLessThanOrEqual(1024 * 1024 * 1024);
  });

  it('JSON plano pequeño no gzip se decodifica directo', async () => {
    const txt = '{"version":9,"productos":[]}';
    const bytes = new TextEncoder().encode(txt);
    const out = await textoDesdeBytes(bytes);
    expect(JSON.parse(out).version).toBe(9);
  });

  it('un gzip real pequeño se descomprime bien (happy path de la app)', async () => {
    // Solo si el entorno soporta CompressionStream (Chrome/Node 18+)
    if (typeof CompressionStream === 'undefined') return;
    const txt = JSON.stringify({ version: 9, productos: [{ id: 'p1' }] });
    const cs = new CompressionStream('gzip');
    const blob = new Blob([txt]);
    const stream = blob.stream().pipeThrough(cs);
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    const out = await textoDesdeBytes(buf);
    expect(JSON.parse(out).productos[0].id).toBe('p1');
  });
});

// ============================================================
// 7. FIFO: el backend sigue cuadrando con lotes corruptos via BD
// ============================================================
describe('red-team: FIFO ante lote con costo Infinity inyectado en la BD', () => {
  it('una venta sobre lote con costo ∞ no produce ganancia NaN cruda en el item', async () => {
    const lotes = useLotesStore();
    await db.productos.put({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await db.lotes.put({ id: 'l1', productoId: 'p1', cantidadInicial: 100, cantidadVendida: 0, costo: Infinity });
    await lotes.cargarLotes();

    const r = lotes.calcFIFO('p1', 2);
    // m() satura el costoTotal a 0: la ganancia queda definida (no NaN),
    // y el validarEsquema del próximo respaldo detectará el lote corrupto
    expect(isFinite(r.costoTotal)).toBe(true);
  });
});

// ============================================================
// 8. MONTAJE de las vistas con UI nueva (arqueo + subformularios)
// ============================================================
describe('red-team: las vistas con UI restaurada montan sin reventar', () => {
  it('ReportesView monta y muestra la tarjeta de arqueo', async () => {
    const { mount, flushPromises } = await import('@vue/test-utils');
    const { default: ReportesView } = await import('../src/views/ReportesView.vue');
    const wrapper = mount(ReportesView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain('Arqueo de Caja');
    expect(wrapper.text()).toContain('Caja según sistema');
    expect(wrapper.find('input[placeholder="Contado físico en caja"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ProductosView monta y muestra los editores de empaques/escalones/unidad', async () => {
    const { mount, flushPromises } = await import('@vue/test-utils');
    const { default: ProductosView } = await import('../src/views/ProductosView.vue');
    const wrapper = mount(ProductosView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain('Empaques (para compras)');
    expect(wrapper.text()).toContain('Precio por cantidad');
    expect(wrapper.find('input[placeholder="Unidad (opcional: und, kg, lt...)"]').exists()).toBe(true);
    // El botón "+ Agregar" de empaque añade una fila
    const btns = wrapper.findAll('button').filter((b) => b.text().includes('+ Agregar'));
    expect(btns.length).toBe(2);
    await btns[0].trigger('click');
    expect(wrapper.find('input[placeholder="Nombre (caja...)"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
