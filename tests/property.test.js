/**
 * Property-based testing (fast-check) de los invariantes nucleares.
 *
 * A diferencia de los tests por ejemplo (semillas fijas), aquí se generan
 * miles de casos aleatorios y se verifican PROPIEDADES que deben cumplirse
 * siempre:
 *
 *  1. Aritmética de dinero (utils/numero): idempotencia del redondeo,
 *     simetría half-away-from-zero, cotas de error de sumas.
 *  2. FIFO (services/fifo): conservación de cantidad, costos consistentes,
 *     orden por fecha, stock insuficiente detectado.
 *  3. Libro diario (services/libroDiario): partida doble SIEMPRE balanceada,
 *     balanza consistente, idempotencia, invarianza a permutaciones,
 *     exclusión de anulados, y la ecuación fundamental:
 *     Caja del libro === Caja recalculada independiente de los datos fuente.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { n, m } from '../src/utils/numero';
import { calcFIFO } from '../src/services/fifo';
import { generarAsientos, balanzaDeComprobacion, sumaDebe, balanceGeneral, CUENTAS } from '../src/services/libroDiario';

// ===== Generadores =====

/** Dinero razonable: hasta 100k con hasta 2 decimales de entrada. */
const dinero = fc.double({ min: 0, max: 100000, noNaN: true, next: true }).map((x) => Math.round(x * 100) / 100);

const dineroChico = fc.double({ min: 0, max: 500, noNaN: true, next: true }).map((x) => Math.round(x * 100) / 100);

const fechaIso = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2026-12-31'), noInvalidDate: true })
  .map((d) => d.toISOString());

const id = (pref) => fc.nat(100000).map((x) => pref + x);

/** Array con ids únicos (IndexedDB los exige: modelamos el contrato real). */
const unicos = (arb, maxLength) => fc.uniqueArray(arb, { selector: (x) => x.id, maxLength });

/** Venta mínima con la forma que lee generarAsientos. */
const ventaArb = fc.record({
  id: id('v_'),
  fecha: fechaIso,
  anulada: fc.boolean(),
  total: dinero,
  items: fc.array(
    fc.record({
      productoId: id('p_'),
      costo: dineroChico,
      anulado: fc.boolean(),
    }),
    { maxLength: 5 }
  ),
});

const compraArb = fc.record({
  id: id('c_'),
  fecha: fechaIso,
  anulada: fc.boolean(),
  total: dinero,
  productoId: id('p_'),
  productoNombre: fc.constantFrom('X', 'Y', null),
});

const gastoArb = fc.record({
  id: id('g_'),
  fecha: fechaIso,
  monto: dinero,
  concepto: fc.constantFrom('luz', 'agua', ''),
  categoria: fc.constantFrom('servicios', 'varios'),
  saleDeCaja: fc.option(fc.boolean(), { nil: undefined }),
});

const aporteArb = fc.record({
  id: id('ap_'),
  fecha: fechaIso,
  monto: dinero,
  nota: fc.constantFrom('', 'socio'),
});

const retiroArb = fc.record({
  id: id('r_'),
  fecha: fechaIso,
  monto: dinero,
  concepto: fc.constantFrom('ganancia', 'capital', ''),
  tipoRetiro: fc.constantFrom('capital', 'ganancia'),
});

const movCajaArb = fc.record({
  id: id('mv_'),
  fecha: fechaIso,
  monto: dinero,
  tipo: fc.constantFrom('ingreso', 'egreso'),
  concepto: fc.constantFrom('ajuste', ''),
});

const mermaArb = fc.record({
  id: id('aj_'),
  fecha: fechaIso,
  cantidad: fc.double({ min: -50, max: -0.1, noNaN: true }),
  costoPerdida: dinero,
  motivo: fc.constantFrom('rotura', 'vencido'),
  productoNombre: fc.constantFrom('A', 'B'),
});

/** DatosLibro completo (sin sobrantes: sin lotes 'aj-'). */
const datosLibroArb = fc
  .record({
    capitalInicial: dinero,
    ventas: unicos(ventaArb, 12),
    compras: unicos(compraArb, 8),
    gastos: unicos(gastoArb, 8),
    capital: unicos(aporteArb, 5),
    retiros: unicos(retiroArb, 5),
    movCaja: unicos(movCajaArb, 6),
    ajustes: unicos(mermaArb, 6),
    lotes: fc.constant([]),
  })
  .map((d) => {
    // Espejos movCaja con el contrato real de producción (GastosView):
    // solo gastos con monto > 0 pagados de caja, tipo 'egreso' y mismo monto.
    // El espejo muere con el gasto (eliminarGasto lo borra en la misma tx).
    const movCaja = d.movCaja.map((mv) => ({ ...mv }));
    const gastos = d.gastos.map((g) => {
      if (n(g.monto) > 0 && g.saleDeCaja !== false && d.movCaja.length > 0) {
        const espejo = d.movCaja[Math.floor(Math.random() * d.movCaja.length)];
        return { ...g, movId: espejo.id };
      }
      const sinMov = { ...g };
      delete sinMov.movId;
      return sinMov;
    });
    // Los espejos referenciados se alinean con su gasto (monto/tipo reales)
    const idsGasto = new Set(gastos.filter((g) => g.movId).map((g) => g.movId));
    for (const mov of d.movCaja) {
      if (idsGasto.has(mov.id)) {
        const g = gastos.find((x) => x.movId === mov.id);
        mov.tipo = 'egreso';
        mov.monto = g.monto;
      }
    }
    return { ...d, gastos, movCaja };
  });

/** Recalcula la caja esperada INDEPENDIENTEMENTE del generador del libro.
 *  Nota: un gasto SIEMPRE carga contra Caja (salvo saleDeCaja === false);
 *  su movCaja espejo es el que el libro excluye para no duplicar. */
function cajaEsperada(d) {
  let caja = n(d.capitalInicial);
  for (const x of d.capital) if (n(x.monto) > 0) caja += n(x.monto);
  for (const v of d.ventas) if (!v.anulada && n(v.total) > 0) caja += n(v.total);
  for (const c of d.compras) if (!c.anulada && n(c.total) > 0) caja -= n(c.total);
  for (const g of d.gastos) if (n(g.monto) > 0 && g.saleDeCaja !== false) caja -= n(g.monto);
  for (const r of d.retiros) if (n(r.monto) > 0) caja -= n(r.monto);
  // Los espejos de gastos vivos quedan representados por su gasto: excluirlos
  const movIdsDeGastos = new Set(d.gastos.filter((g) => g.movId).map((g) => g.movId));
  for (const mov of d.movCaja) {
    if (movIdsDeGastos.has(mov.id)) continue;
    if (n(mov.monto) > 0) caja += mov.tipo === 'ingreso' ? n(mov.monto) : -n(mov.monto);
  }
  return m(caja);
}

/** Recalcula el resultado esperado (P&L) desde los datos fuente. */
function resultadoEsperado(d) {
  let ing = 0;
  let cogs = 0;
  for (const v of d.ventas) {
    if (v.anulada || n(v.total) <= 0) continue;
    ing += n(v.total);
    for (const item of v.items) if (!item.anulado) cogs += n(item.costo);
  }
  let gastos = 0;
  for (const g of d.gastos) if (n(g.monto) > 0) gastos += n(g.monto);
  let mermas = 0;
  for (const a of d.ajustes) if (n(a.cantidad) < 0 && n(a.costoPerdida) > 0) mermas += n(a.costoPerdida);
  return { ing: m(ing), cogs: m(cogs), gastos: m(gastos), mermas: m(mermas) };
}

const saldoDe = (filas, cuenta) => {
  const f = filas.find((x) => x.cuenta === cuenta);
  return f ? f.saldo : 0;
};

const numRuns = 200;

// ===== 1. Aritmética de dinero =====

describe('property: aritmética de dinero (utils/numero)', () => {
  it('m() es idempotente: m(m(x)) === m(x) (dominio representable ±1e11)', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e11, max: 1e11, noNaN: true }), (x) => {
        return m(m(x)) === m(x);
      }),
      { numRuns }
    );
  });

  it('m() nunca se aleja más de medio paso (5e-5) del valor original', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
        const r = m(x);
        return isFinite(r) && Math.abs(r - x) <= 5e-5 + Math.abs(x) * Number.EPSILON * 2;
      }),
      { numRuns }
    );
  });

  it('redondeo simétrico half-away-from-zero: m(-x) === -m(x)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e9, noNaN: true }), (x) => {
        return m(-x) === -m(x) || Object.is(m(-x), -m(x));
      }),
      { numRuns }
    );
  });

  it('el error de sumar redondeando nunca excede 1e-4 por término', () => {
    fc.assert(
      fc.property(fc.array(dineroChico, { maxLength: 50 }), (xs) => {
        const sumaExacta = xs.reduce((s, x) => s + x, 0);
        const sumaRedondeada = xs.reduce((s, x) => m(s + m(x)), 0);
        return Math.abs(sumaRedondeada - sumaExacta) <= 1e-4 * xs.length + 1e-9;
      }),
      { numRuns }
    );
  });

  it('n() parsea identidad de enteros y Strings numéricas válidas; basura → 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), (x) => {
        expect(n(x)).toBe(x);
        expect(n(String(x))).toBe(x);
        expect(n('no-num' + String(Math.abs(x)))).toBe(0);
        expect(n(null)).toBe(0);
        expect(n(undefined)).toBe(0);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ===== 2. FIFO =====

describe('property: FIFO (services/fifo)', () => {
  /** Lotes con fechas y costos aleatorios para UN producto (ids únicos). */
  const lotesArb = fc
    .uniqueArray(
      fc.record({
        id: id('l_'),
        productoId: fc.constant('p_1'),
        cantidadInicial: fc.nat({ max: 100 }).map((x) => x + 1), // ≥ 1
        cantidadVendida: fc.nat({ max: 100 }),
        costo: dineroChico.map((x) => x + 0.01),
        fecha: fechaIso,
      }),
      { selector: (l) => l.id, minLength: 1, maxLength: 8 }
    )
    .map((lotes) =>
      // Normalizar: cantidadVendida nunca excede la inicial (invariante de la app)
      lotes.map((l) => ({ ...l, cantidadVendida: Math.min(l.cantidadVendida, l.cantidadInicial - 1) }))
    );

  const stockTotal = (lotes) => lotes.reduce((s, l) => s + Math.max(0, n(l.cantidadInicial) - n(l.cantidadVendida)), 0);

  it('conservación: la cantidad tomada de los lotes SIEMPRE suma lo pedido (o error)', () => {
    fc.assert(
      fc.property(lotesArb, fc.nat({ max: 500 }), (lotes, cantPedida) => {
        const r = calcFIFO('p_1', cantPedida, lotes);
        const stock = stockTotal(lotes);
        if (cantPedida > stock) {
          return r.error === 'Stock insuficiente' && r.lotesUsados.length === 0 && r.costoTotal === 0;
        }
        if (cantPedida === 0 || stock === 0) return true; // casos triviales
        const tomado = r.lotesUsados.reduce((s, u) => s + n(u.cantidad), 0);
        return r.error === null && Math.abs(tomado - cantPedida) < 1e-9;
      }),
      { numRuns }
    );
  });

  it('costoTotal === Σ(cantidad × costo del lote) y unitario consistente', () => {
    fc.assert(
      fc.property(lotesArb, fc.integer({ min: 1, max: 300 }), (lotes, cant) => {
        const stock = stockTotal(lotes);
        if (stock === 0) return true;
        const r = calcFIFO('p_1', Math.min(cant, stock), lotes);
        if (r.error) return true;
        const esperado = r.lotesUsados.reduce((s, u) => s + n(u.cantidad) * n(u.costo), 0);
        const cant2 = Math.min(cant, stock);
        return (
          Math.abs(r.costoTotal - m(esperado)) < 1e-6 &&
          // el unitario redondeado a 4 dec × cantidad puede desviar ≤ 5e-5 por unidad
          Math.abs(r.costoUnitario * cant2 - r.costoTotal) <= cant2 * 5e-5 + 1e-6
        );
      }),
      { numRuns }
    );
  });

  it('orden: consume primero los lotes más antiguos (por fecha, luego id)', () => {
    fc.assert(
      fc.property(lotesArb, fc.integer({ min: 1, max: 200 }), (lotes, cant) => {
        const stock = stockTotal(lotes);
        if (stock === 0) return true;
        const r = calcFIFO('p_1', Math.min(cant, stock), lotes);
        if (r.error) return true;
        const porId = new Map(lotes.map((l) => [l.id, l]));
        let fechaPrev = -Infinity;
        for (const u of r.lotesUsados) {
          const t = new Date(porId.get(u.loteId).fecha).getTime();
          if (t < fechaPrev - 1) return false;
          fechaPrev = Math.max(fechaPrev, t);
        }
        return true;
      }),
      { numRuns }
    );
  });

  it('aislamiento: lotes de otros productos jamás se consumen', () => {
    fc.assert(
      fc.property(lotesArb, fc.integer({ min: 1, max: 200 }), (lotes, cant) => {
        const ajenos = lotes.map((l) => ({ ...l, productoId: 'p_OTRO' }));
        const stock = stockTotal(lotes);
        if (stock === 0) return true;
        const r = calcFIFO('p_1', Math.min(cant, stock), ajenos);
        return r.error === 'No hay lotes disponibles' && r.costoTotal === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('descuento parcial nunca pide más stock del disponible por lote', () => {
    fc.assert(
      fc.property(lotesArb, fc.integer({ min: 1, max: 300 }), (lotes, cant) => {
        const stock = stockTotal(lotes);
        if (stock === 0) return true;
        const r = calcFIFO('p_1', Math.min(cant, stock), lotes);
        if (r.error) return true;
        const porId = new Map(lotes.map((l) => [l.id, l]));
        for (const u of r.lotesUsados) {
          const l = porId.get(u.loteId);
          if (n(u.cantidad) > n(l.cantidadInicial) - n(l.cantidadVendida) + 1e-9) return false;
        }
        return true;
      }),
      { numRuns }
    );
  });
});

// ===== 3. Libro diario =====

describe('property: libro diario de partida doble (services/libroDiario)', () => {
  it('la partida doble SIEMPRE balancea: Σdebe === Σhaber en la balanza', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const asientos = generarAsientos(d);
        const filas = balanzaDeComprobacion(asientos);
        const totalDebe = filas.reduce((s, f) => s + f.debe, 0);
        const totalHaber = filas.reduce((s, f) => s + f.haber, 0);
        return Math.abs(totalDebe - totalHaber) < 1e-6 && Math.abs(sumaDebe(asientos) - totalDebe) < 1e-6;
      }),
      { numRuns }
    );
  });

  it('cada asiento: monto positivo, 4 decimales y cuentas distintas', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        for (const a of generarAsientos(d)) {
          if (!(a.monto > 0)) return false;
          if (Math.abs(a.monto * 10000 - Math.round(a.monto * 10000)) > 1e-6) return false;
          if (a.cuentaDebe === a.cuentaHaber) return false;
          if (!a.id || !a.fecha || !a.concepto) return false;
        }
        return true;
      }),
      { numRuns }
    );
  });

  it('balanza consistente: saldo === debe − haber en cada fila', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        for (const f of balanzaDeComprobacion(generarAsientos(d))) {
          if (Math.abs(f.saldo - m(f.debe - f.haber)) > 1e-9) return false;
          if (f.debe < 0 || f.haber < 0) return false;
        }
        return true;
      }),
      { numRuns }
    );
  });

  it('ECUACIÓN FUNDAMENTAL: saldo de Caja del libro === caja recalculada de los datos', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const filas = balanzaDeComprobacion(generarAsientos(d));
        const cajaLibro = saldoDe(filas, CUENTAS.CAJA);
        return Math.abs(cajaLibro - cajaEsperada(d)) < 1e-6;
      }),
      { numRuns }
    );
  });

  it('BALANCE GENERAL: Activo === Patrimonio para cualquier libro (ecuación contable)', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const bg = balanceGeneral(generarAsientos(d));
        return (
          bg.cuadra &&
          Math.abs(bg.totalActivo - (bg.caja + bg.inventario)) < 1e-6 &&
          Math.abs(bg.totalPatrimonio - (bg.capital + bg.resultado - bg.retirosGanancia + bg.fueraCaja)) < 1e-6
        );
      }),
      { numRuns }
    );
  });

  it('resultado del libro === P&L recalculado de los datos fuente', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const filas = balanzaDeComprobacion(generarAsientos(d));
        // INGRESOS/SOBRANTES son acreedoras (saldo ≤ 0): su contribución al
        // resultado es -saldo; COSTO/GASTOS/MERMAS son deudoras: +saldo.
        const res = {
          ing: -saldoDe(filas, CUENTAS.INGRESOS),
          cogs: saldoDe(filas, CUENTAS.COSTO),
          gastos: saldoDe(filas, CUENTAS.GASTOS),
          mermas: saldoDe(filas, CUENTAS.MERMAS),
        };
        const esperado = resultadoEsperado(d);
        return (
          Math.abs(res.ing - esperado.ing) < 1e-6 &&
          Math.abs(res.cogs - esperado.cogs) < 1e-6 &&
          Math.abs(res.gastos - esperado.gastos) < 1e-6 &&
          Math.abs(res.mermas - esperado.mermas) < 1e-6
        );
      }),
      { numRuns }
    );
  });

  it('idempotencia: generar dos veces produce exactamente los mismos asientos', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const a = generarAsientos(d);
        const b = generarAsientos(JSON.parse(JSON.stringify(d)));
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 100 }
    );
  });

  it('invarianza a permutaciones: el orden de los registros fuente no altera el libro', () => {
    fc.assert(
      fc.property(datosLibroArb, (d) => {
        const shuffle = (xs) => {
          const c = [...xs];
          for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
          }
          return c;
        };
        const a = generarAsientos(d).map((x) => x.id);
        const b = generarAsientos({
          ...d,
          ventas: shuffle(d.ventas),
          compras: shuffle(d.compras),
          gastos: shuffle(d.gastos),
          capital: shuffle(d.capital),
          retiros: shuffle(d.retiros),
          movCaja: shuffle(d.movCaja),
          ajustes: shuffle(d.ajustes),
        }).map((x) => x.id);
        return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      }),
      { numRuns: 100 }
    );
  });

  it('exclusión de anulados: añadir ventas/compras anuladas NO cambia el libro', () => {
    fc.assert(
      fc.property(datosLibroArb, fechaIso, dinero, dinero, (d, fecha, totV, totC) => {
        // Fecha posterior a todos los eventos para no mover la fecha de referencia
        const ref = d.ventas[0]?.fecha || '';
        const fechaSegura = fecha > ref ? fecha : new Date('2027-01-01').toISOString();
        const d2 = {
          ...d,
          ventas: [
            ...d.ventas,
            { id: 'v_extra', fecha: fechaSegura, anulada: true, total: totV, items: [{ costo: 1, anulado: false }] },
          ],
          compras: [...d.compras, { id: 'c_extra', fecha: fechaSegura, anulada: true, total: totC, productoId: 'p_x' }],
        };
        const a = generarAsientos(d).map((x) => x.id);
        const b = generarAsientos(d2).map((x) => x.id);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 100 }
    );
  });

  it('monotonicidad: sin operaciones nuevas el libro no cambia; con venta nueva solo crece', () => {
    fc.assert(
      fc.property(datosLibroArb, fc.integer({ min: 1, max: 9999 }), (d, tot) => {
        const antes = generarAsientos(d).length;
        const d2 = {
          ...d,
          ventas: [
            ...d.ventas,
            { id: 'v_new', fecha: new Date('2027-06-01').toISOString(), anulada: false, total: tot, items: [] },
          ],
        };
        const despues = generarAsientos(d2).length;
        return despues === antes + 1; // exactamente un asiento más (costo 0 → no genera partida)
      }),
      { numRuns: 100 }
    );
  });
});
