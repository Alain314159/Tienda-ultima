import { defineStore } from 'pinia';
import { useUtilitiesStore } from './utilitiesStore.js';
import { db } from '../db.js';

export const useCalculosStore = defineStore('calculos', () => {
  const utils = useUtilitiesStore();

  /**
   * Calcula la ganancia de un item de venta
   * ganancia = ingreso - costo
   */
  const gananciaItem = (item) => {
    const ingreso = utils.multiplicar(utils.n(item.precio), utils.n(item.cant));
    const costoTotal = utils.multiplicar(utils.n(item.costoUnitario), utils.n(item.cant));
    return utils.redondear(ingreso - costoTotal);
  };

  /**
   * Calcula la ganancia total de una venta
   */
  const gananciaVenta = (venta) => {
    const items = venta.items || [];
    return utils.sumar(...items.map(it => gananciaItem(it)));
  };

  /**
   * Calcula el costo usando FIFO para un item
   * Busca lotes en orden FIFO hasta completar la cantidad
   */
  const costoFIFO = (productoId, cantidad) => {
    const lotes = db.lotes
      .filter((l) => l.productoId === productoId)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    let cantRemante = utils.n(cantidad);
    let costoTotal = 0;

    for (const lote of lotes) {
      if (cantRemante <= 0) break;

      const disponible = utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida);
      const usados = Math.min(disponible, cantRemante);
      costoTotal += usados * utils.n(lote.costo);
      cantRemante -= usados;
    }

    return utils.redondear(costoTotal);
  };

  /**
   * Calcula el costo unitario promedio de un producto
   */
  const costoUnitarioPromedio = (productoId) => {
    const lotes = db.lotes.filter((l) => l.productoId === productoId);
    const costoTotal = utils.sumar(...lotes.map((l) => utils.multiplicar(utils.n(l.cantidadInicial), utils.n(l.costo))));
    const cantTotal = utils.sumar(...lotes.map((l) => utils.n(l.cantidadInicial)));
    return utils.dividir(costoTotal, cantTotal);
  };

  /**
   * Calcula COGS (Costo de lo vendido) para un período
   */
  const cogsPerido = (ventas) => {
    return utils.sumar(
      ...ventas
        .filter((v) => !v.anulada)
        .map((v) => {
          return utils.sumar(
            ...v.items.map((it) => utils.multiplicar(utils.n(it.cantidad), utils.n(it.costoUnitario)))
          );
        })
    );
  };

  /**
   * Calcula ganancia bruta (ingresos - COGS)
   */
  const gananciaBruta = (ingresos, cogs) => {
    return utils.redondear(utils.n(ingresos) - utils.n(cogs));
  };

  /**
   * Calcula margen bruto %
   */
  const margenBruto = (gananciaBruta, ingresos) => {
    if (utils.n(ingresos) === 0) return 0;
    return utils.redondear((utils.n(gananciaBruta) / utils.n(ingresos)) * 100);
  };

  /**
   * Calcula ganancia neta después de gastos y mermas
   */
  const gananciaNeta = (gananciaBruta, gastos = 0, mermas = 0) => {
    return utils.redondear(utils.n(gananciaBruta) - utils.n(gastos) - utils.n(mermas));
  };

  /**
   * Calcula margen neto %
   */
  const margenNeto = (gananciaNeta, ingresos) => {
    if (utils.n(ingresos) === 0) return 0;
    return utils.redondear((utils.n(gananciaNeta) / utils.n(ingresos)) * 100);
  };

  /**
   * Calcula el vuelto de una venta
   */
  const calcularVuelto = (totalVenta, pagoCon) => {
    return utils.redondear(utils.n(pagoCon) - utils.n(totalVenta));
  };

  /**
   * Calcula valor total del inventario
   */
  const valorInventario = (lotes) => {
    return utils.sumar(
      ...lotes.map((l) => {
        const disponible = utils.n(l.cantidadInicial) - utils.n(l.cantidadVendida);
        return utils.multiplicar(disponible, utils.n(l.costo));
      })
    );
  };

  /**
   * Calcula porcentaje de pérdida por mermas
   */
  const porcentajeMermas = (totalCompras, costoPerdidas) => {
    if (utils.n(totalCompras) === 0) return 0;
    return utils.redondear((utils.n(costoPerdidas) / utils.n(totalCompras)) * 100);
  };

  return {
    gananciaItem,
    gananciaVenta,
    costoFIFO,
    costoUnitarioPromedio,
    cogsPerido,
    gananciaBruta,
    margenBruto,
    gananciaNeta,
    margenNeto,
    calcularVuelto,
    valorInventario,
    porcentajeMermas,
  };
});
