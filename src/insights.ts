// Motor de Recomendaciones para Tienda Pro
// Incluye: alertas de negocio + info + contexto temporal.
// Sin detecciones de tendencia por producto ni predicciones.

import type { Ajuste, Compra, Config, Cierre, Gasto, Lote, MovCaja, Producto, Recomendacion, Venta } from './types';
import { fechaMs } from './utils/fecha';
import { stockMinEfectivo } from './utils/numero';

/** Estado que inyecta useInsightsStore al motor de recomendaciones. */
export interface InsightsState {
  ventas: Venta[];
  compras: Compra[];
  gastos: Gasto[];
  ajustes: Ajuste[];
  productos: Producto[];
  lotes: Lote[];
  cierres: Cierre[];
  movCaja: MovCaja[];
  saldoCaja: number;
  cfg: Config;
  formatMoney: (n: number) => string;
  formatNum: (n: number) => string;
  stockDe: (pid: string) => number;
}

/** Datos que necesita el contexto temporal (ya agregados: no re-filtra ventas). */
interface ContextoData {
  ventasHoy: number;
  totalHoy: number;
  totalMes: number;
  diasSinCierre: number;
  formatMoney: (n: number) => string;
}

export function generarRecomendaciones(state: InsightsState): Recomendacion[] {
  const out: Recomendacion[] = [];
  const {
    ventas,
    compras,
    gastos,
    ajustes,
    productos,
    lotes,
    cierres,
    movCaja,
    saldoCaja,
    cfg,
    formatMoney,
    formatNum,
    stockDe,
  } = state;

  const ahora = new Date();
  const hace30d = new Date(ahora.getTime() - 30 * 86400000);
  const hace90d = new Date(ahora.getTime() - 90 * 86400000);
  const umbralSinMov = new Date(ahora.getTime() - Number(cfg.umbralSinMovimientoDias || 60) * 86400000);

  const mesActual = { i: new Date(ahora.getFullYear(), ahora.getMonth(), 1), f: ahora };
  const mesAnterior = {
    i: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1),
    f: new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59),
  };

  // Índices pre-parseados (4.2/4.3): antes cada filtro hacía
  // `new Date(v.fecha)` por registro — una venta se parseaba ~15 veces
  // por ejecución — y `productos.find()` corría dentro de bucles.
  // Ahora cada fecha se parsea UNA vez y los productos van por Map.
  const hace30dMs = hace30d.getTime();
  const hace90dMs = hace90d.getTime();
  const umbralSinMovMs = umbralSinMov.getTime();
  const mesActualIMs = mesActual.i.getTime();
  const mesAnteriorIMs = mesAnterior.i.getTime();
  const mesAnteriorFMs = mesAnterior.f.getTime();
  const ventasConTs = ventas.map((v) => ({ v, ts: fechaMs(v.fecha) }));
  const ventasActivas = ventasConTs.filter((x) => !x.v.anulada);
  const productosPorId = new Map(productos.map((p) => [p.id, p]));
  const comprasPorProducto = new Map<string, { c: Compra; ts: number }[]>();
  for (const c of compras) {
    if (c.anulada) continue;
    const arr = comprasPorProducto.get(c.productoId) || [];
    arr.push({ c, ts: fechaMs(c.fecha) });
    comprasPorProducto.set(c.productoId, arr);
  }
  // Ordenadas por fecha descendente (el mismo criterio del sort anterior).
  for (const arr of comprasPorProducto.values()) arr.sort((a, b) => b.ts - a.ts);
  const movCajaConTs = movCaja.map((mv) => ({ mv, ts: fechaMs(mv.fecha) }));
  const lotesPorProducto = new Map<string, { l: Lote; ts: number }[]>();
  for (const l of lotes || []) {
    const arr = lotesPorProducto.get(l.productoId) || [];
    arr.push({ l, ts: fechaMs(l.fecha) });
    lotesPorProducto.set(l.productoId, arr);
  }
  // Días con venta y ventas de hoy, en una sola pasada (racha + contexto).
  const diasConVenta = new Set<string>();
  const hoyKey = ahora.toDateString();
  let ventasHoy = 0;
  let totalHoy = 0;
  for (const { v, ts } of ventasActivas) {
    const key = new Date(ts).toDateString();
    diasConVenta.add(key);
    if (key === hoyKey) {
      ventasHoy++;
      totalHoy += Number(v.total || 0);
    }
  }

  const ventasMes = ventasActivas.filter((x) => x.ts >= mesActualIMs).map((x) => x.v);
  const ventasMesAnt = ventasActivas
    .filter((x) => x.ts >= mesAnteriorIMs && x.ts <= mesAnteriorFMs)
    .map((x) => x.v);
  const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
  const totalMesAnt = ventasMesAnt.reduce((s, v) => s + (v.total || 0), 0);

  // INSIGHTS_SEMANAL_V1 - Calculos semanales
  const semanaActual = { i: new Date(ahora), f: new Date(ahora) };
  semanaActual.i.setDate(ahora.getDate() - 6);
  semanaActual.i.setHours(0, 0, 0, 0);
  const semanaAnterior = { i: new Date(semanaActual.i), f: new Date(semanaActual.i) };
  semanaAnterior.f.setMilliseconds(-1);
  semanaAnterior.i.setDate(semanaAnterior.f.getDate() - 6);
  semanaAnterior.i.setHours(0, 0, 0, 0);

  const ventasSemana = ventasActivas.filter((x) => x.ts >= semanaActual.i.getTime()).map((x) => x.v);
  const ventasSemanaAnt = ventasActivas
    .filter((x) => x.ts >= semanaAnterior.i.getTime() && x.ts <= semanaAnterior.f.getTime())
    .map((x) => x.v);
  const totalSemana = ventasSemana.reduce((s, v) => s + (v.total || 0), 0);
  const totalSemanaAnt = ventasSemanaAnt.reduce((s, v) => s + (v.total || 0), 0);
  const gananciaSemana = ventasSemana.reduce((s, v) => s + (v.ganancia || 0), 0);

  const push = (r: Recomendacion) => {
    out.push(r);
  };

  // ============================================================
  // ============ URGENTES (peso 80-100) ========================
  // ============================================================

  if (saldoCaja < -0.01) {
    push({
      nivel: 'urgente',
      peso: saldoCaja < -1000 ? 95 : 85,
      icono: 'wallet',
      titulo: 'Caja en negativo: ' + formatMoney(saldoCaja),
      detalle: 'Revisa los ultimos movimientos y arqueos',
      sec: 'dashboard',
      clave: 'caja-negativa',
    });
  }

  productos
    .filter((p) => !p.archivado && stockDe(p.id) < -0.001)
    .forEach((p) => {
      push({
        nivel: 'urgente',
        peso: 90,
        icono: 'package',
        titulo: p.nombre + ': stock negativo',
        detalle: 'Hay ' + formatNum(stockDe(p.id)) + ' unidades. Revisa ventas o ajusta',
        sec: 'productos',
        refId: p.id,
        clave: 'stock-neg-' + p.id,
      });
    });

  const ventasBajoCosto = ventasActivas
    .filter((x) => x.ts >= hace30dMs)
    .flatMap(({ v }) =>
      v.items.filter((it) => !it.anulado && Number(it.ganancia) < -0.01).map((it) => ({ venta: v, item: it }))
    );
  if (ventasBajoCosto.length > 0) {
    const perdida = ventasBajoCosto.reduce((s, x) => s + Number(x.item.ganancia), 0);
    push({
      nivel: 'urgente',
      peso: 88,
      icono: 'trend',
      titulo: ventasBajoCosto.length + ' venta(s) bajo costo',
      detalle: 'Perdiste ' + formatMoney(perdida) + ' vendiendo bajo el costo',
      sec: 'ventas',
      clave: 'ventas-bajo-costo-' + ventasBajoCosto.length,
    });
  }

  // ============================================================
  // ============ ATENCION (peso 50-79) =========================
  // ============================================================

  const fechasCierre = cierres.map((c) => c.fechaCierre || c.fecha || '').filter(Boolean);
  const ultimoCierre =
    fechasCierre.length > 0
      ? Math.max(...fechasCierre.map((f) => fechaMs(f)))
      : fechaMs(cfg.periodoInicio);
  const diasSinCierre = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
  if (diasSinCierre >= Number(cfg.umbralDiasCierre || 30)) {
    push({
      nivel: 'atencion',
      peso: 70,
      icono: 'calendar',
      titulo: 'Cierre pendiente',
      detalle: diasSinCierre + ' dias sin cerrar el periodo',
      sec: 'reportes',
      clave: 'cierre-pendiente',
    });
  }

  const mermasMes = ajustes
    .filter((a) => a.cantidad < 0 && fechaMs(a.fecha) >= mesActualIMs)
    .reduce((s, a) => s + Number(a.costoPerdida || 0), 0);
  if (mermasMes > 0 && totalMes > 0) {
    const pct = (mermasMes / totalMes) * 100;
    if (pct > 5) {
      push({
        nivel: 'atencion',
        peso: 65,
        icono: 'alert',
        titulo: 'Mermas altas: ' + formatMoney(mermasMes),
        detalle: pct.toFixed(1) + '% de las ventas del mes',
        sec: 'inventario',
        clave: 'mermas-altas',
      });
    }
  }

  const faltantes30 = movCajaConTs
    .filter((x) => x.mv.concepto && x.mv.concepto.includes('Faltante') && x.ts >= hace30dMs)
    .map((x) => x.mv);
  if (faltantes30.length >= Number(cfg.umbralFaltantesMes || 3)) {
    const total = faltantes30.reduce((s, f) => s + Number(f.monto || 0), 0);
    push({
      nivel: 'atencion',
      peso: 62,
      icono: 'wallet',
      titulo: faltantes30.length + ' faltantes de caja en 30 dias',
      detalle: 'Total: ' + formatMoney(total),
      sec: 'dashboard',
      clave: 'faltantes-' + faltantes30.length,
    });
  }

  const sobrantes30 = movCajaConTs
    .filter((x) => x.mv.concepto && x.mv.concepto.includes('Sobrante') && x.ts >= hace30dMs)
    .map((x) => x.mv);
  if (sobrantes30.length >= Number(cfg.umbralSobrantesMes || 3)) {
    const total = sobrantes30.reduce((s, f) => s + Number(f.monto || 0), 0);
    push({
      nivel: 'atencion',
      peso: 60,
      icono: 'wallet',
      titulo: sobrantes30.length + ' sobrantes de caja en 30 dias',
      detalle: 'Total: ' + formatMoney(total),
      sec: 'dashboard',
      clave: 'sobrantes-' + sobrantes30.length,
    });
  }

  const umbralDesc = Number(cfg.umbralDescuentoPct || 20);
  if (umbralDesc > 0) {
    let descAltos = 0;
    ventasActivas
      .filter((x) => x.ts >= hace30dMs)
      .forEach(({ v }) => {
        v.items.forEach((it) => {
          const prod = productosPorId.get(it.productoId);
          if (!prod || !prod.precio || Number(prod.precio) <= 0) return;
          if (Number(it.precio) <= 0) return;
          const pct = ((Number(prod.precio) - Number(it.precio)) / Number(prod.precio)) * 100;
          if (pct >= umbralDesc && Number(it.cantidad) > 0) descAltos++;
        });
      });
    if (descAltos > 0) {
      push({
        nivel: 'atencion',
        peso: 50,
        icono: 'trend',
        titulo: descAltos + ' venta(s) con descuento > ' + umbralDesc + '%',
        detalle: 'Revisa los precios aplicados',
        sec: 'ventas',
        clave: 'descuentos-' + descAltos,
      });
    }
  }

  const gastosMes = gastos
    .filter((g) => fechaMs(g.fecha) >= mesActualIMs)
    .reduce((s, g) => s + Number(g.monto || 0), 0);
  if (totalMes > 100 && gastosMes / totalMes > 0.3) {
    push({
      nivel: 'atencion',
      peso: 48,
      icono: 'dollar',
      titulo: 'Gastos altos este mes',
      detalle: formatMoney(gastosMes) + ' (' + ((gastosMes / totalMes) * 100).toFixed(0) + '% de las ventas)',
      sec: 'gastos',
      clave: 'gastos-altos',
    });
  }

  productos
    .filter((p) => !p.archivado)
    .forEach((p) => {
      // Compras del producto ya indexadas y ordenadas por fecha desc.
      const comprasProd = comprasPorProducto.get(p.id) || [];
      if (comprasProd.length < 3) return;
      const ult = Number(comprasProd[0].c.costo);
      const ultFechaMs = comprasProd[0].ts;
      if (ultFechaMs < hace30dMs) return;
      const previas = comprasProd.slice(1, 6);
      const prom = previas.reduce((s, x) => s + Number(x.c.costo), 0) / previas.length;
      if (prom > 0.01 && ult > prom * 1.3) {
        push({
          nivel: 'atencion',
          peso: 45,
          icono: 'bag',
          titulo: p.nombre + ': compra ' + ((ult / prom - 1) * 100).toFixed(0) + '% mas caro',
          detalle: formatMoney(ult) + ' vs ' + formatMoney(prom) + ' promedio',
          sec: 'compras',
          refId: comprasProd[0].c.id,
          clave: 'compra-cara-' + comprasProd[0].c.id,
        });
      }
    });

  const anuladas30 = ventasConTs
    .filter((x) => x.v.anulada && x.v.fechaAnulacion && fechaMs(x.v.fechaAnulacion) >= hace30dMs)
    .map((x) => x.v);
  if (anuladas30.length >= 5) {
    push({
      nivel: 'atencion',
      peso: 40,
      icono: 'x',
      titulo: anuladas30.length + ' ventas anuladas en 30 dias',
      detalle: 'Revisa por que se anulan tanto',
      sec: 'ventas',
      clave: 'anuladas-' + anuladas30.length,
    });
  }

  const agotados = productos.filter((p) => !p.archivado && stockDe(p.id) <= 0.001);
  const conStockBajo = productos.filter((p) => {
    if (p.archivado) return false;
    const s = stockDe(p.id);
    return s > 0 && s <= stockMinEfectivo(p.stockMinimo);
  });
  if (agotados.length >= 3 || conStockBajo.length >= 5) {
    push({
      nivel: 'atencion',
      peso: 46,
      icono: 'bag',
      titulo: 'Revisa inventario: ' + agotados.length + ' agotados, ' + conStockBajo.length + ' bajos',
      detalle: 'Considera hacer una compra',
      sec: 'productos',
      clave: 'revisa-inventario',
    });
  }

  // ============================================================
  // ============ OPORTUNIDADES (peso 30-49) ====================
  // ============================================================

  const ultimos7: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ahora);
    d.setDate(ahora.getDate() - i);
    ultimos7.push(diasConVenta.has(d.toDateString()));
  }
  let racha = 0;
  for (let i = 0; i < 7; i++) {
    if (!ultimos7[i]) break;
    racha++;
  }
  if (racha >= 5) {
    push({
      nivel: 'oportunidad',
      peso: 35,
      icono: 'diamond',
      titulo: 'Racha de ' + racha + ' dias con ventas',
      detalle: 'Buen ritmo, sigue asi',
      sec: 'dashboard',
      clave: 'racha-' + racha,
    });
  }

  // ============================================================
  // ============ INFO (peso 0-29) ==============================
  // ============================================================

  // Tendencia SEMANAL (esta semana vs la anterior)
  if (totalSemanaAnt > 100 && totalSemana > 0) {
    const pctSem = ((totalSemana - totalSemanaAnt) / totalSemanaAnt) * 100;
    if (Math.abs(pctSem) >= 15) {
      push({
        nivel: pctSem > 0 ? 'oportunidad' : 'atencion',
        peso: Math.abs(pctSem) >= 30 ? 45 : 30,
        icono: 'trend',
        titulo: 'Ventas ' + (pctSem > 0 ? 'subieron' : 'bajaron') + ' ' + Math.abs(pctSem).toFixed(0) + '% esta semana',
        detalle: 'De ' + formatMoney(totalSemanaAnt) + ' a ' + formatMoney(totalSemana),
        sec: 'reportes',
        clave: 'tendencia-semanal',
      });
    }
  }

  // Tendencia MENSUAL (referencia secundaria)
  if (totalMesAnt > 100 && totalMes > 0) {
    const pct = ((totalMes - totalMesAnt) / totalMesAnt) * 100;
    if (Math.abs(pct) >= 15) {
      push({
        nivel: pct > 0 ? 'oportunidad' : 'info',
        peso: Math.abs(pct) >= 30 ? 38 : 22,
        icono: 'trend',
        titulo: 'Ventas ' + (pct > 0 ? 'subieron' : 'bajaron') + ' ' + Math.abs(pct).toFixed(0) + '% este mes',
        detalle: 'De ' + formatMoney(totalMesAnt) + ' a ' + formatMoney(totalMes),
        sec: 'reportes',
        clave: 'tendencia-mensual',
      });
    }
  }

  // ============================================================
  // ============ REGLAS SEMANALES NUEVAS =======================
  // ============================================================

  // Margen semanal bajo
  if (totalSemana > 200) {
    const margenSem = (gananciaSemana / totalSemana) * 100;
    if (margenSem < 10) {
      push({
        nivel: 'atencion',
        peso: 52,
        icono: 'chart',
        titulo: 'Margen semanal bajo: ' + margenSem.toFixed(1) + '%',
        detalle: 'Vendiste ' + formatMoney(totalSemana) + ' con ganancia de ' + formatMoney(gananciaSemana),
        sec: 'reportes',
        clave: 'margen-semanal-bajo',
      });
    }
  }

  // Proyeccion semanal
  if (totalSemana > 0) {
    // Días FRACCIONARIOS desde el inicio de la ventana rodante: con la
    // semana definida como [hoy-6 a medianoche, ahora], ceil() daba SIEMPRE 7
    // y el guard "< 7" dejaba la regla MUERTA (solo disparaba en el
    // instante exacto de la medianoche). Con fracción, "al ritmo actual"
    // proyecta de verdad el tramo restante de la ventana.
    const diasPasados = Math.max(1, (ahora.getTime() - semanaActual.i.getTime()) / 86400000);
    if (diasPasados >= 3) {
      const promedio = totalSemana / diasPasados;
      const proyeccionSemana = promedio * 7;
      push({
        nivel: 'info',
        peso: 16,
        icono: 'trend',
        titulo: 'Proyeccion: ' + formatMoney(proyeccionSemana) + ' esta semana',
        detalle: 'Al ritmo actual (' + formatMoney(promedio) + '/dia)',
        sec: 'reportes',
        clave: 'proyeccion-semanal',
      });
    }
  }

  // Racha de dias con ventas (ya existe, dejamos que siga)

  const ganPorProd: Record<string, number> = {};
  ventasMes.forEach((v) =>
    v.items.forEach((it) => {
      ganPorProd[it.productoId] = (ganPorProd[it.productoId] || 0) + Number(it.ganancia || 0);
    })
  );
  const topProd = Object.keys(ganPorProd).sort((a, b) => ganPorProd[b] - ganPorProd[a])[0];
  if (topProd && ganPorProd[topProd] > 0) {
    const p = productosPorId.get(topProd);
    if (p)
      push({
        nivel: 'info',
        peso: 20,
        icono: 'diamond',
        titulo: 'Top producto: ' + p.nombre,
        detalle: 'Genero ' + formatMoney(ganPorProd[topProd]) + ' este mes',
        sec: 'productos',
        refId: topProd,
        clave: 'top-prod',
      });
  }

  const totalGan = Object.values(ganPorProd).reduce<number>((s, x) => s + Number(x), 0);
  const topGan = Math.max(...Object.values(ganPorProd).map(Number), 0);
  if (totalGan > 0 && topGan / totalGan > 0.5 && Object.keys(ganPorProd).length > 1) {
    push({
      nivel: 'info',
      peso: 18,
      icono: 'diamond',
      titulo: 'Mucha dependencia de un producto',
      detalle: 'El top genera ' + ((topGan / totalGan) * 100).toFixed(0) + '% de la ganancia',
      sec: 'productos',
      clave: 'concentracion',
    });
  }

  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const ventas90 = ventasActivas.filter((x) => x.ts >= hace90dMs);
  ventas90.forEach(({ v, ts }) => {
    porDia[new Date(ts).getDay()] += Number(v.total || 0);
  });
  const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const mejorDia = porDia.indexOf(Math.max(...porDia));
  if (porDia[mejorDia] > 0 && ventas90.length >= 10) {
    push({
      nivel: 'info',
      peso: 15,
      icono: 'calendar',
      titulo: 'Tu mejor dia es ' + nombresDias[mejorDia],
      detalle: 'Ventas acumuladas (90 dias): ' + formatMoney(porDia[mejorDia]),
      sec: 'reportes',
      clave: 'mejor-dia',
    });
  }

  if (totalMes > 0) {
    const diaDelMes = ahora.getDate();
    const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    if (diaDelMes >= 5) {
      const proyeccion = (totalMes / diaDelMes) * diasEnMes;
      push({
        nivel: 'info',
        peso: 12,
        icono: 'trend',
        titulo: 'Proyeccion fin de mes: ' + formatMoney(proyeccion),
        detalle: 'Basado en el promedio diario actual',
        sec: 'reportes',
        clave: 'proyeccion',
      });
    }
  }

  // Productos sin movimiento: lotes indexados por producto y ventas
  // recientes como conjunto de ids (antes: filter+reduce de lotes y
  // ventas.some() por producto, con new Date() por registro).
  const vendidosDesdeUmbral = new Set<string>();
  for (const { v, ts } of ventasActivas) {
    if (ts < umbralSinMovMs) continue;
    for (const it of v.items) vendidosDesdeUmbral.add(it.productoId);
  }
  const dormidos = productos.filter((p) => {
    if (p.archivado) return false;
    if (stockDe(p.id) <= 0) return false;
    let fechaAltaMs: number | null = null;
    if (p.fechaCreacion) fechaAltaMs = fechaMs(p.fechaCreacion);
    if (fechaAltaMs === null) {
      const lotesProd = lotesPorProducto.get(p.id) || [];
      const validos = lotesProd.map((x) => x.ts).filter((t) => t > 0);
      if (validos.length) fechaAltaMs = Math.min(...validos);
    }
    if (fechaAltaMs === null || fechaAltaMs === 0) return false;
    if (fechaAltaMs > umbralSinMovMs) return false;
    return !vendidosDesdeUmbral.has(p.id);
  });
  if (dormidos.length > 0) {
    push({
      nivel: 'info',
      peso: 22,
      icono: 'package',
      titulo: dormidos.length + ' producto(s) sin movimiento',
      detalle:
        dormidos
          .slice(0, 3)
          .map((p) => p.nombre)
          .join(', ') + (dormidos.length > 3 ? '...' : ''),
      sec: 'productos',
      clave: 'dormidos-' + dormidos.length,
    });
  }

  // ============================================================
  // ============ CONTEXTO TEMPORAL =============================
  // ============================================================
  const ctx = contextoDelMomento(ahora, { ventasHoy, totalHoy, totalMes, diasSinCierre, formatMoney });
  if (ctx) push(ctx);

  // ============================================================
  // ============ ORDENAR Y DEVOLVER ============================
  // ============================================================
  const ordenNivel = { urgente: 0, atencion: 1, oportunidad: 2, info: 3 };
  return out.sort((a, b) => {
    const n = ordenNivel[a.nivel] - ordenNivel[b.nivel];
    if (n !== 0) return n;
    return (b.peso || 0) - (a.peso || 0);
  });
}

function contextoDelMomento(ahora: Date, data: ContextoData): Recomendacion | null {
  const dia = ahora.getDay();
  const hora = ahora.getHours();
  const diaMes = ahora.getDate();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const { ventasHoy, totalHoy, diasSinCierre, formatMoney } = data;

  if (diaMes === 1 && hora <= 11) {
    return {
      nivel: 'info',
      peso: 28,
      icono: 'calendar',
      titulo: 'Comenzo un nuevo mes',
      detalle: 'Revisa el resumen del mes pasado en Reportes',
      sec: 'reportes',
      clave: 'ctx-nuevo-mes',
    };
  }

  if (diaMes >= diasEnMes - 1 && diasSinCierre >= 25) {
    return {
      nivel: 'atencion',
      peso: 68,
      icono: 'calendar',
      titulo: 'Es momento de cerrar el mes',
      detalle: 'Cierra el periodo para acumular la ganancia',
      sec: 'reportes',
      clave: 'ctx-cierre-mes',
    };
  }

  if (dia === 1 && hora >= 6 && hora <= 12) {
    return {
      nivel: 'info',
      peso: 18,
      icono: 'zap',
      titulo: 'Buena semana' + (ventasHoy > 0 ? ' · ' + ventasHoy + ' venta(s) hoy' : ''),
      detalle: 'Empieza bien la semana registrando cada movimiento',
      sec: null,
      clave: 'ctx-lunes',
    };
  }

  if (dia === 5 && hora >= 15 && hora <= 20) {
    return {
      nivel: 'info',
      peso: 18,
      icono: 'trend',
      titulo: 'Viernes por la tarde',
      detalle: 'Suele ser buen dia de ventas, ten stock listo',
      sec: null,
      clave: 'ctx-viernes',
    };
  }

  if (dia === 6 && hora >= 9 && hora <= 14) {
    return {
      nivel: 'info',
      peso: 15,
      icono: 'zap',
      titulo: 'Sabado por la manana',
      detalle: 'Dia fuerte, asegurate de tener todo listo',
      sec: null,
      clave: 'ctx-sabado',
    };
  }

  if (dia === 0 && hora >= 18) {
    return {
      nivel: 'info',
      peso: 20,
      icono: 'calendar',
      titulo: 'Resumen semanal',
      detalle: 'Revisa las ventas de la semana en Reportes',
      sec: 'reportes',
      clave: 'ctx-domingo',
    };
  }

  if (hora >= 22) {
    if (ventasHoy > 0) {
      return {
        nivel: 'info',
        peso: 16,
        icono: 'check',
        titulo: 'Cierre del dia: ' + formatMoney(totalHoy),
        detalle: ventasHoy + ' venta(s) registradas',
        sec: null,
        clave: 'ctx-cierre-dia',
      };
    }
  }

  return null;
}
