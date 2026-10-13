/**
 * Servicio FIFO - Cálculo de costo por lote
 * Fuente única de verdad para todos los cálculos FIFO
 */
import { n, m, q } from '../utils/numero';
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

export default { calcFIFO, gananciaItem };
