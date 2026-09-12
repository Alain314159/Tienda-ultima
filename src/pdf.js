import { fmt, fmtCant, fmtFH, n, m } from './db.js';

// Generar PDF del cuadre
export function generarPDFCuadre(cfg, resultado) {
  const { jsPDF } = window.jspdf || {};
  
  if (!jsPDF) {
    alert('Error: librería PDF no cargada');
    return false;
  }

  const doc = new jsPDF();
  const r = resultado;

  // Header
  doc.setFillColor(33, 150, 243);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(cfg.nombre || 'Tienda Pro', 14, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Cuadre: ' + r._fechaI + ' al ' + r._fechaF, 14, 22);

  // Resumen
  doc.setTextColor(0, 0, 0);
  doc.autoTable({
    startY: 32,
    head: [['Resumen', 'Monto']],
    body: [
      ['Ingresos', fmt(r.ingresos)],
      ['Costos (COGS)', '- ' + fmt(r.cogs)],
      ['Ganancia bruta', fmt(r.bruta) + ' (' + r.margenB + '%)'],
      ['Mermas', '- ' + fmt(r.mermas)],
      ['Gastos operativos', '- ' + fmt(r.gastos)],
      ['Ganancia neta', fmt(r.neta) + ' (' + r.margenN + '%)']
    ],
    headStyles: { fillColor: [33, 150, 243], textColor: 255 },
    theme: 'striped'
  });

  // Cuadre por producto
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Producto', 'Compras', 'Costo c/u', 'Ventas', 'Precio c/u', 'Costo vta', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor']],
    body: r.cuadre.map(row => [
      row.nombre,
      fmtCant(row.compras),
      fmt(row.costoCompra),
      fmtCant(row.ventas),
      fmt(row.precioVenta),
      fmt(row.costoVenta),
      fmt(row.ingresos),
      fmt(row.costo),
      fmt(row.ganancia),
      fmtCant(row.stockFinal),
      fmt(row.valorInv)
    ]),
    foot: [[
      'TOTAL',
      fmtCant(r.totales.compras),
      '',
      fmtCant(r.totales.ventas),
      '',
      '',
      fmt(r.totales.ingresos),
      fmt(r.totales.costo),
      fmt(r.totales.ganancia),
      fmtCant(r.totales.stockFinal),
      fmt(r.totales.valorInv)
    ]],
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [33, 150, 243], textColor: 255 },
    footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 14, halign: 'right' },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 14, halign: 'right' },
      10: { cellWidth: 18, halign: 'right' }
    }
  });

  // Footer en todas las páginas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Generado: ' + fmtFH(new Date().toISOString()) + ' · Página ' + i + ' de ' + pageCount, 14, 290);
  }

  doc.save('cuadre-' + r._fechaI + '-' + r._fechaF + '.pdf');
  return true;
}

// Compartir existencia
export async function compartirExistencia(cfg, productos, stockFn) {
  const lineas = productos
    .filter(p => !p.archivado)
    .map(p => p.nombre + ': ' + fmtCant(stockFn(p.id)));

  if (lineas.length === 0) {
    return { success: false, message: 'No hay productos' };
  }

  const texto = (cfg.nombre || 'Tienda Pro') + '\nExistencia al ' + fmtFecha(new Date().toISOString()) + '\n\n' + lineas.join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Existencia', text: texto });
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Compartir cancelado' };
    }
  } else {
    try {
      await navigator.clipboard.writeText(texto);
      return { success: true, message: 'Copiado al portapapeles' };
    } catch (e) {
      return { success: false, message: 'No se pudo compartir' };
    }
  }
}

// Importar fmtFecha localmente
import { fmtFecha } from './db.js';
