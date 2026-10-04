/**
 * Servicio FIFO - Cálculo de costo por lote
 * Fuente única de verdad para todos los cálculos FIFO
 */
import { n, m, q } from '../db';

/**
 * Calcula el costo FIFO para una cantidad de producto
 * @param {string} productoId - ID del producto
 * @param {number} cantidad - Cantidad a vender
 * @param {Array} lotes - Array de lotes del producto (ya filtrados por productoId)
 * @returns {Object} { costoTotal, costoUnitario, lotesUsados, error }
 */
export function calcFIFO(productoId, cantidad, lotes) {
  // Filtrar lotes del producto con stock disponible
  const lotesDisponibles = lotes
    .filter(l => l.productoId === productoId && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
  
  if (lotesDisponibles.length === 0) {
    return { costoTotal: 0, costoUnitario: 0, lotesUsados: [], error: 'No hay lotes disponibles' };
  }
  
  let cantidadRestante = n(cantidad);
  let costoTotal = 0;
  const lotesUsados = [];
  
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
        costoUnitario: n(lote.costo)
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
    error: null 
  };
}

/**
 * Calcula la ganancia para un item del carrito
 * @param {Object} item - Item del carrito { productoId, precio, cant }
 * @param {Array} lotes - Todos los lotes
 * @returns {number} Ganancia del item
 */
export function gananciaItem(item, lotes) {
  const f = calcFIFO(item.productoId, n(item.cant), lotes);
  if (f.error) return 0;
  return m((n(item.precio) * n(item.cant)) - f.costoTotal);
}

export default { calcFIFO, gananciaItem };
