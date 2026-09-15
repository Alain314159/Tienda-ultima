// Motor de reglas inteligentes — analiza datos y devuelve consejos
export function generarInsights(state) {
  const out = [];
  const {
    ventas, compras, gastos, ajustes, productos, lotes,
    cierres, movCaja, saldoCaja, cfg, formatMoney, formatNum,
    stockDe, calcMargen
  } = state;

  const ahora = new Date();
  const mesActual = { i: new Date(ahora.getFullYear(), ahora.getMonth(), 1), f: ahora };
  const mesAnterior = {
    i: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1),
    f: new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59)
  };

  const ventasMes = ventas.filter(v => !v.anulada && new Date(v.fecha) >= mesActual.i);
  const ventasMesAnt = ventas.filter(v => !v.anulada && new Date(v.fecha) >= mesAnterior.i && new Date(v.fecha) <= mesAnterior.f);

  const totalMes = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
  const totalMesAnt = ventasMesAnt.reduce((s, v) => s + (v.total || 0), 0);
  const ganMes = ventasMes.reduce((s, v) => s + (v.ganancia || 0), 0);
  const ganMesAnt = ventasMesAnt.reduce((s, v) => s + (v.ganancia || 0), 0);

  // 1. Tendencia de ventas
  if (totalMesAnt > 100 && totalMes > 0) {
    const pct = ((totalMes - totalMesAnt) / totalMesAnt) * 100;
    if (pct >= 15) {
      out.push({
        tipo: 'ok', icono: 'trend',
        titulo: 'Ventas subieron ' + pct.toFixed(0) + '% este mes',
        detalle: 'De ' + formatMoney(totalMesAnt) + ' a ' + formatMoney(totalMes),
        sec: 'reportes'
      });
    } else if (pct <= -15) {
      out.push({
        tipo: 'warn', icono: 'trend',
        titulo: 'Ventas bajaron ' + Math.abs(pct).toFixed(0) + '% este mes',
        detalle: 'De ' + formatMoney(totalMesAnt) + ' a ' + formatMoney(totalMes),
        sec: 'reportes'
      });
    }
  }

  // 2. Cambio de margen
  if (totalMesAnt > 100 && totalMes > 100) {
    const mActual = (ganMes / totalMes) * 100;
    const mAnt = (ganMesAnt / totalMesAnt) * 100;
    const dif = mActual - mAnt;
    if (Math.abs(dif) >= 3) {
      out.push({
        tipo: dif > 0 ? 'ok' : 'warn',
        icono: 'chart',
        titulo: dif > 0 ? 'Margen subio a ' + mActual.toFixed(1) + '%' : 'Margen bajo a ' + mActual.toFixed(1) + '%',
        detalle: 'Antes: ' + mAnt.toFixed(1) + '% · Ahora: ' + mActual.toFixed(1) + '%',
        sec: 'contabilidad'
      });
    }
  }

  // 3. Productos dormidos
  const hace60d = new Date(ahora.getTime() - 60 * 86400000);
  const productosDormidos = productos.filter(p => {
    if (p.archivado) return false;
    if (stockDe(p.id) <= 0) return false;
    const ultimaVenta = ventas.filter(v => !v.anulada && v.items.some(it => it.productoId === p.id))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    if (!ultimaVenta) return true;
    return new Date(ultimaVenta.fecha) < hace60d;
  });
  if (productosDormidos.length > 0) {
    out.push({
      tipo: 'warn', icono: 'package',
      titulo: productosDormidos.length + ' producto(s) sin movimiento hace 60 dias',
      detalle: productosDormidos.slice(0, 3).map(p => p.nombre).join(', ') + (productosDormidos.length > 3 ? '...' : ''),
      sec: 'productos'
    });
  }

  // 4. Sugerencia de compra
  const conStockBajo = productos.filter(p => {
    if (p.archivado) return false;
    const s = stockDe(p.id);
    return s > 0 && s <= (p.stockMinimo || 5);
  });
  const agotados = productos.filter(p => !p.archivado && stockDe(p.id) <= 0);
  if (agotados.length >= 3 || conStockBajo.length >= 5) {
    out.push({
      tipo: 'warn', icono: 'bag',
      titulo: 'Revisa inventario: ' + agotados.length + ' agotados, ' + conStockBajo.length + ' bajos',
      detalle: 'Considera hacer una compra',
      sec: 'productos', filtro: 'bajos'
    });
  }

  // 5. Caja negativa
  if (saldoCaja < -0.01) {
    const hace3d = new Date(ahora.getTime() - 3 * 86400000);
    const movsNeg = movCaja.filter(m => new Date(m.fecha) >= hace3d);
    out.push({
      tipo: 'bad', icono: 'wallet',
      titulo: 'Caja en negativo: ' + formatMoney(saldoCaja),
      detalle: 'Ultimos 3 dias: ' + movsNeg.length + ' movimiento(s)',
      sec: 'caja'
    });
  }

  // 6. Mejor dia de la semana
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const ventas90 = ventas.filter(v => !v.anulada && new Date(v.fecha) >= new Date(ahora.getTime() - 90 * 86400000));
  ventas90.forEach(v => { porDia[new Date(v.fecha).getDay()] += (v.total || 0); });
  const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const mejorDia = porDia.indexOf(Math.max(...porDia));
  if (porDia[mejorDia] > 0 && ventas90.length >= 10) {
    out.push({
      tipo: 'info', icono: 'calendar',
      titulo: 'Tu mejor dia es ' + nombresDias[mejorDia],
      detalle: 'Ventas acumuladas (90 dias): ' + formatMoney(porDia[mejorDia]),
      sec: 'reportes'
    });
  }

  // 7. Top producto del mes
  const ganPorProd = {};
  ventasMes.forEach(v => v.items.forEach(it => {
    ganPorProd[it.productoId] = (ganPorProd[it.productoId] || 0) + (it.ganancia || 0);
  }));
  const topProd = Object.keys(ganPorProd).sort((a, b) => ganPorProd[b] - ganPorProd[a])[0];
  if (topProd && ganPorProd[topProd] > 0) {
    const p = productos.find(x => x.id === topProd);
    if (p) {
      out.push({
        tipo: 'info', icono: 'diamond',
        titulo: 'Top producto: ' + p.nombre,
        detalle: 'Genero ' + formatMoney(ganPorProd[topProd]) + ' este mes',
        sec: 'productos'
      });
    }
  }

  // 8. Dia de la semana sin ventas
  const hoy = ahora.getDay();
  const huboVentaHoy = ventas.some(v => !v.anulada && new Date(v.fecha).toDateString() === ahora.toDateString());
  if (!huboVentaHoy && ahora.getHours() >= 12 && productos.length > 0) {
    out.push({
      tipo: 'info', icono: 'cart',
      titulo: 'Sin ventas registradas hoy',
      detalle: 'Ya van ' + ahora.getHours() + ' horas del dia',
      sec: 'ventas'
    });
  }

  // 9. Gastos altos vs ventas
  const gastosMes = gastos.filter(g => new Date(g.fecha) >= mesActual.i).reduce((s, g) => s + (g.monto || 0), 0);
  if (totalMes > 100 && gastosMes / totalMes > 0.3) {
    out.push({
      tipo: 'warn', icono: 'dollar',
      titulo: 'Gastos altos este mes',
      detalle: formatMoney(gastosMes) + ' (' + ((gastosMes / totalMes) * 100).toFixed(0) + '% de las ventas)',
      sec: 'gastos'
    });
  }

  // 10. Mermas altas
  const mermasMes = ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= mesActual.i)
    .reduce((s, a) => s + (a.costoPerdida || 0), 0);
  if (mermasMes > 0 && totalMes > 0 && (mermasMes / totalMes) > 0.05) {
    out.push({
      tipo: 'warn', icono: 'alert',
      titulo: 'Mermas altas: ' + formatMoney(mermasMes),
      detalle: ((mermasMes / totalMes) * 100).toFixed(1) + '% de las ventas del mes',
      sec: 'inventario'
    });
  }

  // 11. Racha de dias con ventas
  const ultimos7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ahora);
    d.setDate(ahora.getDate() - i);
    const key = d.toDateString();
    const vendio = ventas.some(v => !v.anulada && new Date(v.fecha).toDateString() === key);
    ultimos7.push(vendio);
  }
  const racha = ultimos7.filter(Boolean).length;
  if (racha >= 5) {
    out.push({
      tipo: 'ok', icono: 'diamond',
      titulo: 'Racha de ' + racha + ' dias con ventas',
      detalle: 'Sigue asi',
      sec: 'dashboard'
    });
  } else if (racha <= 1 && productos.length > 3) {
    out.push({
      tipo: 'warn', icono: 'trend',
      titulo: 'Pocas ventas en los ultimos 7 dias',
      detalle: 'Solo ' + racha + ' dia(s) con movimiento',
      sec: 'ventas'
    });
  }

  // 12. Concentracion de ingresos
  const ganPorProd2 = {};
  ventasMes.forEach(v => v.items.forEach(it => {
    ganPorProd2[it.productoId] = (ganPorProd2[it.productoId] || 0) + (it.ganancia || 0);
  }));
  const totalGan = Object.values(ganPorProd2).reduce((s, x) => s + x, 0);
  const topGan = Math.max(...Object.values(ganPorProd2), 0);
  if (totalGan > 0 && (topGan / totalGan) > 0.5) {
    out.push({
      tipo: 'info', icono: 'diamond',
      titulo: 'Mucha dependencia de un producto',
      detalle: 'El top genera ' + ((topGan / totalGan) * 100).toFixed(0) + '% de la ganancia del mes',
      sec: 'productos'
    });
  }

  // 14. Proyeccion del mes
  if (totalMes > 0) {
    const diaDelMes = ahora.getDate();
    const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    if (diaDelMes >= 5) {
      const proyeccion = (totalMes / diaDelMes) * diasEnMes;
      out.push({
        tipo: 'info', icono: 'trend',
        titulo: 'Proyeccion fin de mes: ' + formatMoney(proyeccion),
        detalle: 'Basado en el promedio diario actual',
        sec: 'reportes'
      });
    }
  }

  // Ordenar por tipo
  const orden = { bad: 0, warn: 1, ok: 2, info: 3 };
  return out.sort((a, b) => orden[a.tipo] - orden[b.tipo]).slice(0, 6);
}
