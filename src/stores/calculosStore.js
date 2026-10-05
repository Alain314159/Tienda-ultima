import { defineStore } from 'pinia';
import { useUtilitiesStore } from './utilitiesStore.js';
import { db } from '../db.js';

export const useCalculosStore = defineStore('calculos', () => {
  const utils = useUtilitiesStore();

  const gananciaItem = (item) => {
    const ingreso = utils.multiplicar(utils.n(item.precio), utils.n(item.cant));
    const costoTotal = utils.multiplicar(utils.n(item.costoUnitario), utils.n(item.cant));
    return utils.redondear(ingreso - costoTotal);
  };

  const gananciaVenta = (venta) => {
    const items = Array.isArray(venta?.items) ? venta.items : [];
    return utils.sumar(...items.map((it) => gananciaItem(it)));
  };

  const costoFIFO = async (productoId, cantidad) => {
    const lotes = await db.lotes.where('productoId').equals(productoId).sortBy('fecha');

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

  const costoUnitarioPromedio = async (productoId) => {
    const lotes = await db.lotes.where('productoId').equals(productoId).toArray();
    const costoTotal = lotes.reduce((acc, lote) => acc + utils.n(lote.costo) * utils.n(lote.cantidadInicial), 0);
    const cantTotal = lotes.reduce((acc, lote) => acc + utils.n(lote.cantidadInicial), 0);
    return cantTotal === 0 ? 0 : utils.redondear(costoTotal / cantTotal);
  };

  const cogsPerido = (ventas) => {
    return utils.sumar(
      ...ventas
        .filter((v) => !v.anulada)
        .map((v) => utils.sumar(...(v.items || []).map((it) => utils.multiplicar(utils.n(it.cantidad), utils.n(it.costoUnitario)))))
    );
  };

  const gananciaBruta = (ingresos, cogs) => utils.redondear(utils.n(ingresos) - utils.n(cogs));

  const margenBruto = (ingresos, ganancia) => {
    if (utils.n(ingresos) === 0) return 0;
    return utils.redondear((utils.n(ganancia) / utils.n(ingresos)) * 100);
  };

  const gananciaNeta = (gananciaBruta, gastos = 0, mermas = 0) => {
    return utils.redondear(utils.n(gananciaBruta) - utils.n(gastos) - utils.n(mermas));
  };

  const margenNeto = (ingresos, ganancia) => {
    if (utils.n(ingresos) === 0) return 0;
    return utils.redondear((utils.n(ganancia) / utils.n(ingresos)) * 100);
  };

  const calcularVuelto = (totalVenta, pagoCon) => utils.redondear(utils.n(pagoCon) - utils.n(totalVenta));

  const valorInventario = (lotes) => {
    return utils.sumar(
      ...lotes.map((l) => {
        const disponible = utils.n(l.cantidadInicial) - utils.n(l.cantidadVendida);
        return utils.multiplicar(disponible, utils.n(l.costo));
      })
    );
  };

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
