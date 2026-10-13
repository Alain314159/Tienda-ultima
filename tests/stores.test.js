/**
 * Tests de stores Pinia con persistencia real (fake-indexeddb):
 * config (roundtrip), productos (validación/archivado/filtrado),
 * lotes (stockMap/valor/eliminación protegida), caja (movimientos/arqueo)
 * y carrito de ventas (límites de stock).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useVentasStore } from '../src/stores/useVentasStore';

async function limpiarDb() {
  await Promise.all([
    db.productos.clear(),
    db.lotes.clear(),
    db.movCaja.clear(),
    db.arqueos.clear(),
    db.config.clear(),
    db.ventas.clear(),
  ]);
}

beforeEach(async () => {
  setActivePinia(createPinia());
  await limpiarDb();
});

describe('useConfigStore', () => {
  it('carga defaults cuando no hay config guardada', async () => {
    const cfg = useConfigStore();
    await cfg.cargarCfg();
    expect(cfg.cfg.nombre).toBe('Tienda Pro');
    expect(cfg.cfg.pinActivo).toBe(false);
  });

  it('guardarCfg persiste y cargarCfg restaura los cambios', async () => {
    const cfg = useConfigStore();
    await cfg.cargarCfg();
    cfg.cfg.nombre = 'Mi Bodega';
    cfg.cfg.capitalInicial = 1500;
    await cfg.guardarCfg();

    // Instancia nueva (simula reinicio de app)
    setActivePinia(createPinia());
    const cfg2 = useConfigStore();
    await cfg2.cargarCfg();
    expect(cfg2.cfg.nombre).toBe('Mi Bodega');
    expect(cfg2.cfg.capitalInicial).toBe(1500);
  });
});

describe('useProductosStore', () => {
  it('guardarProducto crea con id generado y mapea stockMin a stockMinimo (forma real de la vista)', async () => {
    const s = useProductosStore();
    // El form de ProductosView NO envia id (solo editId al editar): reproducimos esa forma.
    await s.guardarProducto({ nombre: 'Café 500g', precio: 150, stockMin: 3 });
    expect(s.productos.length).toBe(1);

    const creado = s.productos[0];
    expect(creado.id).toMatch(/^p_/); // genId('p')
    expect(creado.stockMinimo).toBe(3); // el dominio usa stockMinimo, no stockMin
    expect(creado.archivado).toBe(false);

    // persistió en IndexedDB con clave válida
    const enDb = await db.productos.get(creado.id);
    expect(enDb.nombre).toBe('Café 500g');
    expect(enDb.stockMinimo).toBe(3);
  });

  it('guardarProducto edita via editId preservando id y campos no editables', async () => {
    const s = useProductosStore();
    await s.guardarProducto({ nombre: 'Yogur', precio: 20, stockMin: 2 });
    const creado = s.productos[0];

    await s.guardarProducto({ editId: creado.id, nombre: 'Yogur natural', precio: 24, stockMin: 4 });
    expect(s.productos.length).toBe(1); // actualiza, no duplica
    expect(s.productos[0].id).toBe(creado.id);
    expect(s.productos[0].nombre).toBe('Yogur natural');
    expect(s.productos[0].precio).toBe(24);
    expect(s.productos[0].stockMinimo).toBe(4);
  });

  it('guardarProducto rechaza nombres duplicados activos', async () => {
    const s = useProductosStore();
    await s.guardarProducto({ nombre: 'Leche', precio: 20 });
    await expect(s.guardarProducto({ nombre: 'leche ', precio: 25 })).rejects.toThrow(/Ya existe/);
    expect(s.productos.length).toBe(1);
  });

  it('guardarProducto rechaza datos inválidos (schema Zod)', async () => {
    const s = useProductosStore();
    await expect(s.guardarProducto({ nombre: 'X', precio: -5 })).rejects.toThrow();
    expect(s.productos.length).toBe(0);
    expect(await db.productos.count()).toBe(0);
  });

  it('toggleArchivarProducto alterna el estado y persiste', async () => {
    const s = useProductosStore();
    await s.guardarProducto({ nombre: 'Yogur', precio: 20 });
    const pid = s.productos[0].id;
    await s.toggleArchivarProducto(pid);
    expect(s.productos.find((p) => p.id === pid).archivado).toBe(true);
    expect(s.prodsActivos.length).toBe(0);

    await s.toggleArchivarProducto(pid);
    expect(s.prodsActivos.length).toBe(1);
    // persistido
    expect((await db.productos.get(pid)).archivado).toBe(false);
  });

  it('eliminarProducto bloqueado si el producto tiene lotes con ventas', async () => {
    const lotes = useLotesStore();
    await lotes.guardarLote({
      id: 'l1',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 5,
      cantidadVendida: 2,
      costo: 10,
    });

    const s = useProductosStore();
    await expect(s.eliminarProducto('p1')).rejects.toThrow(/ventas registradas/);
  });
});

describe('useLotesStore', () => {
  it('stockMap agrega stock por producto y excluye lotes agotados', async () => {
    const s = useLotesStore();
    await s.guardarLote({
      id: 'l1',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 10,
      cantidadVendida: 4,
      costo: 10,
    });
    await s.guardarLote({
      id: 'l2',
      productoId: 'p1',
      fecha: '2026-02-01',
      cantidadInicial: 5,
      cantidadVendida: 5,
      costo: 12,
    });
    await s.guardarLote({
      id: 'l3',
      productoId: 'p2',
      fecha: '2026-01-01',
      cantidadInicial: 3,
      cantidadVendida: 0,
      costo: 7,
    });

    expect(s.stockMap.p1).toBe(6); // (10-4) + (5-5)
    expect(s.stockMap.p2).toBe(3);
  });

  it('valorInventario valoriza el stock restante al costo de cada lote', async () => {
    const s = useLotesStore();
    await s.guardarLote({
      id: 'l1',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 10,
      cantidadVendida: 4,
      costo: 10,
    });
    await s.guardarLote({
      id: 'l2',
      productoId: 'p2',
      fecha: '2026-01-01',
      cantidadInicial: 2,
      cantidadVendida: 0,
      costo: 100,
    });

    // 6*10 + 2*100 = 260
    expect(s.valorInventario).toBe(260);
  });

  it('lotesDeProducto devuelve solo lotes con stock ordenados FIFO', async () => {
    const s = useLotesStore();
    await s.guardarLote({
      id: 'lB',
      productoId: 'p1',
      fecha: '2026-03-01',
      cantidadInicial: 5,
      cantidadVendida: 0,
      costo: 1,
    });
    await s.guardarLote({
      id: 'lA',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 5,
      cantidadVendida: 0,
      costo: 1,
    });
    await s.guardarLote({
      id: 'lX',
      productoId: 'p1',
      fecha: '2026-02-01',
      cantidadInicial: 5,
      cantidadVendida: 5,
      costo: 1,
    });

    const de = s.lotesDeProducto('p1');
    expect(de.map((l) => l.id)).toEqual(['lA', 'lB']);
  });

  it('eliminarLote rechazado cuando el lote tiene ventas', async () => {
    const s = useLotesStore();
    await s.guardarLote({
      id: 'l1',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 5,
      cantidadVendida: 1,
      costo: 10,
    });
    await expect(s.eliminarLote('l1')).rejects.toThrow(/ventas registradas/);
    expect(await db.lotes.count()).toBe(1);
  });

  it('actualizarLotesBatch persiste varios lotes en una pasada (venta FIFO)', async () => {
    const s = useLotesStore();
    await s.guardarLote({
      id: 'l1',
      productoId: 'p1',
      fecha: '2026-01-01',
      cantidadInicial: 5,
      cantidadVendida: 0,
      costo: 10,
    });
    await s.guardarLote({
      id: 'l2',
      productoId: 'p1',
      fecha: '2026-02-01',
      cantidadInicial: 5,
      cantidadVendida: 0,
      costo: 12,
    });

    await s.actualizarLotesBatch([
      { id: 'l1', productoId: 'p1', fecha: '2026-01-01', cantidadInicial: 5, cantidadVendida: 5, costo: 10 },
      { id: 'l2', productoId: 'p1', fecha: '2026-02-01', cantidadInicial: 5, cantidadVendida: 3, costo: 12 },
    ]);

    expect(s.stockMap.p1).toBe(2);
    expect((await db.lotes.get('l1')).cantidadVendida).toBe(5);
  });
});

describe('useCajaStore', () => {
  it('registrarMovimiento persiste y recarga la lista', async () => {
    const s = useCajaStore();
    await s.registrarMovimiento('ingreso', 500, 'Venta en efectivo');
    await s.registrarMovimiento('egreso', 200, 'Pago proveedor');

    expect(s.movCaja.length).toBe(2);
    expect(await db.movCaja.count()).toBe(2);
    const tipos = s.movCaja.map((m) => m.tipo).sort();
    expect(tipos).toEqual(['egreso', 'ingreso']);
  });

  it('hacerArqueo registra arqueo + ajuste si hay diferencia', async () => {
    const s = useCajaStore();
    await s.hacerArqueo(1000, -50, 'Faltante');

    expect(s.arqueos.length).toBe(1);
    expect(s.arqueos[0].cajaFisica).toBe(1000);
    expect(s.arqueos[0].faltanteSobrante).toBe(-50);
    // diferencia != 0 => movimiento de ajuste egreso
    expect(s.movCaja.length).toBe(1);
    expect(s.movCaja[0].tipo).toBe('egreso');
    expect(s.movCaja[0].monto).toBe(50);
  });

  it('hacerArqueo sin diferencia no genera movimiento', async () => {
    const s = useCajaStore();
    await s.hacerArqueo(0, 0, '');
    expect(s.arqueos.length).toBe(1);
    expect(s.movCaja.length).toBe(0);
  });
});

describe('useVentasStore: carrito con límites de stock', () => {
  async function escena() {
    const productos = useProductosStore();
    const lotes = useLotesStore();
    await productos.guardarProducto({ nombre: 'Refresco', precio: 25 });
    const pid = productos.productos[0].id;
    await lotes.guardarLote({
      id: 'l1',
      productoId: pid,
      fecha: '2026-01-01',
      cantidadInicial: 3,
      cantidadVendida: 0,
      costo: 10,
    });
    await productos.cargarProductos();
    await lotes.cargarLotes();
    return productos.productos.find((p) => p.id === pid);
  }

  it('agregarCarrito añade item con precio del producto', async () => {
    const p = await escena();
    const ventas = useVentasStore();
    ventas.agregarCarrito(p);

    expect(ventas.carrito.length).toBe(1);
    expect(ventas.carrito[0]).toMatchObject({ productoId: p.id, nombre: 'Refresco', cant: '1' });
    expect(Number(ventas.carrito[0].precio)).toBe(25);
  });

  it('agregarCarrito lanza sin stock y respeta el máximo', async () => {
    const productos = useProductosStore();
    await productos.guardarProducto({ nombre: 'Agua', precio: 10 });
    await productos.cargarProductos();
    const sinStock = productos.productos.find((p) => p.nombre === 'Agua');

    const ventas = useVentasStore();
    expect(() => ventas.agregarCarrito(sinStock)).toThrow(/Sin stock/);

    const p = await escena();
    ventas.agregarCarrito(p);
    ventas.agregarCarrito(p);
    ventas.agregarCarrito(p); // 3 = stock
    expect(() => ventas.agregarCarrito(p)).toThrow(/Stock máximo/);
  });

  it('cambiarCant incrementa/decrementa y se topa en el stock', async () => {
    const p = await escena();
    const ventas = useVentasStore();
    ventas.agregarCarrito(p);

    const item = ventas.carrito[0];
    ventas.cambiarCant(item, 1);
    expect(item.cant).toBe('2');
    ventas.cambiarCant(item, 1); // 3 (stock)
    ventas.cambiarCant(item, 1); // clamp a 3
    expect(item.cant).toBe('3');
    ventas.cambiarCant(item, -1);
    expect(item.cant).toBe('2');
    ventas.cambiarCant(item, -1); // 1
    ventas.cambiarCant(item, -1); // mínimo 1
    expect(item.cant).toBe('1');
  });

  it('validarCant sanea entradas inválidas y clampa al stock', async () => {
    const p = await escena();
    const ventas = useVentasStore();
    ventas.agregarCarrito(p);

    const item = ventas.carrito[0];
    ventas.actualizarCantidadInput(item, 'abc');
    ventas.validarCant(item);
    expect(item.cant).toBe('1');

    ventas.actualizarCantidadInput(item, '99');
    ventas.validarCant(item);
    expect(item.cant).toBe('3');
  });
});
