import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');

const startIdx = s.indexOf('    generarPDFCuadre() {');
if (startIdx < 0) { console.log('❌ No encontré generarPDFCuadre'); process.exit(1); }

// Buscar el cierre del método (el "}," antes de "// ===== SOCIOS =====")
const marker = '// ===== SOCIOS =====';
const endIdx = s.indexOf(marker, startIdx);
if (endIdx < 0) { console.log('❌ No encontré el cierre'); process.exit(1); }

const nuevoMetodo = `    generarPDFCuadre() {
      const r = this.rep.resultado;
      if (!r) return;

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
      doc.text(this.cfg.nombre || 'Tienda Pro', 14, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Cuadre por periodo', 14, 21);
      doc.setFontSize(8);
      doc.text('Periodo: ' + r._fechaI + ' al ' + r._fechaF, 14, 27);
      doc.text('Generado: ' + generadoTxt, PW - 14, 27, { align: 'right' });

      // --- Resumen financiero ---
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen financiero', 14, 44);

      const rowHighlight = (label) => {
        if (label === 'GANANCIA BRUTA') return { fontStyle: 'bold', fillColor: [230, 240, 255] };
        if (label === 'GANANCIA NETA') return { fontStyle: 'bold', fillColor: [220, 252, 231] };
        return null;
      };

      autoTable(doc, {
        startY: 48,
        head: [['Concepto', 'Monto']],
        body: [
          ['Ingresos por ventas', fmt(r.ingresos)],
          ['Costo de lo vendido (COGS)', '- ' + fmt(r.cogs)],
          ['GANANCIA BRUTA', fmt(r.bruta) + '  (' + r.margenB + '%)'],
          ['Gastos operativos', '- ' + fmt(r.gastos)],
          ['Mermas', '- ' + fmt(r.mermas)],
          ['GANANCIA NETA', fmt(r.neta) + '  (' + r.margenN + '%)']
        ],
        theme: 'grid',
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 76, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          const hl = rowHighlight(label);
          if (hl) Object.assign(data.cell.styles, hl);
        }
      });

      // --- Situación financiera ---
      let y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Situacion financiera', 14, y);

      autoTable(doc, {
        startY: y + 4,
        head: [['Concepto', 'Monto']],
        body: [
          ['Caja (efectivo disponible)', fmt(this.saldoCaja)],
          ['Valor del inventario', fmt(this.valorInventario)],
          ['ACTIVOS TOTALES', fmt(this.saldoCaja + this.valorInventario)],
          ['Capital (inicial + aportes)', fmt(this.capitalTotal)],
          ['Ganancias acumuladas', fmt(this.gananciasAcumuladas)],
          ['PATRIMONIO', fmt(this.patrimonioTotal)],
          ['Disponible para retiro', fmt(this.gananciaDisponible)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 76, halign: 'right' } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const label = data.row.raw[0];
          if (label === 'ACTIVOS TOTALES' || label === 'PATRIMONIO') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 240, 255];
          }
        }
      });

      // --- Reparto entre socios ---
      if (this.sociosActivos.length > 0) {
        y = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Reparto entre socios', 14, y);

        const socioRows = this.sociosActivos.map(sc => [
          sc.nombre,
          n(sc.porcentaje).toFixed(2) + '%',
          fmt(r.neta * n(sc.porcentaje) / 100)
        ]);
        socioRows.push(['TOTAL', '100.00%', fmt(r.neta)]);

        autoTable(doc, {
          startY: y + 4,
          head: [['Socio', '% Participacion', 'Monto a recibir']],
          body: socioRows,
          theme: 'grid',
          headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 10 },
          styles: { fontSize: 10, cellPadding: 3 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50, halign: 'center' }, 2: { cellWidth: 56, halign: 'right' } },
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            if (data.row.raw[0] === 'TOTAL') {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [240, 235, 255];
            }
          }
        });
      }

      // ============ PÁGINA 2+: TABLA POR PRODUCTO ============
      doc.addPage();
      doc.setFillColor(33, 150, 243);
      doc.rect(0, 0, PW, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle por producto', 14, 13);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text((this.cfg.nombre || '') + '  ·  ' + r._fechaI + ' al ' + r._fechaF, PW - 14, 13, { align: 'right' });

      const PFILL = [235, 244, 255];
      const TFILL = [229, 231, 235];

      const bodyRows = [];
      r.cuadre.forEach(row => {
        bodyRows.push([
          { content: row.nombre, styles: { fontStyle: 'bold', fillColor: PFILL } },
          { content: '', styles: { fillColor: PFILL } },
          { content: fmtCant(row.compras), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.costoCompra), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmtCant(row.ventas), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.precioVenta), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.ingresos), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.costo), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: PFILL } },
          { content: fmtCant(row.stockFinal), styles: { halign: 'right', fillColor: PFILL } },
          { content: fmt(row.valorInv), styles: { halign: 'right', fillColor: PFILL } }
        ]);
        row.subfilas.forEach(sf => {
          bodyRows.push([
            { content: '', styles: { fontSize: 7 } },
            { content: '  -> ' + fmt(sf.costo) + (sf.precio !== null ? ' -> ' + fmt(sf.precio) : ' (sin ventas)'), styles: { fontSize: 7, textColor: [33, 150, 243] } },
            { content: sf.comprasCant ? fmtCant(sf.comprasCant) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: fmt(sf.costo), styles: { halign: 'right', fontSize: 7 } },
            { content: sf.cantVend ? fmtCant(sf.cantVend) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.precio !== null ? fmt(sf.precio) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.ingresos ? fmt(sf.ingresos) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.costoVend ? fmt(sf.costoVend) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: sf.ganancia ? fmt(sf.ganancia) : '-', styles: { halign: 'right', fontSize: 7 } },
            { content: fmtCant(sf.stockActual), styles: { halign: 'right', fontSize: 7 } },
            { content: fmt(sf.valorActual), styles: { halign: 'right', fontSize: 7 } }
          ]);
        });
      });

      bodyRows.push([
        { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmtCant(r.totales.compras), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmtCant(r.totales.ventas), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: '', styles: { fillColor: TFILL } },
        { content: fmt(r.totales.ingresos), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.costo), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.ganancia), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmtCant(r.totales.stockFinal), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } },
        { content: fmt(r.totales.valorInv), styles: { halign: 'right', fontStyle: 'bold', fillColor: TFILL } }
      ]);

      autoTable(doc, {
        startY: 26,
        head: [['Producto', 'Detalle', 'Compras', 'Costo u.', 'Ventas', 'Precio u.', 'Ingresos', 'Costo', 'Ganancia', 'Stock', 'Valor']],
        body: bodyRows,
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [33, 150, 243], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 26, textColor: [100, 100, 100] },
          2: { cellWidth: 13, halign: 'right' },
          3: { cellWidth: 15, halign: 'right' },
          4: { cellWidth: 13, halign: 'right' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 14, halign: 'right' },
          8: { cellWidth: 17, halign: 'right' },
          9: { cellWidth: 12, halign: 'right' },
          10: { cellWidth: 15, halign: 'right' }
        },
        margin: { left: 10, right: 10 }
      });

      // ============ FOOTER EN TODAS LAS PÁGINAS ============
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text((this.cfg.nombre || 'Tienda Pro') + '  ·  Generado ' + generadoTxt, 10, PH - 6);
        doc.text('Pagina ' + p + ' de ' + totalPages, PW - 10, PH - 6, { align: 'right' });
      }

      doc.save('cuadre-' + r._fechaI + '-' + r._fechaF + '.pdf');
      this.toastMsg('PDF generado');
    },

`;

s = s.slice(0, startIdx) + nuevoMetodo + s.slice(endIdx);
fs.writeFileSync(APP, s);
console.log('OK generarPDFCuadre reescrito');
