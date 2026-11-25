/**
 * Composable de cuadre por período: estado del formulario de
 * fechas, generación del cuadre (ventas/compras/stock por producto
 * y lote) y exportación a PDF.
 */
import { ref, reactive } from 'vue';
import { n, m, q } from '../utils/numero';
import { hoyLocal, diaLocal, fechaLocal } from '../utils/fecha';
import type { Cierre, ResultadoCuadre, SubfilaCuadre } from '../types';
import { useConfigStore } from '../stores/useConfigStore';
import { useVentasStore } from '../stores/useVentasStore';
import { useComprasStore } from '../stores/useComprasStore';
import { useAjustesStore } from '../stores/useAjustesStore';
import { useGastosStore } from '../stores/useGastosStore';
import { useLotesStore } from '../stores/useLotesStore';
import { useProductosStore } from '../stores/useProductosStore';
import { useCajaStore } from '../stores/useCajaStore';
import { useCapitalStore } from '../stores/useCapitalStore';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { generarPDFCuadre as exportarPDF } from '../services/pdf';

export function useCuadre() {
  const configStore = useConfigStore();
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const ajustesStore = useAjustesStore();
  const gastosStore = useGastosStore();
  const lotesStore = useLotesStore();
  const productosStore = useProductosStore();
  const cajaStore = useCajaStore();
  const capitalStore = useCapitalStore();

  const rep = reactive<{
    fechaInicio: string;
    fechaFin: string;
    isoInicio: string | null;
    isoFin: string | null;
    resultado: ResultadoCuadre | null;
    periodoActivo: string | null;
  }>({
    // hoyLocal(): toISOString() da la fecha UTC ("mañana" por la noche en Cuba)
    fechaInicio: hoyLocal(),
    fechaFin: hoyLocal(),
    isoInicio: null,
    isoFin: null,
    resultado: null,
    periodoActivo: null,
  });
  const cuadreExpandido = ref<Record<string, boolean>>({});

  // ===== SELECTORE DE PERIODO =====
  function setSemana() {
    const ini = new Date();
    ini.setDate(ini.getDate() - 7);
    ini.setHours(0, 0, 0, 0); // medianoche LOCAL: la mañana del primer día cuenta
    // Solo fecha: el parse local de generarReporte hace el resto (día completo)
    rep.fechaInicio = fechaLocal(ini);
    rep.fechaFin = hoyLocal();
    rep.isoInicio = null;
    rep.isoFin = null;
    rep.periodoActivo = 'semana';
  }

  function setMesAnterior() {
    const now = new Date();
    const ini = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fin = new Date(now.getFullYear(), now.getMonth(), 0);
    rep.fechaInicio = fechaLocal(ini);
    rep.fechaFin = fechaLocal(fin);
    rep.isoInicio = null;
    rep.isoFin = null;
    rep.periodoActivo = 'mes-ant';
  }

  function setAnio() {
    const now = new Date();
    const ini = new Date(now.getFullYear(), 0, 1);
    rep.fechaInicio = fechaLocal(ini);
    rep.fechaFin = hoyLocal();
    rep.isoInicio = null;
    rep.isoFin = null;
    rep.periodoActivo = 'anio';
  }

  function setHoy() {
    rep.fechaInicio = rep.fechaFin = hoyLocal();
    rep.isoInicio = null;
    rep.isoFin = null;
    rep.periodoActivo = 'hoy';
  }

  function setPeriodoCierre(c: Cierre) {
    const ini = new Date(c.periodoInicio || c.fechaCierre || '');
    const fin = new Date(c.periodoFin || c.fechaCierre || '');
    rep.fechaInicio = fechaLocal(ini);
    rep.fechaFin = fechaLocal(fin);
    rep.isoInicio = ini.toISOString();
    rep.isoFin = fin.toISOString();
    rep.periodoActivo = c.id;
  }

  function setMesActual() {
    const now = new Date();
    const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
    rep.fechaInicio = fechaLocal(inicio);
    rep.fechaFin = hoyLocal();
    rep.isoInicio = null;
    rep.isoFin = null;
    rep.periodoActivo = 'mes';
  }

  function setPeriodoActual() {
    // Momento EXACTO del período (contrato del ciclo 9); el display en fecha
    // local del mismo momento (split('T') daría la fecha UTC)
    const ini = new Date(configStore.cfg.periodoInicio);
    rep.fechaInicio = fechaLocal(ini);
    rep.fechaFin = hoyLocal();
    rep.isoInicio = configStore.cfg.periodoInicio;
    rep.isoFin = new Date().toISOString();
    rep.periodoActivo = 'actual';
  }

  function toggleCuadreProducto(id: string) {
    cuadreExpandido.value[id] = !cuadreExpandido.value[id];
  }

  // ===== GENERACIÓN DEL CUADRE =====
  function generarReporte() {
    if (!rep.fechaInicio || !rep.fechaFin) return toastMsg('Selecciona fechas', TOAST.BAD);
    // isoInicio/isoFin (período actual, períodos de cierre) son momentos EXACTOS
    // (contrato del ciclo 9). Las fechas del input se parsean como días LOCALES:
    // new Date('YYYY-MM-DD') es medianoche UTC y en Cuba desplazaba el rango
    // 4-5 horas (el último día quedaba entero fuera del cuadre).
    const i = rep.isoInicio ? new Date(rep.isoInicio) : diaLocal(rep.fechaInicio);
    const f = rep.isoFin ? new Date(rep.isoFin) : diaLocal(rep.fechaFin, true);
    if (i > f) return toastMsg('Fecha inicio > fin', TOAST.BAD);

    const vp = ventasStore.ventas.filter((v) => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
    // Las compras anuladas revierten su lote: no deben contar como compras del período
    const cp = comprasStore.compras.filter((c) => !c.anulada && new Date(c.fecha) >= i && new Date(c.fecha) <= f);
    const gp = ajustesStore.ajustes.filter((a) => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

    const gastosTotal = m(
      gastosStore.gastos
        .filter((g) => new Date(g.fecha) >= i && new Date(g.fecha) <= f)
        .reduce((s, g) => s + n(g.monto), 0)
    );

    const ing = m(vp.reduce((s, v) => s + n(v.total), 0));
    // Los ítems anulados se revierten en los lotes: el COGS real excluye su costo
    // (mismo criterio que el libro diario, que también filtra it.anulado)
    const cogs = m(vp.reduce((s, v) => s + v.items.reduce((ss, it) => ss + (it.anulado ? 0 : n(it.costo)), 0), 0));
    const bruta = m(ing - cogs);
    const mermas = m(gp.reduce((s, a) => s + n(a.costoPerdida), 0));
    const neta = m(bruta - mermas - gastosTotal);

    // Agrupar ventas por (producto, costo, precio)
    const ventasPorClave: Record<
      string,
      { productoId: string; costo: number; precio: number; cantVend: number; ingresos: number; costoTotal: number }
    > = {};
    vp.forEach((v) => {
      v.items.forEach((it) => {
        if (it.anulado) return; // ítem anulado: ni cantidad ni ingreso ni costo
        if (!it.lotesUsados) return;
        it.lotesUsados.forEach((u) => {
          const costo = n(u.costo);
          const precio = n(it.precio);
          const key = it.productoId + '|' + costo + '|' + precio;
          if (!ventasPorClave[key])
            ventasPorClave[key] = {
              productoId: it.productoId,
              costo,
              precio,
              cantVend: 0,
              ingresos: 0,
              costoTotal: 0,
            };
          ventasPorClave[key].cantVend += n(u.cantidad);
          ventasPorClave[key].ingresos += n(it.precio) * n(u.cantidad);
          ventasPorClave[key].costoTotal += n(u.costo) * n(u.cantidad);
        });
      });
    });

    // Compras por (producto, costo)
    const comprasPorProdCosto: Record<string, { cant: number; total: number }> = {};
    cp.forEach((c) => {
      const key = c.productoId + '|' + n(c.costo);
      if (!comprasPorProdCosto[key]) comprasPorProdCosto[key] = { cant: 0, total: 0 };
      comprasPorProdCosto[key].cant += n(c.cantidad);
      comprasPorProdCosto[key].total += n(c.total);
    });

    // Stock actual por (producto, costo)
    const stockPorProdCosto: Record<string, number> = {};
    lotesStore.lotes.forEach((l) => {
      const key = l.productoId + '|' + n(l.costo);
      const disp = n(l.cantidadInicial) - n(l.cantidadVendida);
      if (!stockPorProdCosto[key]) stockPorProdCosto[key] = 0;
      stockPorProdCosto[key] += disp;
    });

    const cuadre = productosStore.productos
      .filter((p) => !p.archivado || productosStore.stock(p.id) > 0)
      .map((p) => {
        const prodId = p.id;
        const claves = new Set<string>();
        Object.keys(ventasPorClave).forEach((k) => {
          if (ventasPorClave[k].productoId === prodId)
            claves.add(ventasPorClave[k].costo + '|' + ventasPorClave[k].precio);
        });
        Object.keys(stockPorProdCosto).forEach((k) => {
          if (!k.startsWith(prodId + '|')) return;
          const costo = n(k.split('|')[1]);
          const stock = stockPorProdCosto[k];
          let tieneFila = false;
          claves.forEach((ck) => {
            if (n(ck.split('|')[0]) === costo) tieneFila = true;
          });
          if (!tieneFila && stock > 0) claves.add(costo + '|stock');
        });

        const subfilas: SubfilaCuadre[] = [];
        claves.forEach((ck) => {
          const partes = ck.split('|');
          const costo = n(partes[0]);
          const precio = partes[1] === 'stock' ? null : n(partes[1]);
          const v = ventasPorClave[prodId + '|' + costo + '|' + precio] || { cantVend: 0, ingresos: 0, costoTotal: 0 };
          const c = comprasPorProdCosto[prodId + '|' + costo] || { cant: 0, total: 0 };
          const stock = stockPorProdCosto[prodId + '|' + costo] || 0;
          subfilas.push({
            costo,
            precio,
            comprasCant: m(c.cant),
            cantVend: m(v.cantVend),
            ingresos: m(v.ingresos),
            costoVend: m(v.costoTotal),
            ganancia: m(v.ingresos - v.costoTotal),
            stockActual: q(stock),
            valorActual: m(stock * costo),
          });
        });
        subfilas.sort((a, b) => {
          if (a.costo !== b.costo) return a.costo - b.costo;
          if (a.precio === null && b.precio !== null) return 1;
          if (a.precio !== null && b.precio === null) return -1;
          return (a.precio || 0) - (b.precio || 0);
        });

        const comprasProdCant = m(
          Object.keys(comprasPorProdCosto)
            .filter((k) => k.startsWith(prodId + '|'))
            .reduce((s, k) => s + comprasPorProdCosto[k].cant, 0)
        );
        const comprasProdTotal = m(
          Object.keys(comprasPorProdCosto)
            .filter((k) => k.startsWith(prodId + '|'))
            .reduce((s, k) => s + comprasPorProdCosto[k].total, 0)
        );
        const ventasProdCant = m(subfilas.reduce((s, x) => s + x.cantVend, 0));
        const ingresosProd = m(subfilas.reduce((s, x) => s + x.ingresos, 0));
        const costoProdVend = m(subfilas.reduce((s, x) => s + x.costoVend, 0));
        const stockProd = q(subfilas.reduce((s, x) => s + x.stockActual, 0));
        const valorProd = m(subfilas.reduce((s, x) => s + x.valorActual, 0));

        return {
          id: p.id,
          nombre: p.nombre,
          compras: comprasProdCant,
          costoCompra: comprasProdCant > 0 ? m(comprasProdTotal / comprasProdCant) : 0,
          ventas: ventasProdCant,
          precioVenta: ventasProdCant > 0 ? m(ingresosProd / ventasProdCant) : 0,
          ingresos: ingresosProd,
          costo: costoProdVend,
          ganancia: m(ingresosProd - costoProdVend),
          stockFinal: stockProd,
          valorInv: valorProd,
          subfilas,
        };
      });

    const totales = cuadre.reduce(
      (acc, r) => {
        acc.compras += r.compras;
        acc.ventas += r.ventas;
        acc.ingresos += r.ingresos;
        acc.costo += r.costo;
        acc.ganancia += r.ganancia;
        acc.stockFinal += r.stockFinal;
        acc.valorInv += r.valorInv;
        return acc;
      },
      { compras: 0, ventas: 0, ingresos: 0, costo: 0, ganancia: 0, stockFinal: 0, valorInv: 0 }
    );
    Object.keys(totales).forEach((k) => {
      const key = k as keyof typeof totales;
      totales[key] = m(totales[key]);
    });

    rep.resultado = {
      ingresos: ing,
      cogs,
      bruta,
      mermas,
      gastos: gastosTotal,
      neta,
      numVentas: vp.length,
      margenB: ing > 0 ? ((bruta / ing) * 100).toFixed(2) : '0.00',
      margenN: ing > 0 ? ((neta / ing) * 100).toFixed(2) : '0.00',
      cuadre,
      totales,
      _fechaI: rep.fechaInicio,
      _fechaF: rep.fechaFin,
    };
  }

  async function generarPDFCuadre() {
    if (!rep.resultado) return;
    const destino = await exportarPDF(rep.resultado, {
      nombreTienda: configStore.cfg.nombre || 'Tienda Pro',
      saldoCaja: cajaStore.saldoCaja,
      valorInventario: lotesStore.valorInventario,
      capitalTotal: capitalStore.capitalTotal,
      gananciasAcumuladas: capitalStore.gananciasAcumuladas,
      gananciaDisponible: capitalStore.gananciaDisponible,
      // Patrimonio neto contable: capital + ganancias - retiros (neto de lo retirado)
      patrimonioTotal: capitalStore.capitalTotal + capitalStore.gananciasAcumuladas - capitalStore.retirosTotal,
      retirosAcumulados: capitalStore.retirosTotal,
      // Gastos pagados con dinero fuera del cajón (transferencia, bolsillo):
      // explica la diferencia entre activos (caja + inventario) y patrimonio neto
      gastosFueraCaja: m(gastosStore.gastos.filter((g) => g.saleDeCaja === false).reduce((s, g) => s + n(g.monto), 0)),
      socios: capitalStore.socios.filter((s) => s.activo !== false),
    });
    // En nativo el PDF se escribe en Documentos/ (la descarga blob del
    // WebView no funciona); en web el navegador lo descarga.
    toastMsg(destino ? 'PDF guardado en ' + destino : 'PDF generado');
  }

  return {
    rep,
    cuadreExpandido,
    setSemana,
    setMesAnterior,
    setAnio,
    setHoy,
    setPeriodoCierre,
    setMesActual,
    setPeriodoActual,
    toggleCuadreProducto,
    generarReporte,
    generarPDFCuadre,
  };
}
