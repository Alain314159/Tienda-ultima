// Verificador de integridad de la base de datos.
// Recibe la instancia de Dexie (db) y devuelve un reporte.
export async function verificarIntegridad(db) {
  const errores = [];
  const stats = {};
  const tablas = [
    'productos','lotes','ventas','compras','ajustes','arqueos','movCaja',
    'cierres','capital','retiros','socios','distribuciones','gastos'
  ];

  // 1. Contar registros
  for (const t of tablas) {
    try { stats[t] = await db.table(t).count(); }
    catch { stats[t] = 'error'; }
  }

  // 2. IDs faltantes o duplicados
  for (const t of tablas) {
    let items;
    try { items = await db.table(t).toArray(); } catch { continue; }
    const ids = new Set();
    for (const it of items) {
      if (!it || !it.id) {
        errores.push({ tipo: 'sin_id', tabla: t, item: it });
        continue;
      }
      if (ids.has(it.id)) {
        errores.push({ tipo: 'id_duplicado', tabla: t, id: it.id });
      }
      ids.add(it.id);
    }
  }

  // 3. Lotes huérfanos (compraId que no existe, excepto ajustes)
  let comprasIds = new Set(), lotes = [];
  try {
    comprasIds = new Set((await db.compras.toArray()).map(c => c.id));
    lotes = await db.lotes.toArray();
  } catch {}
  for (const l of lotes) {
    if (l.compraId && !String(l.compraId).startsWith('aj-') && !comprasIds.has(l.compraId)) {
      errores.push({ tipo: 'lote_huerfano', loteId: l.id, compraId: l.compraId });
    }
  }

  // 4. Stock negativo (vendida > inicial)
  const porProd = {};
  for (const l of lotes) {
    const pid = l.productoId || 'sin_producto';
    if (!porProd[pid]) porProd[pid] = { inicial: 0, vendida: 0 };
    porProd[pid].inicial += Number(l.cantidadInicial) || 0;
    porProd[pid].vendida += Number(l.cantidadVendida) || 0;
  }
  for (const pid in porProd) {
    const { inicial, vendida } = porProd[pid];
    if (vendida > inicial + 0.001) {
      errores.push({ tipo: 'stock_negativo', productoId: pid, inicial, vendida });
    }
  }

  // 5. Ventas con lotesUsados huérfanos
  const lotesIds = new Set(lotes.map(l => l.id));
  let ventas = [];
  try { ventas = await db.ventas.toArray(); } catch {}
  for (const v of ventas) {
    if (!Array.isArray(v.items)) continue;
    for (const it of v.items) {
      if (!Array.isArray(it.lotesUsados)) continue;
      for (const u of it.lotesUsados) {
        if (!lotesIds.has(u.loteId)) {
          errores.push({ tipo: 'venta_lote_huerfano', ventaId: v.id, loteId: u.loteId });
        }
      }
    }
  }

  // 6. Movimientos de caja de gastos sin gasto asociado
  try {
    const gastosConMov = new Set((await db.gastos.toArray()).filter(g => g.movId).map(g => g.movId));
    const movCaja = await db.movCaja.toArray();
    for (const m of movCaja) {
      if (m.concepto && /^Gasto:/i.test(m.concepto) && !gastosConMov.has(m.id)) {
        errores.push({ tipo: 'movCaja_sin_gasto', movId: m.id, concepto: m.concepto });
      }
    }
  } catch {}

  // 7. Cierres sin campos clave
  try {
    const cierres = await db.cierres.toArray();
    for (const c of cierres) {
      if (c.ganancia === undefined || c.totalVentas === undefined) {
        errores.push({ tipo: 'cierre_incompleto', cierreId: c.id });
      }
    }
  } catch {}

  return {
    ok: errores.length === 0,
    errores,
    stats,
    fecha: new Date().toISOString(),
    totalErrores: errores.length
  };
}

// Formatea el reporte para mostrar
export function formatearReporte(r) {
  const lineas = [];
  lineas.push('═══════════════════════════════════════');
  lineas.push('  VERIFICACION DE INTEGRIDAD');
  lineas.push('═══════════════════════════════════════');
  lineas.push(`  Fecha: ${new Date(r.fecha).toLocaleString()}`);
  lineas.push('');
  lineas.push('  TABLAS:');
  for (const t in r.stats) {
    lineas.push(`    ${t.padEnd(16)} ${r.stats[t]}`);
  }
  lineas.push('');
  if (r.ok) {
    lineas.push('  ✅ Todo correcto. Sin anomalias detectadas.');
  } else {
    lineas.push(`  ⚠️ ${r.errores.length} anomalia(s) encontrada(s):`);
    lineas.push('');
    const porTipo = {};
    for (const e of r.errores) {
      porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
    }
    for (const t in porTipo) {
      lineas.push(`    · ${t}: ${porTipo[t]}`);
    }
  }
  lineas.push('═══════════════════════════════════════');
  return lineas.join('\n');
}
