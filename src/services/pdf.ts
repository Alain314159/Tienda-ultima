/**
 * Servicio de exportación PDF del cuadre por período (jsPDF + autoTable).
 * Recibe el resultado del cuadre y el contexto financiero; no depende
 * de stores ni componentes (responsabilidad única: generar el PDF).
 */
import { n } from '../utils/numero';
import { fmt, fmtCant, fmtFH } from '../utils/formato';
import type { ResultadoCuadre, Socio } from '../types';

/** Contexto financiero de la tienda que necesita el PDF (portada y reparto). */
interface ContextoPDF {
  nombreTienda: string;
  saldoCaja: number;
  valorInventario: number;
  capitalTotal: number;
  gananciasAcumuladas: number;
  gananciaDisponible: number;
  patrimonioTotal: number;
  retirosAcumulados: number;
  gastosFueraCaja: number;
  socios: Socio[];
}

/**
 * @param {object} r resultado del cuadre (rep.resultado)
 * @param {object} ctx contexto financiero: nombreTienda, saldoCaja, valorInventario,
 *   capitalTotal, gananciasAcumuladas, gananciaDisponible, patrimonioTotal
 *   (capital + ganancias - retiros), retirosAcumulados, gastosFueraCaja, socios
 */
export async function generarPDFCuadre(r: ResultadoCuadre, ctx: ContextoPDF) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const generadoTxt = fmtFH(new Date().toISOString());

  // ============ PÁGINA 1: RESUMEN ============
  doc.setFillColor(33, 150, 243);
  doc.rect(0, 0, PW, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(ctx.nombreTienda || 'Tienda Pro', 14, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Cuadre por periodo', 14, 21);
  doc.setFontSize(8);
  doc.text('Periodo: ' + r._fechaI + ' al ' + r._fechaF, 14, 27);
  doc.text('Generado: ' + generadoTxt, PW - 14, 27, { align: 'right' });

  // --- Resumen financiero ---
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen financiero', 14, 35);

  const rowHighlight = (label: string) => {
    if (label === 'GANANCIA BRUTA') return { fontStyle: 'bold', fillColor: [230, 240, 255] };
    if (label === 'GANANCIA NETA') return { fontStyle: 'bold', fillColor: [220, 252, 231] };
    return null;
  };

  autoTable(doc, {
    startY: 38,
    head: [['Concepto', 'Monto']],
    body: [
      ['Ingresos por ventas', fmt(r.ingresos)],
      ['Costo de lo vendido (COGS)', '- ' + fmt(r.cogs)],
      ['GANANCIA BRUTA', fmt(r.bruta) + '  (' + r.margenB + '%)'],
      ['Gastos operativos', '- ' + fmt(r.gastos)],
      ['Mermas', '- ' + fmt(r.mermas)],
      ['GANANCIA NETA', fmt(r.neta) + '  (' + r.margenN + '%)'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 3 },
    margin: { left: 14, right: 158 },
    columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 47, halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const label = (data.row.raw as string[])[0];
      const hl = rowHighlight(label);
      if (hl) Object.assign(data.cell.styles, hl);
    },
  });

  // --- Situación financiera (a la derecha) ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Situacion financiera', 155, 35);

  autoTable(doc, {
    startY: 38,
    head: [['Concepto', 'Monto']],
    body: [
      ['Caja', fmt(ctx.saldoCaja)],
      ['Valor del inventario', fmt(ctx.valorInventario)],
      ['ACTIVOS TOTALES', fmt(ctx.saldoCaja + ctx.valorInventario)],
      ['Capital aportado', fmt(ctx.capitalTotal)],
      ['Ganancias acumuladas', fmt(ctx.gananciasAcumuladas)],
      ['Retiros acumulados', '- ' + fmt(ctx.retirosAcumulados)],
      ['PATRIMONIO NETO', fmt(ctx.patrimonioTotal)],
      ['Disponible para retiro', fmt(ctx.gananciaDisponible)],
      ['Gastos pagados fuera de caja', '- ' + fmt(ctx.gastosFueraCaja)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 3 },
    margin: { left: 155, right: 14 },
    columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 47, halign: 'right' } },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const label = (data.row.raw as string[])[0];
      if (label === 'ACTIVOS TOTALES' || label === 'PATRIMONIO NETO') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 240, 255];
      }
    },
  });

  // --- Reparto entre socios (abajo a la izquierda) ---
  if (ctx.socios && ctx.socios.length > 0) {
    const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 38) + 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Reparto entre socios', 14, y);

    const socioRows = ctx.socios.map((sc) => [
      sc.nombre,
      n(sc.porcentaje).toFixed(2) + '%',
      fmt((r.neta * n(sc.porcentaje)) / 100),
    ]);
    socioRows.push(['TOTAL', '100.00%', fmt(r.neta)]);

    autoTable(doc, {
      startY: y + 3,
      head: [['Socio', '% Participacion', 'Monto a recibir']],
      body: socioRows,
      theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      styles: { fontSize: 10, cellPadding: 3 },
      margin: { left: 14, right: 158 },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 32, halign: 'center' },
        2: { cellWidth: 38, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        if ((data.row.raw as string[])[0] === 'TOTAL') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 235, 255];
        }
      },
    });
  }

  // ============ PÁGINA 2+: TABLA POR PRODUCTO ============
  doc.addPage('a4', 'landscape');
  doc.setFillColor(33, 150, 243);
  doc.rect(0, 0, PW, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Detalle por producto', 14, 11);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text((ctx.nombreTienda || '') + '  ·  ' + r._fechaI + ' al ' + r._fechaF, PW - 14, 11, {
    align: 'right',
  });

  const PFILL = [235, 244, 255];
  const TFILL = [229, 231, 235];

  const bodyRows: Record<string, unknown>[][] = [];
  r.cuadre.forEach((row) => {
    bodyRows.push([
      { content: row.nombre, styles: { fontStyle: 'bold', fillColor: PFILL } },
      { content: fmtCant(row.compras), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.costoCompra), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmtCant(row.ventas), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.precioVenta), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.ingresos), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.costo), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: PFILL } },
      { content: fmtCant(row.stockFinal), styles: { halign: 'right', fillColor: PFILL } },
      { content: fmt(row.valorInv), styles: { halign: 'right', fillColor: PFILL } },
    ]);
    row.subfilas.forEach((sf, si) => {
      bodyRows.push([
        {
          content:
            '     Lote ' +
            (si + 1) +
            ': ' +
            fmt(sf.costo) +
            (sf.precio !== null ? ' -> ' + fmt(sf.precio) : ' (sin ventas)'),
          styles: { fontSize: 8, textColor: [33, 150, 243] },
        },
        { content: sf.comprasCant ? fmtCant(sf.comprasCant) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: fmt(sf.costo), styles: { halign: 'right', fontSize: 7 } },
        { content: sf.cantVend ? fmtCant(sf.cantVend) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: sf.precio !== null ? fmt(sf.precio) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: sf.ingresos ? fmt(sf.ingresos) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: sf.costoVend ? fmt(sf.costoVend) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: sf.ganancia ? fmt(sf.ganancia) : '-', styles: { halign: 'right', fontSize: 7 } },
        { content: fmtCant(sf.stockActual), styles: { halign: 'right', fontSize: 7 } },
        { content: fmt(sf.valorActual), styles: { halign: 'right', fontSize: 7 } },
      ]);
    });
  });

  bodyRows.push([
    { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: TFILL } },
    { content: fmtCant(r.totales.compras), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: '', styles: { fillColor: TFILL } },
    { content: fmtCant(r.totales.ventas), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: '', styles: { fillColor: TFILL } },
    { content: fmt(r.totales.ingresos), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: fmt(r.totales.costo), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: fmt(r.totales.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: fmtCant(r.totales.stockFinal), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
    { content: fmt(r.totales.valorInv), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
  ]);

  autoTable(doc, {
    startY: 20,
    head: [
      ['Producto', 'Compras', 'Costo u.', 'Ventas', 'Precio u.', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor'],
    ],
    body: bodyRows,
    styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [33, 150, 243], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 21, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 21, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 21, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 17, halign: 'right' },
      9: { cellWidth: 22, halign: 'right' },
    },
    margin: { left: 10, right: 10 },
  });

  // ============ FOOTER EN TODAS LAS PÁGINAS ============
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text((ctx.nombreTienda || 'Tienda Pro') + '  ·  Generado ' + generadoTxt, 10, PH - 6);
    doc.text('Pagina ' + p + ' de ' + totalPages, PW - 10, PH - 6, { align: 'right' });
  }

  doc.save('cuadre-' + r._fechaI + '-' + r._fechaF + '.pdf');
}
