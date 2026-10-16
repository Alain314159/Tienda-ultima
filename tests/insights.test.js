/**
 * Tests PROFUNDOS del motor de insights (src/insights.ts) — Área 7 de la
 * campaña de cobertura profunda (80-90% de la app).
 *
 * Motor PURO: cada regla con sus umbrales y bordes, con el reloj fijado
 * (vi.setSystemTime) para determinismo absoluto. Miércoles 14 oct 2026
 * 10:00 como "ahora" base (día sin contexto temporal especial).
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
    stockDe: () => 0,
    ...over,
  };
}

const venta = (diasAtras, total = 100, ganancia = 30, items = []) => ({
  id: 'v' + Math.random().toString(36).slice(2),
  fecha: new Date(2026, 9, 14 - diasAtras, 12).toISOString(),
  total,
  ganancia,
  anulada: false,
  items: items.length
    ? items
    : [
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

const porClave = (recs) => Object.fromEntries(recs.map((r) => [r.clave, r]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('insights: estado sano', () => {
  it('sin datos no genera recomendaciones (miércoles neutro)', () => {
    expect(generarRecomendaciones(estadoBase())).toEqual([]);
  });
});

describe('insights: URGENTES', () => {
  it('caja negativa: urgente con peso 85, y 95 si pasa de -1000', () => {
    let r = generarRecomendaciones(estadoBase({ saldoCaja: -50 }));
    expect(r[0].nivel).toBe('urgente');
    expect(r[0].peso).toBe(85);
    r = generarRecomendaciones(estadoBase({ saldoCaja: -5000 }));
    expect(r[0].peso).toBe(95);
  });

  it('stock negativo por producto (archivados excluidos)', () => {
    const r = generarRecomendaciones(
      estadoBase({
        productos: [
          { id: 'p1', nombre: 'Roto' },
          { id: 'p2', nombre: 'Viejo', archivado: true },
        ],
        stockDe: (pid) => (pid === 'p1' ? -3 : 0),
      })
    );
    expect(r.length).toBe(1);
    expect(r[0].clave).toBe('stock-neg-p1');
    expect(r[0].nivel).toBe('urgente');
    expect(r[0].titulo).toContain('Roto');
  });

  it('ventas bajo costo: cuenta items con ganancia negativa, excluye anulados', () => {
    const r = generarRecomendaciones(
      estadoBase({
        ventas: [
          venta(1, 100, -10, [
            { productoId: 'p1', nombre: 'A', cantidad: 1, precio: 90, costo: 100, ganancia: -10, anulado: false },
            { productoId: 'p2', nombre: 'B', cantidad: 1, precio: 5, costo: 100, ganancia: -95, anulado: true },
          ]),
        ],
      })
    );
    const mapa = porClave(r);
    expect(mapa['ventas-bajo-costo-1']).toBeTruthy(); // el ítem anulado (-95) NO cuenta
    expect(mapa['ventas-bajo-costo-2']).toBeUndefined();
    expect(mapa['ventas-bajo-costo-1'].nivel).toBe('urgente');
    expect(mapa['ventas-bajo-costo-1'].peso).toBe(88);
  });
});

describe('insights: ATENCIÓN', () => {
  it('cierre pendiente: días desde el último cierre (o periodoInicio)', () => {
    const cfg30 = { ...estadoBase().cfg, umbralDiasCierre: 30 };
    // Sin cierres: desde Sep 1 hasta Oct 14 = 43 días ≥ 30 → salta
    let r = generarRecomendaciones(estadoBase({ cfg: cfg30 }));
    expect(porClave(r)['cierre-pendiente'].peso).toBe(70);

    // Cierre hace 2 días: no salta
    r = generarRecomendaciones(
      estadoBase({ cfg: cfg30, cierres: [{ fechaCierre: new Date(2026, 9, 12).toISOString() }] })
    );
    expect(porClave(r)['cierre-pendiente']).toBeUndefined();
  });

  it('mermas altas: > 5% de las ventas del mes', () => {
    const base = {
      ventas: [venta(2, 1000, 300)],
      ajustes: [{ fecha: new Date(2026, 9, 10).toISOString(), cantidad: -5, costoPerdida: 100 }],
    };
    let r = generarRecomendaciones(estadoBase(base));
    expect(porClave(r)['mermas-altas'].peso).toBe(65); // 10% > 5%

    // Al borde exacto (5%) NO salta
    r = generarRecomendaciones(
      estadoBase({ ...base, ajustes: [{ fecha: new Date(2026, 9, 10).toISOString(), cantidad: -5, costoPerdida: 50 }] })
    );
    expect(porClave(r)['mermas-altas']).toBeUndefined(); // 5% no > 5
  });

  it('faltantes y sobrantes de caja por umbral', () => {
    const mov = (concepto) => [
      { fecha: new Date(2026, 9, 10).toISOString(), concepto, monto: 10 },
      { fecha: new Date(2026, 9, 11).toISOString(), concepto, monto: 10 },
      { fecha: new Date(2026, 9, 12).toISOString(), concepto, monto: 10 },
    ];
    let r = generarRecomendaciones(estadoBase({ movCaja: mov('Faltante en arqueo') }));
    expect(porClave(r)['faltantes-3'].peso).toBe(62);

    r = generarRecomendaciones(estadoBase({ movCaja: mov('Sobrante en arqueo') }));
    expect(porClave(r)['sobrantes-3'].peso).toBe(60);

    // 2 no llegan al umbral de 3
    r = generarRecomendaciones(estadoBase({ movCaja: mov('Faltante en arqueo').slice(0, 2) }));
    expect(porClave(r)['faltantes-2']).toBeUndefined();
  });

  it('descuentos altos: item por debajo del precio de catálogo', () => {
    const productos = [{ id: 'p1', nombre: 'A', precio: 100 }];
    const item = (precio, cantidad = 1, pid = 'p1') => ({
      productoId: pid,
      nombre: 'A',
      cantidad,
      precio,
      costo: 10,
      ganancia: 1,
      anulado: false,
    });
    let r = generarRecomendaciones(estadoBase({ productos, ventas: [venta(1, 75, 65, [item(75)])] }));
    expect(porClave(r)['descuentos-1'].peso).toBe(50); // 25% ≥ 20%

    // 15% no salta; cantidad 0 no salta; producto sin precio no salta
    r = generarRecomendaciones(
      estadoBase({ productos, ventas: [venta(1, 85, 75, [item(85), item(50, 0), item(40, 1, 'pX')])] })
    );
    expect(porClave(r)['descuentos-1']).toBeUndefined();
  });

  it('gastos altos: > 30% de las ventas del mes (con ventas > 100)', () => {
    const gastos = [{ fecha: new Date(2026, 9, 10).toISOString(), monto: 400 }];
    let r = generarRecomendaciones(estadoBase({ gastos, ventas: [venta(2, 1000, 300)] }));
    expect(porClave(r)['gastos-altos'].peso).toBe(48);

    r = generarRecomendaciones(estadoBase({ gastos, ventas: [venta(2, 100, 30)] })); // ventas ≤ 100
    expect(porClave(r)['gastos-altos']).toBeUndefined();
  });

  it('compra cara: última > 30% sobre el promedio de las previas (reciente)', () => {
    const compras = [
      { id: 'c4', productoId: 'p1', costo: 15, fecha: new Date(2026, 9, 13).toISOString(), anulada: false },
      { id: 'c3', productoId: 'p1', costo: 10, fecha: new Date(2026, 8, 20).toISOString(), anulada: false },
      { id: 'c2', productoId: 'p1', costo: 10, fecha: new Date(2026, 8, 10).toISOString(), anulada: false },
      { id: 'c1', productoId: 'p1', costo: 10, fecha: new Date(2026, 7, 30).toISOString(), anulada: false },
    ];
    const productos = [{ id: 'p1', nombre: 'Aceite' }];
    let r = generarRecomendaciones(estadoBase({ productos, compras }));
    const rec = porClave(r)['compra-cara-c4'];
    expect(rec.peso).toBe(45);
    expect(rec.titulo).toContain('50% mas caro');

    // Última vieja (hace 40 días): no salta
    r = generarRecomendaciones(
      estadoBase({
        productos,
        compras: compras.map((c, i) => (i === 0 ? { ...c, fecha: new Date(2026, 8, 1).toISOString() } : c)),
      })
    );
    expect(r.find((x) => x.clave.startsWith('compra-cara'))).toBeUndefined();
  });

  it('anuladas: 5 o más en 30 días', () => {
    const anuladas = [];
    for (let i = 0; i < 5; i++) {
      anuladas.push({ ...venta(i + 1), anulada: true, fechaAnulacion: new Date(2026, 9, 14 - i).toISOString() });
    }
    const r = generarRecomendaciones(estadoBase({ ventas: anuladas }));
    expect(porClave(r)['anuladas-5'].peso).toBe(40);
  });

  it('revisa inventario: 3 agotados o 5 con stock bajo', () => {
    const productos = [
      { id: 'a', nombre: 'A' },
      { id: 'b', nombre: 'B' },
      { id: 'c', nombre: 'C' },
    ];
    let r = generarRecomendaciones(estadoBase({ productos, stockDe: () => 0 }));
    expect(porClave(r)['revisa-inventario'].titulo).toContain('3 agotados');

    const bajos = [];
    for (let i = 0; i < 5; i++) bajos.push({ id: 'bj' + i, nombre: 'B' + i, stockMinimo: 5 });
    r = generarRecomendaciones(estadoBase({ productos: bajos, stockDe: () => 3 }));
    expect(porClave(r)['revisa-inventario'].titulo).toContain('5 bajos');
  });
});

describe('insights: OPORTUNIDAD / INFO', () => {
  it('racha de 5 días consecutivos con ventas', () => {
    const ventas = [venta(0), venta(1), venta(2), venta(3), venta(4)];
    let r = generarRecomendaciones(estadoBase({ ventas }));
    expect(porClave(r)['racha-5'].nivel).toBe('oportunidad');

    r = generarRecomendaciones(estadoBase({ ventas: [venta(0), venta(1), venta(2), venta(3)] }));
    expect(porClave(r)['racha-4']).toBeUndefined();
  });

  it('tendencia semanal: ±15% entre esta semana y la anterior', () => {
    // Semana actual: 14-8 oct · anterior: 7-1 oct
    const ventas = [...Array(3).fill(0)].flatMap((_, d) => [venta(d, 100, 30)]); // 300 esta semana
    const ant = [...Array(3).fill(0)].flatMap((_, d) => [venta(d + 7, 100, 30)]); // 300 la anterior
    let r = generarRecomendaciones(estadoBase({ ventas }));
    expect(porClave(r)['tendencia-semanal']).toBeUndefined(); // 0% de cambio

    const cayendo = [...ventas, ...ant.map((v) => ({ ...v, total: 300, ganancia: 90, items: [] }))]; // anterior 900
    r = generarRecomendaciones(estadoBase({ ventas: cayendo }));
    const rec = porClave(r)['tendencia-semanal'];
    expect(rec.nivel).toBe('atencion');
    expect(rec.titulo).toContain('bajaron 67% esta semana');
    expect(rec.peso).toBe(45); // ≥ 30%
  });

  it('tendencia mensual: este mes vs el anterior', () => {
    const ventas = [venta(3, 100, 30), venta(3 + 30, 1000, 300)]; // mes actual 100, anterior 1000
    const r = generarRecomendaciones(estadoBase({ ventas }));
    const rec = porClave(r)['tendencia-mensual'];
    expect(rec.nivel).toBe('info');
    expect(rec.titulo).toContain('bajaron 90% este mes');
    expect(rec.peso).toBe(38);
  });

  it('margen semanal bajo y proyección semanal (regla revivida: era código muerto)', () => {
    // Semana con ventas 1000 y ganancia 50 (5% < 10%)
    const ventas = [venta(0, 1000, 50)];
    const r = generarRecomendaciones(estadoBase({ ventas }));
    expect(porClave(r)['margen-semanal-bajo'].peso).toBe(52);
    // Antes ceil(6d + hora del día) = 7 y el guard "< 7" mataba la regla:
    // con días fraccionarios (6.42) la proyección dispara de verdad
    const proy = porClave(r)['proyeccion-semanal'];
    expect(proy).toBeTruthy();
    expect(proy.titulo).toContain('$1090.9'); // 1000 / 6.417 días × 7
  });

  it('top producto del mes y concentración de ganancia', () => {
    const productos = [
      { id: 'p1', nombre: 'Estrella' },
      { id: 'p2', nombre: 'Secundario' },
    ];
    const ventas = [
      venta(2, 100, 80, [
        { productoId: 'p1', nombre: 'Estrella', cantidad: 1, precio: 100, costo: 20, ganancia: 80, anulado: false },
        { productoId: 'p2', nombre: 'Secundario', cantidad: 1, precio: 20, costo: 15, ganancia: 5, anulado: false },
      ]),
    ];
    const r = generarRecomendaciones(estadoBase({ productos, ventas }));
    expect(porClave(r)['top-prod'].titulo).toContain('Estrella');
    expect(porClave(r)['concentracion'].detalle).toContain('94%');
  });

  it('mejor día de la semana (90 días, 10+ ventas) y proyección fin de mes', () => {
    // 10 ventas, todas en viernes (9, 2, 25 sep, 18 sep...)
    const ventas = [];
    const viernes = [
      new Date(2026, 9, 9),
      new Date(2026, 9, 2),
      new Date(2026, 8, 25),
      new Date(2026, 8, 18),
      new Date(2026, 8, 11),
      new Date(2026, 8, 4),
      new Date(2026, 7, 28),
      new Date(2026, 7, 21),
      new Date(2026, 7, 14),
      new Date(2026, 7, 7),
    ];
    viernes.forEach((f, i) =>
      ventas.push(
        venta(0, 100, 30, []) && {
          ...venta(0),
          id: 'vf' + i,
          fecha: new Date(f.getFullYear(), f.getMonth(), f.getDate(), 12).toISOString(),
          total: 100,
          ganancia: 30,
        }
      )
    );
    const r = generarRecomendaciones(estadoBase({ ventas }));
    expect(porClave(r)['mejor-dia'].titulo).toContain('Viernes');
    // Oct 14 ≥ día 5 del mes → proyección
    expect(porClave(r)['proyeccion']).toBeTruthy();
  });

  it('productos dormidos: stock sin ventas en el umbral (fecha por alta o lote)', () => {
    const hace90 = new Date(2026, 6, 16).toISOString(); // ~90 días atrás
    const productos = [
      { id: 'd1', nombre: 'Polvorón', fechaCreacion: hace90 },
      { id: 'd2', nombre: 'Sin fecha pero lote viejo' },
      { id: 'vivo', nombre: 'Vivo', fechaCreacion: hace90 },
    ];
    const lotes = [{ productoId: 'd2', fecha: hace90 }];
    const ventas = [
      venta(3, 100, 30, [
        { productoId: 'vivo', nombre: 'Vivo', cantidad: 1, precio: 100, costo: 70, ganancia: 30, anulado: false },
      ]),
    ];
    const r = generarRecomendaciones(
      estadoBase({ productos, lotes, ventas, stockDe: (pid) => (pid === 'vivo' ? 0 : 5) })
    );
    const rec = porClave(r)['dormidos-2'];
    expect(rec).toBeTruthy();
    expect(rec.detalle).toContain('Polvorón');
    expect(rec.detalle).toContain('Sin fecha pero lote viejo');
    expect(rec.detalle).not.toContain('Vivo');
  });
});

describe('insights: contexto temporal', () => {
  it('lunes temprano: nuevo mes', () => {
    vi.setSystemTime(new Date(2026, 9, 12, 8, 0)); // lunes 12 oct, 8am
    const r = generarRecomendaciones(estadoBase());
    expect(r[0].clave).toBe('ctx-nuevo-mes');
  });

  it('viernes por la tarde y sábado por la mañana', () => {
    vi.setSystemTime(new Date(2026, 9, 16, 16, 0)); // viernes 16 oct
    expect(generarRecomendaciones(estadoBase())[0].clave).toBe('ctx-viernes');

    vi.setSystemTime(new Date(2026, 9, 17, 10, 0)); // sábado 17 oct
    expect(generarRecomendaciones(estadoBase())[0].clave).toBe('ctx-sabado');
  });

  it('domingo por la noche: resumen semanal', () => {
    vi.setSystemTime(new Date(2026, 9, 18, 19, 0)); // domingo 18 oct
    expect(generarRecomendaciones(estadoBase())[0].clave).toBe('ctx-domingo');
  });

  it('fin de mes con 25+ días sin cierre: momento de cerrar', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0)); // viernes 30 oct
    const r = generarRecomendaciones(estadoBase());
    expect(r[0].clave).toBe('ctx-cierre-mes');
    expect(r[0].nivel).toBe('atencion');
  });

  it('de noche con ventas hoy: cierre del día', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 22, 30));
    const r = generarRecomendaciones(estadoBase({ ventas: [venta(0, 250, 60)] }));
    // (empata en peso con proyeccion-semanal: buscar por clave, no por orden)
    const cierre = porClave(r)['ctx-cierre-dia'];
    expect(cierre.titulo).toContain('250');
  });
});

describe('insights: orden final', () => {
  it('urgente > atencion > oportunidad > info, y peso descendente dentro del nivel', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 22, 30));
    const r = generarRecomendaciones(
      estadoBase({
        saldoCaja: -50, // urgente 85
        ventas: [venta(0, 250, 60)], // cierre del día (info) + proyección + top…
        gastos: [{ fecha: new Date(2026, 9, 10).toISOString(), monto: 400 }], // gastos altos
      })
    );
    const orden = { urgente: 0, atencion: 1, oportunidad: 2, info: 3 };
    for (let i = 1; i < r.length; i++) {
      expect(orden[r[i - 1].nivel]).toBeLessThanOrEqual(orden[r[i].nivel]);
      if (r[i - 1].nivel === r[i].nivel) {
        expect(r[i - 1].peso).toBeGreaterThanOrEqual(r[i].peso);
      }
    }
    expect(r[0].nivel).toBe('urgente');
  });
});
