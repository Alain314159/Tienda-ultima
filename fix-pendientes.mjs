import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// ============================================================
// CUENTAS nuevas (para B11 y B12)
// ============================================================
rep(`        PASIVOS: 'Cuentas por pagar',
        PAGO_PASIVOS: 'Pago de deudas'
      },`,
`        PASIVOS: 'Cuentas por pagar',
        PAGO_PASIVOS: 'Pago de deudas',
        RESULTADO: 'Resultado del ejercicio',
        GANANCIAS_ACUM: 'Ganancias acumuladas',
        SOBRANTES_INV: 'Sobrantes de inventario'
      },`,
'CUENTAS nuevas');

// ============================================================
// B6: pagarPasivo NO crea gasto (solo movCaja + asiento Pasivo/Caja)
// ============================================================
rep(`        onOk: async () => {
          try {
            const ahora = new Date().toISOString();
            const movId = genId('mc');
            await db.transaction('rw', db.pasivos, db.movCaja, db.gastos, db.asientos, async () => {
              await P(db.pasivos, Object.assign({}, p, { pagado: true, fechaPago: ahora, movPagoId: movId }));
              await P(db.movCaja, {
                id: movId,
                fecha: ahora,
                tipo: 'egreso',
                monto: n(p.monto),
                concepto: 'Pago deuda: ' + p.acreedor + ' - ' + p.concepto,
                nota: p.nota || ''
              });
              const gastoId = genId('g');
              await P(db.gastos, {
                id: gastoId,
                fecha: ahora,
                categoria: 'Otros',
                concepto: 'Pago deuda: ' + p.acreedor + ' - ' + p.concepto,
                monto: n(p.monto),
                nota: p.nota || '',
                metodoPago: 'efectivo',
                saleDeCaja: true,
                movId
              });
              const as = this.crearAsientoObj(ahora, 'Pago deuda ' + p.acreedor, this.CUENTAS.PASIVOS, this.CUENTAS.CAJA, n(p.monto), 'pago_pasivo', p.id);
              await P(db.asientos, as);
            });
            await this.recargar(['pasivos', 'movCaja', 'gastos', 'asientos']);
            this.toastMsg('Deuda pagada: ' + fmt(p.monto));
          } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
        }`,
`        onOk: async () => {
          try {
            const ahora = new Date().toISOString();
            const movId = genId('mc');
            await db.transaction('rw', db.pasivos, db.movCaja, db.asientos, async () => {
              await P(db.pasivos, Object.assign({}, p, { pagado: true, fechaPago: ahora, movPagoId: movId }));
              await P(db.movCaja, {
                id: movId,
                fecha: ahora,
                tipo: 'egreso',
                monto: n(p.monto),
                concepto: 'Pago deuda: ' + p.acreedor + ' - ' + p.concepto,
                nota: p.nota || ''
              });
              const as = this.crearAsientoObj(ahora, 'Pago deuda ' + p.acreedor, this.CUENTAS.PASIVOS, this.CUENTAS.CAJA, n(p.monto), 'pago_pasivo', p.id);
              await P(db.asientos, as);
            });
            await this.recargar(['pasivos', 'movCaja', 'asientos']);
            this.toastMsg('Deuda pagada: ' + fmt(p.monto));
          } catch (e) { this.toastMsg('Error: ' + e.message, 'bad'); }
        }`,
'B6 pagarPasivo sin gasto');

// B2 ajuste: eliminarGasto ya no revierte pasivo (porque no se crea)
rep(`        onOk: async () => {
          const esPagoPasivo = g.concepto && g.concepto.startsWith('Pago deuda:');
          await db.transaction('rw', db.gastos, db.movCaja, db.asientos, db.pasivos, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
            const as = this.asientos.filter(a => (a.refTipo === 'gasto' && a.refId === id) || (a.refTipo === 'pago_pasivo' && a.refId === id));
            if (as.length > 0) await db.asientos.bulkDelete(as.map(a => a.id));
            if (esPagoPasivo) {
              const pv = this.pasivos.find(p => p.movPagoId === g.movId);
              if (pv) {
                await P(db.pasivos, Object.assign({}, pv, { pagado: false, fechaPago: null, movPagoId: null }));
              }
            }
          });
          await this.recargar(['gastos', 'movCaja', 'asientos', 'pasivos']);
          this.toastMsg('Gasto eliminado');
        }`,
`        onOk: async () => {
          await db.transaction('rw', db.gastos, db.movCaja, db.asientos, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
            const as = this.asientos.filter(a => a.refTipo === 'gasto' && a.refId === id);
            if (as.length > 0) await db.asientos.bulkDelete(as.map(a => a.id));
          });
          await this.recargar(['gastos', 'movCaja', 'asientos']);
          this.toastMsg('Gasto eliminado');
        }`,
'B2b eliminarGasto simplificado');

// ============================================================
// B11: Asiento de cierre en cerrarPeriodo
// ============================================================
rep(`            this.cfg.periodoInicio = f.toISOString();
            await P(db.cierres, c);
            await this.guardarCfg();
            await this.recargar(['cierres']);
            this.toastMsg('Período cerrado · Ganancia ' + fmt(neta));`,
`            this.cfg.periodoInicio = f.toISOString();
            await db.transaction('rw', db.cierres, db.asientos, async () => {
              await P(db.cierres, c);
              if (Math.abs(neta) > 0.01) {
                const asCierre = this.crearAsientoObj(
                  f.toISOString(),
                  'Cierre periodo ' + fmtFecha(i.toISOString()) + ' - ' + fmtFecha(f.toISOString()),
                  this.CUENTAS.RESULTADO,
                  this.CUENTAS.GANANCIAS_ACUM,
                  Math.abs(neta),
                  'cierre',
                  c.id
                );
                await P(db.asientos, asCierre);
              }
            });
            await this.guardarCfg();
            await this.recargar(['cierres', 'asientos']);
            this.toastMsg('Período cerrado · Ganancia ' + fmt(neta));`,
'B11 asiento de cierre');

// ============================================================
// B12: Asiento de sobrante de inventario
// ============================================================
rep(`        const aj = { id: genId('a'), fecha: new Date().toISOString(), productoId: f.productoId, productoNombre: prod.nombre, cantidad: cant, motivo: f.motivo, costoPerdida: 0 };
        const lote = { id: genId('l'), compraId: 'aj-' + aj.id, productoId: f.productoId, productoNombre: prod.nombre, productoUnidad: prod.unidad || '', cantidadInicial: cant, cantidadVendida: 0, costo: cs, fecha: aj.fecha };
        await db.transaction('rw', db.ajustes, db.lotes, async () => {
          await P(db.ajustes, aj);
          await P(db.lotes, lote);
        });
        await this.recargar(['ajustes', 'lotes']);
        this.toastMsg('Sobrante registrado');`,
`        const aj = { id: genId('a'), fecha: new Date().toISOString(), productoId: f.productoId, productoNombre: prod.nombre, cantidad: cant, motivo: f.motivo, costoPerdida: 0 };
        const lote = { id: genId('l'), compraId: 'aj-' + aj.id, productoId: f.productoId, productoNombre: prod.nombre, productoUnidad: prod.unidad || '', cantidadInicial: cant, cantidadVendida: 0, costo: cs, fecha: aj.fecha };
        await db.transaction('rw', db.ajustes, db.lotes, db.asientos, async () => {
          await P(db.ajustes, aj);
          await P(db.lotes, lote);
          if (cs > 0) {
            const asSob = this.crearAsientoObj(aj.fecha, 'Sobrante inventario ' + prod.nombre, this.CUENTAS.INVENTARIO, this.CUENTAS.SOBRANTES_INV, m(cant * cs), 'ajuste', aj.id);
            await P(db.asientos, asSob);
          }
        });
        await this.recargar(['ajustes', 'lotes', 'asientos']);
        this.toastMsg('Sobrante registrado');`,
'B12 asiento de sobrante');

// ============================================================
// B13: Migrar gastos viejos automaticamente en inicializar
// ============================================================
rep(`        if (this.asientos.length === 0 && (this.ventas.length > 0 || this.compras.length > 0 || this.gastos.length > 0)) {`,
`        // B13: migrar gastos viejos de movCaja a la tabla gastos
        try {
          const movsGasto = this.movCaja.filter(mv =>
            mv.tipo === 'egreso' &&
            mv.concepto &&
            /gasto/i.test(mv.concepto) &&
            !mv.concepto.startsWith('Pago deuda:') &&
            !mv.concepto.startsWith('Gasto:')
          );
          const gastosConMov = new Set(this.gastos.filter(g => g.movId).map(g => g.movId));
          const aMigrar = movsGasto.filter(mv => !gastosConMov.has(mv.id));
          if (aMigrar.length > 0) {
            const nuevosGastos = aMigrar.map(mv => {
              const cat = /luz/i.test(mv.concepto) ? 'Luz' :
                          /agua/i.test(mv.concepto) ? 'Agua' :
                          /alquiler|renta/i.test(mv.concepto) ? 'Alquiler' :
                          /internet|wifi/i.test(mv.concepto) ? 'Internet' :
                          /transport/i.test(mv.concepto) ? 'Transporte' :
                          /publicid|anuncio/i.test(mv.concepto) ? 'Publicidad' :
                          /mantenim|reparac/i.test(mv.concepto) ? 'Mantenimiento' :
                          /limpiez/i.test(mv.concepto) ? 'Limpieza' : 'Otros';
              return {
                id: genId('g'),
                fecha: mv.fecha,
                categoria: cat,
                concepto: mv.concepto,
                monto: n(mv.monto),
                nota: mv.nota || '',
                metodoPago: 'efectivo',
                saleDeCaja: true,
                movId: mv.id,
                migrado: true
              };
            });
            await db.gastos.bulkPut(nuevosGastos.map(x => clean(x)));
            this.gastos = await db.gastos.toArray();
            this.toastMsg('Migrados ' + aMigrar.length + ' gasto(s) antiguos');
          }
        } catch (e) { console.error('migrar gastos', e); }

        if (this.asientos.length === 0 && (this.ventas.length > 0 || this.compras.length > 0 || this.gastos.length > 0)) {`,
'B13 migrar gastos viejos');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
