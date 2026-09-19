// Motor de Recomendaciones para Tienda Pro
// Incluye: alertas de negocio + info + contexto temporal.
// Sin detecciones de tendencia por producto ni predicciones.

export function generarRecomendaciones(state) {
  const out = [];
  const {
    ventas, compras, gastos, ajustes, productos, lotes,
    cierres, movCaja, saldoCaja, cfg, formatMoney, formatNum,
    stockDe
  } = state;

  const ahora = new Date();
  const hace30d = new Date(ahora.getTime() - 30 * 86400000);
  const hace90d = new Date(ahora.getTime() - 90 * 86400000);
  const umbralSinMov = new Date(ahora.getTime() - Number(cfg.umbralSinMovimientoDias || 60) * 86400000);

  const mesActual = { i: new Date(ahora.getFullYear(), ahora.getMonth(), 1), f: ahora };
  const mesAnterior = {
    i: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1),
    f: new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59)
  };

  const ventasMes = ventas.filter(v => !v.anulada && new Date(v.fecha) >= mesActual.i);
  const ventasMesAnt = ventas.filter(v => !v.anulada && new Date(v.fecha) >= mesAnterior.i && new Date(v.fecha) <= mesAnterior.f);
  const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
  const totalMesAnt = ventasMesAnt.reduce((s, v) => s + (v.total || 0), 0);

  const push = (r) => out.push(r);

  // ============================================================
  // ============ URGENTES (peso 80-100) ========================
  // ============================================================

  if (saldoCaja < -0.01) {
    push({
      nivel: 'urgente', peso: saldoCaja < -1000 ? 95 : 85, icono: 'wallet',
      titulo: 'Caja en negativo: ' + formatMoney(saldoCaja),
      detalle: 'Revisa los ultimos movimientos y arqueos',
      sec: 'contabilidad', clave: 'caja-negativa'
    });
  }

  productos.filter(p => !p.archivado && stockDe(p.id) < -0.001).forEach(p => {
    push({
      nivel: 'urgente', peso: 90, icono: 'package',
      titulo: p.nombre + ': stock negativo',
      detalle: 'Hay ' + formatNum(stockDe(p.id)) + ' unidades. Revisa ventas o ajusta',
      sec: 'productos', refId: p.id, clave: 'stock-neg-' + p.id
    });
  });

  const ventasBajoCosto = ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d)
    .flatMap(v => v.items.filter(it => Number(it.ganancia) < -0.01).map(it => ({ venta: v, item: it })));
  if (ventasBajoCosto.length > 0) {
    const perdida = ventasBajoCosto.reduce((s, x) => s + Number(x.item.ganancia), 0);
    push({
      nivel: 'urgente', peso: 88, icono: 'trend',
      titulo: ventasBajoCosto.length + ' venta(s) bajo costo',
      detalle: 'Perdiste ' + formatMoney(perdida) + ' vendiendo bajo el costo',
      sec: 'ventas', clave: 'ventas-bajo-costo-' + ventasBajoCosto.length
    });
  }

  // ============================================================
  // ============ ATENCION (peso 50-79) =========================
  // ============================================================

  if (state.balanzaPorCuenta) {
    const debe = state.balanzaPorCuenta.reduce((s, b) => s + (b.debe || 0), 0);
    const haber = state.balanzaPorCuenta.reduce((s, b) => s + (b.haber || 0), 0);
    if (Math.abs(debe - haber) > 0.01 && state.asientos && state.asientos.length > 0) {
      push({
        nivel: 'atencion', peso: 75, icono: 'alert',
        titulo: 'Descuadre en libro diario',
        detalle: 'Debe: ' + formatMoney(debe) + ' · Haber: ' + formatMoney(haber),
        sec: 'contabilidad', clave: 'descuadre-libro'
      });
    }
  }

  const ultimoCierre = cierres.length > 0
    ? Math.max(...cierres.map(c => new Date(c.fechaCierre).getTime()))
    : new Date(cfg.periodoInicio).getTime();
  const diasSinCierre = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
  if (diasSinCierre >= Number(cfg.umbralDiasCierre || 30)) {
    push({
      nivel: 'atencion', peso: 70, icono: 'calendar',
      titulo: 'Cierre pendiente',
      detalle: diasSinCierre + ' dias sin cerrar el periodo',
      sec: 'reportes', clave: 'cierre-pendiente'
    });
  }

  const mermasMes = ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= mesActual.i)
    .reduce((s, a) => s + Number(a.costoPerdida || 0), 0);
  if (mermasMes > 0 && totalMes > 0) {
    const pct = (mermasMes / totalMes) * 100;
    if (pct > 5) {
      push({
        nivel: 'atencion', peso: 65, icono: 'alert',
        titulo: 'Mermas altas: ' + formatMoney(mermasMes),
        detalle: pct.toFixed(1) + '% de las ventas del mes',
        sec: 'inventario', clave: 'mermas-altas'
      });
    }
  }

  const faltantes30 = movCaja.filter(mv => mv.concepto && mv.concepto.includes('Faltante') && new Date(mv.fecha) >= hace30d);
  if (faltantes30.length >= Number(cfg.umbralFaltantesMes || 3)) {
    const total = faltantes30.reduce((s, f) => s + Number(f.monto || 0), 0);
    push({
      nivel: 'atencion', peso: 62, icono: 'wallet',
      titulo: faltantes30.length + ' faltantes de caja en 30 dias',
      detalle: 'Total: ' + formatMoney(total),
      sec: 'contabilidad', clave: 'faltantes-' + faltantes30.length
    });
  }

  const sobrantes30 = movCaja.filter(mv => mv.concepto && mv.concepto.includes('Sobrante') && new Date(mv.fecha) >= hace30d);
  if (sobrantes30.length >= Number(cfg.umbralSobrantesMes || 3)) {
    const total = sobrantes30.reduce((s, f) => s + Number(f.monto || 0), 0);
    push({
      nivel: 'atencion', peso: 60, icono: 'wallet',
      titulo: sobrantes30.length + ' sobrantes de caja en 30 dias',
      detalle: 'Total: ' + formatMoney(total),
      sec: 'contabilidad', clave: 'sobrantes-' + sobrantes30.length
    });
  }

  const umbralDesc = Number(cfg.umbralDescuentoPct || 20);
  if (umbralDesc > 0) {
    let descAltos = 0;
    ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d).forEach(v => {
      v.items.forEach(it => {
        const prod = productos.find(p => p.id === it.productoId);
        if (!prod || !prod.precio || Number(prod.precio) <= 0) return;
        if (Number(it.precio) <= 0) return;
        const pct = ((Number(prod.precio) - Number(it.precio)) / Number(prod.precio)) * 100;
        if (pct >= umbralDesc && Number(it.cantidad) > 0) descAltos++;
      });
    });
    if (descAltos > 0) {
      push({
        nivel: 'atencion', peso: 50, icono: 'trend',
        titulo: descAltos + ' venta(s) con descuento > ' + umbralDesc + '%',
        detalle: 'Revisa los precios aplicados',
        sec: 'ventas', clave: 'descuentos-' + descAltos
      });
    }
  }

  const gastosMes = gastos.filter(g => new Date(g.fecha) >= mesActual.i).reduce((s, g) => s + Number(g.monto || 0), 0);
  if (totalMes > 100 && gastosMes / totalMes > 0.3) {
    push({
      nivel: 'atencion', peso: 48, icono: 'dollar',
      titulo: 'Gastos altos este mes',
      detalle: formatMoney(gastosMes) + ' (' + ((gastosMes / totalMes) * 100).toFixed(0) + '% de las ventas)',
      sec: 'gastos', clave: 'gastos-altos'
    });
  }

  productos.filter(p => !p.archivado).forEach(p => {
    const comprasProd = compras.filter(c => c.productoId === p.id && !c.anulada).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (comprasProd.length < 3) return;
    const ult = Number(comprasProd[0].costo);
    const ultFecha = new Date(comprasProd[0].fecha);
    if (ultFecha < hace30d) return;
    const previas = comprasProd.slice(1, 6);
    const prom = previas.reduce((s, c) => s + Number(c.costo), 0) / previas.length;
    if (prom > 0.01 && ult > prom * 1.3) {
      push({
        nivel: 'atencion', peso: 45, icono: 'bag',
        titulo: p.nombre + ': compra ' + ((ult / prom - 1) * 100).toFixed(0) + '% mas caro',
        detalle: formatMoney(ult) + ' vs ' + formatMoney(prom) + ' promedio',
        sec: 'compras', refId: comprasProd[0].id, clave: 'compra-cara-' + comprasProd[0].id
      });
    }
  });

  const anuladas30 = ventas.filter(v => v.anulada && v.fechaAnulacion && new Date(v.fechaAnulacion) >= hace30d);
  if (anuladas30.length >= 5) {
    push({
      nivel: 'atencion', peso: 40, icono: 'x',
      titulo: anuladas30.length + ' ventas anuladas en 30 dias',
      detalle: 'Revisa por que se anulan tanto',
      sec: 'ventas', clave: 'anuladas-' + anuladas30.length
    });
  }

  const agotados = productos.filter(p => !p.archivado && stockDe(p.id) <= 0.001);
  const conStockBajo = productos.filter(p => {
    if (p.archivado) return false;
    const s = stockDe(p.id);
    return s > 0 && s <= Number(p.stockMinimo || 5);
  });
  if (agotados.length >= 3 || conStockBajo.length >= 5) {
    push({
      nivel: 'atencion', peso: 46, icono: 'bag',
      titulo: 'Revisa inventario: ' + agotados.length + ' agotados, ' + conStockBajo.length + ' bajos',
      detalle: 'Considera hacer una compra',
      sec: 'productos', clave: 'revisa-inventario'
    });
  }

  // ============================================================
  // ============ OPORTUNIDADES (peso 30-49) ====================
  // ============================================================

  const ultimos7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ahora);
    d.setDate(ahora.getDate() - i);
    const key = d.toDateString();
    const vendio = ventas.some(v => !v.anulada && new Date(v.fecha).toDateString() === key);
    ultimos7.push(vendio);
  }
  let racha = 0;
  for (let i = 0; i < 7; i++) { if (!ultimos7[i]) break; racha++; }
  if (racha >= 5) {
    push({
      nivel: 'oportunidad', peso: 35, icono: 'diamond',
      titulo: 'Racha de ' + racha + ' dias con ventas',
      detalle: 'Buen ritmo, sigue asi',
      sec: 'dashboard', clave: 'racha-' + racha
    });
  }

  // ============================================================
  // ============ INFO (peso 0-29) ==============================
  // ============================================================

  if (totalMesAnt > 100 && totalMes > 0) {
    const pct = ((totalMes - totalMesAnt) / totalMesAnt) * 100;
    if (Math.abs(pct) >= 15) {
      push({
        nivel: pct > 0 ? 'oportunidad' : 'info',
        peso: Math.abs(pct) >= 30 ? 40 : 25,
        icono: 'trend',
        titulo: 'Ventas ' + (pct > 0 ? 'subieron' : 'bajaron') + ' ' + Math.abs(pct).toFixed(0) + '%',
        detalle: 'De ' + formatMoney(totalMesAnt) + ' a ' + formatMoney(totalMes),
        sec: 'reportes', clave: 'tendencia-ventas'
      });
    }
  }

  const ganPorProd = {};
  ventasMes.forEach(v => v.items.forEach(it => {
    ganPorProd[it.productoId] = (ganPorProd[it.productoId] || 0) + Number(it.ganancia || 0);
  }));
  const topProd = Object.keys(ganPorProd).sort((a, b) => ganPorProd[b] - ganPorProd[a])[0];
  if (topProd && ganPorProd[topProd] > 0) {
    const p = productos.find(x => x.id === topProd);
    if (p) push({
      nivel: 'info', peso: 20, icono: 'diamond',
      titulo: 'Top producto: ' + p.nombre,
      detalle: 'Genero ' + formatMoney(ganPorProd[topProd]) + ' este mes',
      sec: 'productos', refId: topProd, clave: 'top-prod'
    });
  }

  const totalGan = Object.values(ganPorProd).reduce((s, x) => s + x, 0);
  const topGan = Math.max(...Object.values(ganPorProd), 0);
  if (totalGan > 0 && (topGan / totalGan) > 0.5 && Object.keys(ganPorProd).length > 1) {
    push({
      nivel: 'info', peso: 18, icono: 'diamond',
      titulo: 'Mucha dependencia de un producto',
      detalle: 'El top genera ' + ((topGan / totalGan) * 100).toFixed(0) + '% de la ganancia',
      sec: 'productos', clave: 'concentracion'
    });
  }

  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const ventas90 = ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace90d);
  ventas90.forEach(v => { porDia[new Date(v.fecha).getDay()] += Number(v.total || 0); });
  const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const mejorDia = porDia.indexOf(Math.max(...porDia));
  if (porDia[mejorDia] > 0 && ventas90.length >= 10) {
    push({
      nivel: 'info', peso: 15, icono: 'calendar',
      titulo: 'Tu mejor dia es ' + nombresDias[mejorDia],
      detalle: 'Ventas acumuladas (90 dias): ' + formatMoney(porDia[mejorDia]),
      sec: 'reportes', clave: 'mejor-dia'
    });
  }

  if (totalMes > 0) {
    const diaDelMes = ahora.getDate();
    const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    if (diaDelMes >= 5) {
      const proyeccion = (totalMes / diaDelMes) * diasEnMes;
      push({
        nivel: 'info', peso: 12, icono: 'trend',
        titulo: 'Proyeccion fin de mes: ' + formatMoney(proyeccion),
        detalle: 'Basado en el promedio diario actual',
        sec: 'reportes', clave: 'proyeccion'
      });
    }
  }

  // Productos sin movimiento
  const dormidos = productos.filter(p => {
    if (p.archivado) return false;
    if (stockDe(p.id) <= 0) return false;
    let fechaAlta = p.fechaCreacion ? new Date(p.fechaCreacion) : null;
    if (!fechaAlta) {
      const lotesProd = (lotes || []).filter(l => l.productoId === p.id);
      if (lotesProd.length) {
        const masAntiguo = lotesProd.reduce((min, l) => {
          const fL = new Date(l.fecha).getTime();
          const fMin = new Date(min.fecha).getTime();
          return fL < fMin ? l : min;
        });
        fechaAlta = new Date(masAntiguo.fecha);
      }
    }
    if (!fechaAlta || isNaN(fechaAlta.getTime())) return false;
    if (fechaAlta > umbralSinMov) return false;
    const ventasRecientes = ventas.some(v =>
      !v.anulada &&
      new Date(v.fecha) >= umbralSinMov &&
      v.items.some(it => it.productoId === p.id)
    );
    return !ventasRecientes;
  });
  if (dormidos.length > 0) {
    push({
      nivel: 'info', peso: 22, icono: 'package',
      titulo: dormidos.length + ' producto(s) sin movimiento',
      detalle: dormidos.slice(0, 3).map(p => p.nombre).join(', ') + (dormidos.length > 3 ? '...' : ''),
      sec: 'productos', clave: 'dormidos-' + dormidos.length
    });
  }

  // ============================================================
  // ============ CONTEXTO TEMPORAL =============================
  // ============================================================
  const ctx = contextoDelMomento(ahora, { ventas, totalMes, diasSinCierre, formatMoney });
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

function contextoDelMomento(ahora, data) {
  const dia = ahora.getDay();
  const hora = ahora.getHours();
  const diaMes = ahora.getDate();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const { ventas, diasSinCierre, formatMoney } = data;

  if (dia === 1 && hora <= 11) {
    return {
      nivel: 'info', peso: 28, icono: 'calendar',
      titulo: 'Comenzo un nuevo mes',
      detalle: 'Revisa el resumen del mes pasado en Reportes',
      sec: 'reportes', clave: 'ctx-nuevo-mes'
    };
  }

  if (diaMes >= diasEnMes - 1 && diasSinCierre >= 25) {
    return {
      nivel: 'atencion', peso: 68, icono: 'calendar',
      titulo: 'Es momento de cerrar el mes',
      detalle: 'Cierra el periodo para acumular la ganancia',
      sec: 'reportes', clave: 'ctx-cierre-mes'
    };
  }

  if (dia === 1 && hora >= 6 && hora <= 12) {
    const ventasHoy = ventas.filter(v => !v.anulada && new Date(v.fecha).toDateString() === ahora.toDateString()).length;
    return {
      nivel: 'info', peso: 18, icono: 'zap',
      titulo: 'Buena semana' + (ventasHoy > 0 ? ' · ' + ventasHoy + ' venta(s) hoy' : ''),
      detalle: 'Empieza bien la semana registrando cada movimiento',
      sec: null, clave: 'ctx-lunes'
    };
  }

  if (dia === 5 && hora >= 15 && hora <= 20) {
    return {
      nivel: 'info', peso: 18, icono: 'trend',
      titulo: 'Viernes por la tarde',
      detalle: 'Suele ser buen dia de ventas, ten stock listo',
      sec: null, clave: 'ctx-viernes'
    };
  }

  if (dia === 6 && hora >= 9 && hora <= 14) {
    return {
      nivel: 'info', peso: 15, icono: 'zap',
      titulo: 'Sabado por la manana',
      detalle: 'Dia fuerte, asegurate de tener todo listo',
      sec: null, clave: 'ctx-sabado'
    };
  }

  if (dia === 0 && hora >= 18) {
    return {
      nivel: 'info', peso: 20, icono: 'calendar',
      titulo: 'Resumen semanal',
      detalle: 'Revisa las ventas de la semana en Reportes',
      sec: 'reportes', clave: 'ctx-domingo'
    };
  }

  if (hora >= 22) {
    const ventasHoy = ventas.filter(v => !v.anulada && new Date(v.fecha).toDateString() === ahora.toDateString());
    const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total || 0), 0);
    if (ventasHoy.length > 0) {
      return {
        nivel: 'info', peso: 16, icono: 'check',
        titulo: 'Cierre del dia: ' + formatMoney(totalHoy),
        detalle: ventasHoy.length + ' venta(s) registradas',
        sec: null, clave: 'ctx-cierre-dia'
      };
    }
  }

  return null;
}
