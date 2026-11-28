/**
 * Tests de rendimiento del motor de insights (4.2/4.3):
 * - Equivalencia: con los índices pre-parseados y los Map, las reglas
 *   disparan exactamente igual que antes (mismos títulos/claves).
 * - Volumen: miles de ventas/productos/compras se procesan en una sola
 *   pasada por array, sin re-parsear cada fecha por filtro ni hacer
 *   productos.find() dentro de bucles.
 *
 * El reloj se fija (miércoles 14 oct 2026 10:00) como en
 * tests/insights.test.js, para determinismo absoluto.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generarRecomendaciones } from '../src/insights';

const AHORA = new Date(2026, 9, 14, 10, 0, 0); // miércoles 14 oct 2026, 10:00

function estadoBase(over = {}) {
  return {
    ventas: [],
    compras: [],
    gastos: [],
    ajustes: [],
    productos: [],
    lotes: [],
    cierres: [],
    movCaja: [],
    saldoCaja: 0,
    cfg: {
      periodoInicio: '2026-09-01T00:00:00.000Z',
      umbralDiasCierre: 999,
      umbralFaltantesMes: 3,
      umbralSobrantesMes: 3,
      umbralDescuentoPct: 20,
      umbralSinMovimientoDias: 60,
    },
    formatMoney: (x) => '$' + x,
    formatNum: (x) => String(x),
    stockDe: () => 10,
    ...over,
  };
}

const venta = (diasAtras, total = 100, ganancia = 30, items) => ({
  id: 'v' + diasAtras + '_' + Math.random().toString(36).slice(2),
  fecha: new Date(2026, 9, 14 - diasAtras, 12).toISOString(),
  total,
  ganancia,
  anulada: false,
  items: items || [
    {
      productoId: 'p1',
      nombre: 'X',
      cantidad: 1,
      unidad: '',
      precio: total,
      costo: total - ganancia,
      ganancia,
      lotesUsados: [],
    },
  ],
});

beforeEach(() => {
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('insights: equivalencia tras la optimización', () => {
  it('las reglas disparan igual: bajo costo, descuento, compra cara y top producto', () => {
    const estado = estadoBase({
      productos: [
        { id: 'p1', nombre: 'A', precio: 100, archivado: false },
        { id: 'p2', nombre: 'B', precio: 50, archivado: false },
      ],
      ventas: [
        // Bajo costo (ganancia negativa) hace 2 días.
        venta(2, 80, -10, [
          { productoId: 'p1', nombre: 'A', cantidad: 1, precio: 80, costo: 90, ganancia: -10 },
        ]),
        // Descuento del 30% sobre el precio base de p1 (umbral 20%).
        venta(1, 70, 20, [
          { productoId: 'p1', nombre: 'A', cantidad: 1, precio: 70, costo: 50, ganancia: 20 },
        ]),
        // Ventas del mes para el top producto (p1 gana más).
        venta(3, 100, 30),
        venta(4, 100, 30),
      ],
      compras: [
        { id: 'c1', productoId: 'p2', costo: 10, fecha: new Date(2026, 9, 10, 12).toISOString(), anulada: false },
        { id: 'c2', productoId: 'p2', costo: 10, fecha: new Date(2026, 9, 8, 12).toISOString(), anulada: false },
        { id: 'c3', productoId: 'p2', costo: 10, fecha: new Date(2026, 9, 5, 12).toISOString(), anulada: false },
        // Última compra de p2 un 50% más cara que el promedio previo.
        { id: 'c4', productoId: 'p2', costo: 15, fecha: new Date(2026, 9, 13, 12).toISOString(), anulada: false },
      ],
    });
    const claves = generarRecomendaciones(estado).map((r) => r.clave);
    expect(claves).toContain('ventas-bajo-costo-1');
    // Descuento >= 20%: el ítem a 80 (20%) Y el ítem a 70 (30%).
    expect(claves).toContain('descuentos-2');
    expect(claves).toContain('compra-cara-c4');
    expect(claves).toContain('top-prod');
  });

  it('es determinista: dos ejecuciones sobre el mismo estado dan lo mismo', () => {
    const estado = estadoBase({
      productos: [{ id: 'p1', nombre: 'A', precio: 100, archivado: false }],
      ventas: [venta(1), venta(2), venta(5), venta(9)],
      gastos: [{ id: 'g1', fecha: new Date(2026, 9, 10, 12).toISOString(), monto: 50 }],
      movCaja: [
        { id: 'm1', fecha: new Date(2026, 9, 12, 12).toISOString(), concepto: 'Faltante arqueo', monto: 5 },
        { id: 'm2', fecha: new Date(2026, 9, 11, 12).toISOString(), concepto: 'Faltante arqueo', monto: 5 },
        { id: 'm3', fecha: new Date(2026, 9, 10, 12).toISOString(), concepto: 'Faltante arqueo', monto: 5 },
      ],
    });
    const a = generarRecomendaciones(estado);
    const b = generarRecomendaciones(estado);
    expect(a).toEqual(b);
    expect(a.map((r) => r.clave)).toContain('faltantes-3');
  });

  it('una venta con fecha simple (YYYY-MM-DD) cuenta en el mes', () => {
    const estado = estadoBase({
      productos: [{ id: 'p1', nombre: 'A', precio: 100, archivado: false }],
      // Fecha sin hora: el parse local la pone el 10/10 a medianoche local,
      // dentro del mes; con new Date() crudo caería en UTC y en Cuba sería
      // el 9/10 por la noche (mismo mes aquí, pero el día cambia: la
      // proyección y la racha usan el día exacto).
      ventas: [{ id: 'v_bare', fecha: '2026-10-10', total: 100, ganancia: 30, anulada: false, items: [] }],
    });
    const recs = generarRecomendaciones(estado);
    // Proyección de fin de mes: solo existe si totalMes > 0.
    expect(recs.map((r) => r.clave)).toContain('proyeccion');
  });

  it('producto dormido: sin ventas en 60 días y con stock', () => {
    const estado = estadoBase({
      productos: [
        { id: 'p1', nombre: 'A', precio: 100, archivado: false, fechaCreacion: '2026-01-01T12:00:00.000Z' },
        { id: 'p2', nombre: 'B', precio: 50, archivado: false, fechaCreacion: '2026-10-01T12:00:00.000Z' },
      ],
      lotes: [{ id: 'l1', productoId: 'p1', fecha: '2026-01-02T12:00:00.000Z' }],
      // La venta reciente es de p2, no de p1: p1 queda sin movimiento.
      ventas: [
        venta(1, 100, 30, [
          { productoId: 'p2', nombre: 'B', cantidad: 1, precio: 50, costo: 30, ganancia: 20 },
        ]),
      ],
    });
    const claves = generarRecomendaciones(estado).map((r) => r.clave);
    expect(claves).toContain('dormidos-1');
  });
});

describe('insights: volumen', () => {
  it('3000 ventas, 200 productos y 1000 compras se procesan sin explotar', () => {
    const productos = Array.from({ length: 200 }, (_, i) => ({
      id: 'p' + i,
      nombre: 'Prod ' + i,
      precio: 100,
      archivado: false,
      fechaCreacion: '2026-01-01T12:00:00.000Z',
    }));
    const ventas = Array.from({ length: 3000 }, (_, i) => {
      const diasAtras = i % 90;
      return {
        id: 'v' + i,
        fecha: new Date(2026, 9, 14 - diasAtras, 12).toISOString(),
        total: 100,
        ganancia: 30,
        anulada: false,
        items: [
          {
            productoId: 'p' + (i % 200),
            nombre: 'Prod',
            cantidad: 1,
            precio: 100,
            costo: 70,
            ganancia: 30,
          },
        ],
      };
    });
    const compras = Array.from({ length: 1000 }, (_, i) => ({
      id: 'c' + i,
      productoId: 'p' + (i % 200),
      costo: 10,
      fecha: new Date(2026, 9, 14 - (i % 40), 12).toISOString(),
      anulada: false,
    }));
    const estado = estadoBase({ productos, ventas, compras });
    const t0 = Date.now();
    const recs = generarRecomendaciones(estado);
    const ms = Date.now() - t0;
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.map((r) => r.clave)).toContain('top-prod');
    expect(recs.map((r) => r.clave)).toContain('mejor-dia');
    // Sin un tope duro (el runner varía): el volumen solo no debe
    // convertir el cálculo en algo perceptible; 5 s es holgado incluso
    // en un teléfono lento y caza una regresión cuadrática.
    expect(ms).toBeLessThan(5000);
  });
});
