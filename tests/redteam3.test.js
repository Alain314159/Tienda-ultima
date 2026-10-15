/**
 * Ronda 3 de ataque red-team (lista de la IA): FAMILIA DE DATOS HOSTILES.
 *
 * Vectores ejecutados:
 *  - #1/#2  Inyección por import con montos NEGATIVOS: validarEsquema solo
 *           miraba "no finito"; un respaldo editado a mano con precio -50 o
 *           lote.costo -100 pasaba y corrompía la contabilidad en silencio.
 *  - #8/#58 Strings faltantes u hostiles: socio/producto/item sin nombre
 *           (o codigo numérico) revientan localeCompare/toLowerCase en
 *           vistas y computed — Inventario moría al RENDERIZAR.
 *  - #27/#29 Fechas inválidas: fmtFecha mostraba "NaN/NaN/NaN" (getDate no
 *           lanza, devuelve NaN: el catch nunca disparaba) y un respaldo con
 *           fecha basura importaba y quedaba mal agrupado para siempre.
 *  - #49/#53 Respaldo editado a mano / recortado: un archivo solo-productos
 *           importaba sin aviso de que BORRARÍA ventas/compras/gastos.
 *  - #34/#61 Anular venta inexistente: pins de regresión (ya guardado).
 *
 * Filosofía del fix: la integridad contable se protege RUIDOSO en la frontera
 * (validarEsquema rechaza el archivo y dice qué tiene), el render se protege
 * defensivo (|| '' — la BD no se masajea) y el usuario recibe avisos claros
 * ANTES de pisar datos (tablas ausentes).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { n } from '../src/utils/numero';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useAjustesStore } from '../src/stores/useAjustesStore';
import { fmtFecha, fmtFH } from '../src/utils/formato';
import { useHistorial } from '../src/composables/useHistorial';
import { tablasAusentes } from '../src/stores/importacion';

beforeEach(async () => {
  setActivePinia(createPinia());
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Respaldo mínimo pero COMPLETO y sano (todos los checks en verde). */
function respaldoSano() {
  return {
    version: 10,
    fecha: new Date().toISOString(),
    cfg: { nombre: 'Tienda Prueba', periodoInicio: new Date().toISOString() },
    productos: [
      { id: 'p1', nombre: 'Leche', precio: 5, stockMinimo: 3 },
      { id: 'p2', nombre: 'Pan', precio: 2 },
    ],
    lotes: [
      {
        id: 'l1',
        productoId: 'p1',
        cantidadInicial: 100,
        cantidadVendida: 10,
        costo: 2,
        fecha: new Date().toISOString(),
      },
    ],
    ventas: [
      {
        id: 'v1',
        fecha: new Date().toISOString(),
        items: [{ productoId: 'p1', nombre: 'Leche', cantidad: 2, precio: 5, costo: 2, ganancia: 6 }],
        total: 10,
        ganancia: 6,
      },
    ],
    compras: [{ id: 'c1', fecha: new Date().toISOString(), productoId: 'p1', cantidad: 100, costo: 2, total: 200 }],
    ajustes: [],
    arqueos: [],
    movCaja: [],
    cierres: [],
    capital: [{ id: 'k1', fecha: new Date().toISOString(), monto: 500, nota: 'inicial' }],
    retiros: [],
    socios: [{ id: 's1', nombre: 'Ana', porcentaje: 100, aporte: 500, activo: true }],
    distribuciones: [],
    gastos: [
      {
        id: 'g1',
        fecha: new Date().toISOString(),
        categoria: 'Servicios',
        concepto: 'Luz',
        monto: 85,
        metodoPago: 'efectivo',
        saleDeCaja: true,
      },
    ],
  };
}

// ============================================================
// 1. NEGATIVOS POR IMPORT (#1/#2/#49: respaldo editado a mano)
// ============================================================
describe('red-team 3: validarEsquema rechaza montos negativos', () => {
  const backup = useBackupStore;

  function check(d) {
    const store = backup();
    return store.validarEsquema(d);
  }

  it('el respaldo sano pasa sin errores ni falsos positivos', () => {
    const v = check(respaldoSano());
    expect(v.ok).toBe(true);
    expect(v.errores).toEqual([]);
  });

  it('venta con item precio/cantidad/costo negativo se rechaza', () => {
    const d = respaldoSano();
    d.ventas[0].items[0] = { ...d.ventas[0].items[0], precio: -50, cantidad: -2, costo: -1 };
    const v = check(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/negativ/i);
  });

  it('venta con total negativo se rechaza', () => {
    const d = respaldoSano();
    d.ventas[0].total = -10;
    const v = check(d);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/total.*negativ|negativ.*total/i);
  });

  it('lote con costo/cantidadInicial/cantidadVendida negativos se rechaza', () => {
    const d = respaldoSano();
    d.lotes[0] = { ...d.lotes[0], costo: -100 };
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.lotes[0] = { ...d2.lotes[0], cantidadInicial: -5 };
    expect(check(d2).ok).toBe(false);
    const d3 = respaldoSano();
    d3.lotes[0] = { ...d3.lotes[0], cantidadVendida: -3 };
    expect(check(d3).ok).toBe(false);
  });

  it('gasto con monto negativo se rechaza', () => {
    const d = respaldoSano();
    d.gastos[0].monto = -85;
    expect(check(d).ok).toBe(false);
  });

  it('compra con cantidad/costo/total negativos se rechaza', () => {
    const d = respaldoSano();
    d.compras[0] = { ...d.compras[0], cantidad: -5 };
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.compras[0] = { ...d2.compras[0], costo: -2 };
    expect(check(d2).ok).toBe(false);
    const d3 = respaldoSano();
    d3.compras[0] = { ...d3.compras[0], total: -200 };
    expect(check(d3).ok).toBe(false);
  });

  it('socio con aporte negativo o porcentaje fuera de [0,100] se rechaza', () => {
    const d = respaldoSano();
    d.socios[0] = { ...d.socios[0], aporte: -500 };
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.socios[0] = { ...d2.socios[0], porcentaje: 150 };
    expect(check(d2).ok).toBe(false);
    const d3 = respaldoSano();
    d3.socios[0] = { ...d3.socios[0], porcentaje: -25 };
    expect(check(d3).ok).toBe(false);
  });

  it('capital/retiro/distribucion con monto negativo se rechazan', () => {
    const d = respaldoSano();
    d.capital[0].monto = -1;
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.retiros = [{ id: 'r1', fecha: new Date().toISOString(), monto: -10, concepto: 'x' }];
    expect(check(d2).ok).toBe(false);
    const d3 = respaldoSano();
    d3.distribuciones = [{ id: 'd1', fecha: new Date().toISOString(), monto: -5, concepto: 'x' }];
    expect(check(d3).ok).toBe(false);
  });

  it('la merma negativa del AJUSTE sigue siendo legítima (semántica +/-)', () => {
    const d = respaldoSano();
    d.ajustes = [
      {
        id: 'a1',
        fecha: new Date().toISOString(),
        productoId: 'p1',
        productoNombre: 'Leche',
        cantidad: -3,
        motivo: 'merma',
        costoPerdida: 6,
      },
    ];
    const v = check(d);
    expect(v.ok).toBe(true);
  });
});

// ============================================================
// 2. STRINGS FALTANTES / HOSTILES (#8/#58)
// ============================================================
describe('red-team 3: validarEsquema rechaza strings faltantes', () => {
  function check(d) {
    return useBackupStore().validarEsquema(d);
  }

  it('producto sin nombre se rechaza', () => {
    const d = respaldoSano();
    d.productos[0] = { ...d.productos[0], nombre: '' };
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.productos[0] = { id: 'p1', precio: 5 };
    expect(check(d2).ok).toBe(false);
  });

  it('socio sin nombre se rechaza', () => {
    const d = respaldoSano();
    d.socios[0] = { id: 's1', porcentaje: 100, aporte: 0, activo: true };
    expect(check(d).ok).toBe(false);
  });

  it('venta con item sin nombre se rechaza', () => {
    const d = respaldoSano();
    d.ventas[0].items[0] = { productoId: 'p1', cantidad: 2, precio: 5, costo: 2, ganancia: 6 };
    expect(check(d).ok).toBe(false);
  });

  it('codigo numérico (no string) se rechaza', () => {
    const d = respaldoSano();
    d.productos[0] = { ...d.productos[0], codigo: 12345 };
    expect(check(d).ok).toBe(false);
  });
});

// ============================================================
// 3. FECHAS INVÁLIDAS (#27/#29)
// ============================================================
describe('red-team 3: fechas inválidas', () => {
  function check(d) {
    return useBackupStore().validarEsquema(d);
  }

  it('venta sin fecha o con fecha basura se rechaza', () => {
    const d = respaldoSano();
    d.ventas[0] = { ...d.ventas[0], fecha: '31/02/2024 garcia' };
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.ventas[0] = { ...d2.ventas[0], fecha: undefined };
    expect(check(d2).ok).toBe(false);
  });

  it('gasto/lote/compra/socio con fecha basura se rechazan', () => {
    const d = respaldoSano();
    d.gastos[0].fecha = 'garbage';
    expect(check(d).ok).toBe(false);
    const d2 = respaldoSano();
    d2.lotes[0].fecha = '';
    expect(check(d2).ok).toBe(false);
    const d3 = respaldoSano();
    d3.compras[0].fecha = 'ayer';
    expect(check(d3).ok).toBe(false);
  });

  it('cierre con periodoInicio no-parseable se rechaza', () => {
    const d = respaldoSano();
    d.cierres = [
      {
        id: 'ci1',
        periodo: 'P1',
        fechaCierre: new Date().toISOString(),
        periodoInicio: 'cuando-sea',
        periodoFin: new Date().toISOString(),
        ganancia: 10,
      },
    ];
    expect(check(d).ok).toBe(false);
  });

  it('fmtFecha/fmtFH con fecha corrupta devuelven cadena vacía (no NaN/NaN/NaN)', () => {
    expect(fmtFecha('basura')).toBe('');
    expect(fmtFecha('')).toBe('');
    expect(fmtFecha(undefined)).toBe('');
    expect(fmtFH('basura')).toBe('');
    // y las válidas siguen iguales
    const iso = new Date(2026, 9, 16, 14, 5).toISOString();
    expect(fmtFecha(iso)).toBe('16/10/26');
    expect(fmtFH(iso)).toBe('16/10/26 14:05');
  });

  it('agrupar con fecha corrupta no revienta y la manda a "anteriores" (comportamiento acotado)', async () => {
    const ventas = useVentasStore();
    await db.ventas.bulkPut([
      { id: 'v1', fecha: 'garbage', items: [], total: 10, ganancia: 2 },
      { id: 'v2', fecha: new Date().toISOString(), items: [], total: 5, ganancia: 1 },
    ]);
    await ventas.cargarVentas();
    const h = useHistorial(() => ventas.ventas);
    const grupos = h.agruparActual();
    expect(grupos.actual.length).toBe(1);
    // la corrupta no se pierde: queda agrupada bajo el bloque de antiguos
    const antiguos = grupos.cerrados.find((g) => g.cierre.id === '__antiguos__');
    expect(antiguos.items.length).toBe(1);
  });
});

// ============================================================
// 4. RENDER DEFENSIVO (inyección directa DevTools/Dexie #3/#58)
//    La BD no se masajea: el render simplemente no explota.
// ============================================================
describe('red-team 3: el render sobrevive registros inyectados sin nombre', () => {
  it('sociosOrdenados con socio sin nombre no lanza y ordena con cadena vacía', async () => {
    await db.socios.put({ id: 's1', porcentaje: 50, aporte: 100, activo: true });
    await db.socios.put({ id: 's2', nombre: 'Beto', porcentaje: 50, aporte: 100, activo: true });
    const capital = useCapitalStore();
    await capital.cargarSocios();
    expect(() => capital.sociosOrdenados).not.toThrow();
    // el registro conserva su nombre undefined (no se masajea la BD): el
    // sort simplemente lo trata como '' y lo pone primero
    expect(capital.sociosOrdenados.map((s) => s.nombre)).toEqual([undefined, 'Beto']);
  });

  it('ventasFiltradas buscando con item sin nombre no lanza', async () => {
    const ventas = useVentasStore();
    await db.ventas.put({
      id: 'v1',
      fecha: new Date().toISOString(),
      items: [{ productoId: 'p1', cantidad: 1, precio: 5, costo: 2, ganancia: 3 }],
      total: 5,
      ganancia: 3,
    });
    await ventas.cargarVentas();
    ventas.busqVenta = 'leche';
    expect(() => ventas.ventasFiltradas).not.toThrow();
    expect(ventas.ventasFiltradas.length).toBe(0);
  });

  it('listaVenta buscando con producto sin nombre / codigo numérico no lanza', async () => {
    const productos = useProductosStore();
    const lotes = useLotesStore();
    await db.productos.bulkPut([
      { id: 'p1', nombre: 'Leche', precio: 5 },
      { id: 'p2', precio: 3, codigo: 999 },
    ]);
    await db.lotes.bulkPut([
      {
        id: 'l1',
        productoId: 'p1',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 2,
        fecha: new Date().toISOString(),
      },
      {
        id: 'l2',
        productoId: 'p2',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 1,
        fecha: new Date().toISOString(),
      },
    ]);
    await productos.cargarProductos();
    await lotes.cargarLotes();
    const ventas = useVentasStore();
    ventas.setBusqVenta('leche');
    expect(() => ventas.listaVenta).not.toThrow();
    expect(ventas.listaVenta.map((p) => p.id)).toEqual(['p1']);
  });

  it('InventarioView montada con producto sin nombre no revienta', async () => {
    const { mount, flushPromises } = await import('@vue/test-utils');
    const { default: InventarioView } = await import('../src/views/InventarioView.vue');
    // DOS productos: con uno solo sort() jamás invoca el comparador y el
    // crash queda enmascarado (bug de la primera versión de esta sonda)
    await db.productos.bulkPut([
      { id: 'px', precio: 5 },
      { id: 'py', nombre: 'Yogur', precio: 3 },
    ]);
    await db.lotes.bulkPut([
      {
        id: 'lx',
        productoId: 'px',
        cantidadInicial: 10,
        cantidadVendida: 0,
        costo: 2,
        fecha: new Date().toISOString(),
      },
      { id: 'ly', productoId: 'py', cantidadInicial: 8, cantidadVendida: 0, costo: 1, fecha: new Date().toISOString() },
    ]);
    const productos = useProductosStore();
    const lotes = useLotesStore();
    const ajustes = useAjustesStore();
    await productos.cargarProductos();
    await lotes.cargarLotes();
    await ajustes.cargarAjustes();
    const wrapper = mount(InventarioView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    // el grupo del producto sin nombre sigue listado (stock visible), sin NaN
    expect(wrapper.text()).toContain('Yogur');
    expect(wrapper.text()).not.toContain('NaN');
    wrapper.unmount();
  });
});

// ============================================================
// 5. RESPALDO RECORTADO (#53): aviso ANTES de pisar datos
// ============================================================
describe('red-team 3: tablas ausentes en el respaldo', () => {
  it('un respaldo recortado (solo productos) reporta las tablas que faltan', () => {
    const d = respaldoSano();
    delete d.ventas;
    delete d.compras;
    delete d.gastos;
    const ausentes = tablasAusentes(d);
    expect(ausentes).toContain('ventas');
    expect(ausentes).toContain('compras');
    expect(ausentes).toContain('gastos');
    expect(ausentes).not.toContain('productos');
  });

  it('un respaldo completo no reporta nada', () => {
    expect(tablasAusentes(respaldoSano())).toEqual([]);
  });

  it('las tablas vacías ([] explícito) NO cuentan como ausentes', () => {
    const d = respaldoSano();
    d.ventas = [];
    expect(tablasAusentes(d)).toEqual([]);
  });
});

// ============================================================
// 6. PINS DE REGRESIÓN de vectores ya cerrados
// ============================================================
describe('red-team 3: anular lo inexistente queda acotado (#34/#61)', () => {
  it('anularVenta con id fantasma no lanza ni toca la BD', async () => {
    const ventas = useVentasStore();
    await expect(ventas.anularVenta('no-existe')).resolves.toBeUndefined();
    const enBD = await db.ventas.toArray();
    expect(enBD.length).toBe(0);
  });

  it('anularProductoEnVenta con id fantasma no lanza', async () => {
    const ventas = useVentasStore();
    await expect(ventas.anularProductoEnVenta('no-existe', 0)).resolves.toBeUndefined();
  });
});

// ============================================================
// 7. IMPORT ROUND-TRIP: lo sano sigue importando (sin falsos positivos)
// ============================================================
describe('red-team 3: el respaldo sano completa el round-trip', () => {
  it('importarData importa el respaldo sano sin errores', async () => {
    const backup = useBackupStore();
    await backup.importarData(respaldoSano());
    expect((await db.productos.toArray()).length).toBe(2);
    expect((await db.ventas.toArray()).length).toBe(1);
    expect((await db.socios.toArray()).length).toBe(1);
    expect(n((await db.lotes.get('l1')).costo)).toBe(2);
  });
});
