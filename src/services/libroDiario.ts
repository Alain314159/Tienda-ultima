/**
 * Libro diario de partida doble (asientos automáticos).
 *
 * Diseño: los asientos NO se escriben en cada operación, sino que se
 * REGENERAN completos a partir del estado actual de las tablas fuente
 * (ventas, compras, gastos, capital, retiros, movCaja, ajustes, cfg).
 * Esto lo hace:
 *   - auto-reparable: cualquier drift se corrige en la próxima regeneración
 *   - idempotente: mismo estado de origen => mismos asientos (IDs estables)
 *   - innecesario respaldarlo: se excluye de los backups y se reconstruye
 *
 * Cada asiento es una partida equilibrada: un cargo (debe) y un abono
 * (haber) por el mismo monto, por lo que el libro SIEMPRE balancea.
 */
import type {
  Venta,
  Compra,
  Gasto,
  MovCapital,
  Retiro,
  MovCaja,
  Ajuste,
  Lote,
  Asiento,
  RefTipoAsiento,
} from '../types';
import { n, m } from '../utils/numero';
import { db } from '../db';

// Re-exportar para conveniencia de los consumidores (UI, tests)
export type { Asiento, RefTipoAsiento };

/** Alias histórico del tipo de evento de origen. */
export type RefTipo = RefTipoAsiento;

/** Nombres de las cuentas del plan contable simplificado de la tienda. */
export const CUENTAS = {
  CAJA: 'Caja',
  INVENTARIO: 'Inventario',
  CAPITAL: 'Capital',
  INGRESOS: 'Ingresos por ventas',
  COSTO: 'Costo de ventas',
  GASTOS: 'Gastos',
  MERMAS: 'Mermas',
  RETIROS_GANANCIA: 'Retiros de ganancia',
  AJUSTES_CAJA: 'Ajustes de caja',
  FUERA_CAJA: 'Pagos fuera de caja',
  SOBRANTES: 'Sobrantes de inventario',
} as const;

/** Snapshot de las tablas fuente del libro (para regenerar y para tests). */
export interface DatosLibro {
  capitalInicial: number | string;
  ventas: Venta[];
  compras: Compra[];
  gastos: Gasto[];
  capital: MovCapital[];
  retiros: Retiro[];
  movCaja: MovCaja[];
  ajustes: Ajuste[];
  lotes: Lote[];
}

/** Genera todos los asientos a partir del snapshot. Función pura. */
export function generarAsientos(d: DatosLibro): Asiento[] {
  const out: Asiento[] = [];

  // Fecha de referencia para el capital inicial: el evento más antiguo
  // registrado (estable entre regeneraciones mientras no cambie el histórico)
  const fechas = [
    ...d.ventas.map((v) => v.fecha),
    ...d.compras.map((c) => c.fecha),
    ...d.gastos.map((g) => g.fecha),
    ...d.capital.map((c) => c.fecha),
    ...d.retiros.map((r) => r.fecha),
    ...d.movCaja.map((x) => x.fecha),
    ...d.ajustes.map((a) => a.fecha),
  ].filter(Boolean);
  const fechaRef = fechas.sort()[0] || new Date().toISOString();

  // 1) Capital inicial sembrado en caja
  const ini = n(d.capitalInicial);
  if (ini > 0) {
    out.push({
      id: 'capitalInicial:cfg',
      fecha: fechaRef,
      refTipo: 'capitalInicial',
      refId: 'cfg',
      concepto: 'Capital inicial en caja',
      cuentaDebe: CUENTAS.CAJA,
      cuentaHaber: CUENTAS.CAPITAL,
      monto: m(ini),
    });
  }

  // 2) Aportes de capital
  for (const x of d.capital) {
    if (n(x.monto) <= 0) continue;
    out.push({
      id: 'aporte:' + x.id,
      fecha: x.fecha,
      refTipo: 'aporte',
      refId: x.id,
      concepto: 'Aporte de capital' + (x.nota ? ': ' + x.nota : ''),
      cuentaDebe: CUENTAS.CAJA,
      cuentaHaber: CUENTAS.CAPITAL,
      monto: m(n(x.monto)),
    });
  }

  // 3) Compras: entra mercancía, sale efectivo (las anuladas se excluyen)
  for (const c of d.compras) {
    if (c.anulada || n(c.total) <= 0) continue;
    out.push({
      id: 'compra:' + c.id,
      fecha: c.fecha,
      refTipo: 'compra',
      refId: c.id,
      concepto: 'Compra: ' + (c.productoNombre || c.productoId),
      cuentaDebe: CUENTAS.INVENTARIO,
      cuentaHaber: CUENTAS.CAJA,
      monto: m(n(c.total)),
    });
  }

  // 4) Ventas: dos partidas por venta (ingreso y costo)
  for (const v of d.ventas) {
    if (v.anulada || n(v.total) <= 0) continue;
    out.push({
      id: 'venta:' + v.id,
      fecha: v.fecha,
      refTipo: 'venta',
      refId: v.id,
      concepto: 'Venta de ' + v.items.filter((i) => !i.anulado).length + ' artículo(s)',
      cuentaDebe: CUENTAS.CAJA,
      cuentaHaber: CUENTAS.INGRESOS,
      monto: m(n(v.total)),
    });
    const cogs = v.items.filter((i) => !i.anulado).reduce((s, i) => s + n(i.costo), 0);
    if (cogs > 0) {
      out.push({
        id: 'costo:' + v.id,
        fecha: v.fecha,
        refTipo: 'costo',
        refId: v.id,
        concepto: 'Costo de lo vendido',
        cuentaDebe: CUENTAS.COSTO,
        cuentaHaber: CUENTAS.INVENTARIO,
        monto: m(cogs),
      });
    }
  }

  // 5) Gastos: salen de caja o se pagan por fuera (transferencia/bolsillo)
  for (const g of d.gastos) {
    if (n(g.monto) <= 0) continue;
    out.push({
      id: 'gasto:' + g.id,
      fecha: g.fecha,
      refTipo: 'gasto',
      refId: g.id,
      concepto: 'Gasto: ' + (g.concepto || g.categoria),
      cuentaDebe: CUENTAS.GASTOS,
      cuentaHaber: g.saleDeCaja === false ? CUENTAS.FUERA_CAJA : CUENTAS.CAJA,
      monto: m(n(g.monto)),
    });
  }

  // 6) Retiros: de capital o de ganancia
  for (const r of d.retiros) {
    if (n(r.monto) <= 0) continue;
    out.push({
      id: 'retiro:' + r.id,
      fecha: r.fecha,
      refTipo: 'retiro',
      refId: r.id,
      concepto: 'Retiro: ' + (r.concepto || 'sin concepto'),
      cuentaDebe: r.tipoRetiro === 'capital' ? CUENTAS.CAPITAL : CUENTAS.RETIROS_GANANCIA,
      cuentaHaber: CUENTAS.CAJA,
      monto: m(n(r.monto)),
    });
  }

  // 7) Movimientos de caja que NO son espejo de un gasto (ajustes de arqueo
  //    y movimientos manuales). Los gastos con saleDeCaja ya se contabilizaron
  //    en (5) y su movCaja es su espejo: identificarlos por movId.
  const movIdsDeGastos = new Set(d.gastos.map((g) => g.movId).filter(Boolean) as string[]);
  for (const mov of d.movCaja) {
    if (movIdsDeGastos.has(mov.id) || n(mov.monto) <= 0) continue;
    const ingreso = mov.tipo === 'ingreso';
    out.push({
      id: 'ajusteCaja:' + mov.id,
      fecha: mov.fecha,
      refTipo: 'ajusteCaja',
      refId: mov.id,
      concepto: 'Ajuste de caja: ' + (mov.concepto || 'sin concepto'),
      cuentaDebe: ingreso ? CUENTAS.CAJA : CUENTAS.AJUSTES_CAJA,
      cuentaHaber: ingreso ? CUENTAS.AJUSTES_CAJA : CUENTAS.CAJA,
      monto: m(n(mov.monto)),
    });
  }

  // 8) Ajustes de inventario: mermas (salida) y sobrantes (entrada).
  //    El sobrante crea un lote con compraId 'aj-<idAjuste>': se valora desde
  //    ese lote porque costoPerdida se guarda en 0 para las entradas.
  const lotesPorOrigen = new Map(d.lotes.filter((l) => l.compraId).map((l) => [l.compraId as string, l]));
  for (const a of d.ajustes) {
    if (n(a.cantidad) < 0 && n(a.costoPerdida) > 0) {
      out.push({
        id: 'merma:' + a.id,
        fecha: a.fecha,
        refTipo: 'merma',
        refId: a.id,
        concepto: 'Merma: ' + (a.motivo || a.productoNombre),
        cuentaDebe: CUENTAS.MERMAS,
        cuentaHaber: CUENTAS.INVENTARIO,
        monto: m(n(a.costoPerdida)),
      });
    } else if (n(a.cantidad) > 0) {
      const loteAj = lotesPorOrigen.get('aj-' + a.id);
      const valor = loteAj ? n(loteAj.cantidadInicial) * n(loteAj.costo) : 0;
      if (valor > 0) {
        out.push({
          id: 'sobrante:' + a.id,
          fecha: a.fecha,
          refTipo: 'sobrante',
          refId: a.id,
          concepto: 'Sobrante: ' + (a.motivo || a.productoNombre),
          cuentaDebe: CUENTAS.INVENTARIO,
          cuentaHaber: CUENTAS.SOBRANTES,
          monto: m(valor),
        });
      }
    }
  }

  return out.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
}

/** Fila de la balanza de comprobación (sumas y saldo por cuenta). */
export interface FilaBalanza {
  cuenta: string;
  debe: number;
  haber: number;
  saldo: number; // + = deudor (como Caja), - = acreedor (como Ingresos)
}

/** Balanza de comprobación: sumas de debe/haber y saldo por cuenta. */
export function balanzaDeComprobacion(asientos: Asiento[]): FilaBalanza[] {
  const map = new Map<string, FilaBalanza>();
  for (const a of asientos) {
    for (const [cuenta, esDebe] of [
      [a.cuentaDebe, true],
      [a.cuentaHaber, false],
    ] as [string, boolean][]) {
      let f = map.get(cuenta);
      if (!f) {
        f = { cuenta, debe: 0, haber: 0, saldo: 0 };
        map.set(cuenta, f);
      }
      if (esDebe) f.debe = m(f.debe + a.monto);
      else f.haber = m(f.haber + a.monto);
    }
  }
  const filas: FilaBalanza[] = [];
  map.forEach((f) => {
    filas.push({ cuenta: f.cuenta, debe: f.debe, haber: f.haber, saldo: m(f.debe - f.haber) });
  });
  return filas.sort((x, y) => x.cuenta.localeCompare(y.cuenta));
}

/** Total de cargos (debe). Debe ser idéntico al total de abonos (haber). */
export function sumaDebe(asientos: Asiento[]): number {
  return m(asientos.reduce((s, a) => s + a.monto, 0));
}

/** Regenera la tabla asientos en IndexedDB a partir del estado actual.
 * @returns número de asientos escritos */
export async function regenerarAsientos(): Promise<number> {
  const [ventas, compras, gastos, capital, retiros, movCaja, ajustes, lotes, cfgRow] = await Promise.all([
    db.ventas.toArray(),
    db.compras.toArray(),
    db.gastos.toArray(),
    db.capital.toArray(),
    db.retiros.toArray(),
    db.movCaja.toArray(),
    db.ajustes.toArray(),
    db.lotes.toArray(),
    db.config.get('cfg'),
  ]);

  const asientos = generarAsientos({
    capitalInicial: (cfgRow?.value as { capitalInicial?: number | string } | undefined)?.capitalInicial || 0,
    ventas,
    compras,
    gastos,
    capital,
    retiros,
    movCaja,
    ajustes,
    lotes,
  });

  await db.transaction('rw', db.asientos, async () => {
    await db.asientos.clear();
    if (asientos.length > 0) await db.asientos.bulkPut(asientos);
  });

  return asientos.length;
}
