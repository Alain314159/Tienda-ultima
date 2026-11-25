/**
 * Servicio FIFO - Cálculo de costo por lote
 * Fuente única de verdad para todos los cálculos FIFO
 */
import { n, m, q } from '../utils/numero';
import { clean } from '../utils/id';
import { db } from '../db';
import type { Lote, LoteUsado, ItemCarrito } from '../types';

export interface ResultadoFIFO {
  costoTotal: number;
  costoUnitario: number;
  lotesUsados: LoteUsado[];
  error: string | null;
}

/**
 * Calcula el costo FIFO para una cantidad de producto.
 */
export function calcFIFO(productoId: string, cantidad: number, lotes: Lote[]): ResultadoFIFO {
  // Filtrar lotes del producto con stock disponible
  const lotesDisponibles = lotes
    .filter((l) => l.productoId === productoId && n(l.cantidadInicial) - n(l.cantidadVendida) > 0)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime() || (a.id < b.id ? -1 : 1));

  if (lotesDisponibles.length === 0) {
    return { costoTotal: 0, costoUnitario: 0, lotesUsados: [], error: 'No hay lotes disponibles' };
  }

  let cantidadRestante = n(cantidad);
  let costoTotal = 0;
  const lotesUsados: LoteUsado[] = [];

  for (const lote of lotesDisponibles) {
    if (cantidadRestante <= 0) break;

    const stockDisponible = q(n(lote.cantidadInicial) - n(lote.cantidadVendida));
    const cantidadATomar = Math.min(stockDisponible, cantidadRestante);

    if (cantidadATomar > 0) {
      const costoLote = n(lote.costo) * cantidadATomar;
      costoTotal = m(costoTotal + costoLote);

      lotesUsados.push({
        loteId: lote.id,
        cantidad: cantidadATomar,
        costo: n(lote.costo),
      });

      cantidadRestante = q(cantidadRestante - cantidadATomar);
    }
  }

  if (cantidadRestante > 0) {
    return { costoTotal: 0, costoUnitario: 0, lotesUsados: [], error: 'Stock insuficiente' };
  }

  const costoUnitario = costoTotal / n(cantidad);

  return {
    costoTotal: m(costoTotal),
    costoUnitario: m(costoUnitario),
    lotesUsados,
    error: null,
  };
}

/**
 * Calcula la ganancia para un item del carrito.
 */
export function gananciaItem(item: ItemCarrito, lotes: Lote[]): number {
  const f = calcFIFO(item.productoId, n(item.cant), lotes);
  if (f.error) return 0;
  return m(n(item.precio) * n(item.cant) - f.costoTotal);
}

/**
 * Aplica consumo/restauración de lotes contra la BD leyendo el estado FRESCO
 * dentro de la transacción Dexie en curso.
 *
 * ¿Por qué no leer del store reactivo? El store es una caché por pestaña:
 * con la app abierta en dos pestañas (o entre el cálculo FIFO y la
 * transacción), el estado quedaba obsoleto y el bulkPut del objeto entero
 * PISABA la escritura de la otra pestaña (last-writer-wins): stock corrupto
 * en silencio. Leyendo de la BD dentro de la transacción:
 *  - las transacciones concurrentes de conexiones distintas se serializan;
 *  - la validación de sobreventa aborta la transacción completa (rollback).
 *
 * No muta objetos reactivos: la UI se refresca con el cargarLotes/recargarStores
 * que ya corre tras cada transacción (y en el catch si falla).
 *
 * @param usos   lotes a tocar (los deltas se acumulan por loteId)
 * @param signo  +1 consume (venta / merma) | -1 restaura (anulación)
 */
export async function aplicarLotesEnBD(usos: LoteUsado[], signo: 1 | -1): Promise<void> {
  const delta: Record<string, number> = {};
  for (const u of usos) delta[u.loteId] = (delta[u.loteId] || 0) + signo * n(u.cantidad);

  const ids = Object.keys(delta);
  if (ids.length === 0) return;
  const actuales: (Lote | undefined)[] = await db.lotes.bulkGet(ids);

  const cambios: Lote[] = [];
  for (let i = 0; i < ids.length; i++) {
    const l = actuales[i];
    if (!l) continue; // lote borrado: nada que tocar (defensa contra datos huérfanos)
    let nueva = q(n(l.cantidadVendida) + delta[ids[i]]);
    if (signo > 0 && nueva > n(l.cantidadInicial) + 1e-9) {
      throw new Error(
        'El stock de "' +
          (l.productoNombre || 'un producto') +
          '" cambió mientras se procesaba la operación. Revisa la existencia e inténtalo de nuevo.'
      );
    }
    if (nueva < 0) nueva = 0; // una restauración jamás deja el lote negativo
    cambios.push({ ...l, cantidadVendida: nueva });
  }
  if (cambios.length > 0) await db.lotes.bulkPut(cambios.map((l) => clean(l)));
}

export default { calcFIFO, gananciaItem, aplicarLotesEnBD };
