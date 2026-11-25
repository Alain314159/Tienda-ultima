import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// B7: redondeo en ganancia de venta
rep(`            ganancia: sub - f.costoTotal, lotesUsados: f.usados`,
`            ganancia: m(sub - f.costoTotal), lotesUsados: f.usados`,
'B7 ganancia item redondeo');

rep(`          tot = m(tot + sub);
          gan = gan + (sub - f.costoTotal);`,
`          tot = m(tot + sub);
          gan = m(gan + (sub - f.costoTotal));`,
'B7 ganancia venta redondeo');

// B8: redondeo en gananciaCarrito
rep(`        if (!f.error) gan += (n(it.precio) * n(it.cant)) - f.costoTotal;
      }
      return m(gan);`,
`        if (!f.error) gan = m(gan + ((n(it.precio) * n(it.cant)) - f.costoTotal));
      }
      return m(gan);`,
'B8 gananciaCarrito redondeo');

// B9: compra recien guardada por fecha
rep(`          const compraGuardada = this.compras.find(x => x.id === (f.editId || this.compras[0].id));`,
`          const compraGuardada = f.editId
            ? this.compras.find(x => x.id === f.editId)
            : this.compras.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];`,
'B9 compra guardada por fecha');

// B1: eliminar compra borra asiento
rep(`        onOk: async () => {
          const l = this.lotes.find(x => x.compraId === id);
          await db.transaction('rw', db.compras, db.lotes, async () => {
            await db.compras.delete(id);
            if (l) await db.lotes.delete(l.id);
          });
          await this.recargar(['compras', 'lotes']);
          this.toastMsg('Compra eliminada');
        }`,
`        onOk: async () => {
          const l = this.lotes.find(x => x.compraId === id);
          await db.transaction('rw', db.compras, db.lotes, db.asientos, async () => {
            await db.compras.delete(id);
            if (l) await db.lotes.delete(l.id);
            const as = this.asientos.filter(a => a.refTipo === 'compra' && a.refId === id);
            if (as.length > 0) await db.asientos.bulkDelete(as.map(a => a.id));
          });
          await this.recargar(['compras', 'lotes', 'asientos']);
          this.toastMsg('Compra eliminada');
        }`,
'B1 eliminar compra borra asiento');

// B2: eliminar gasto borra asiento + revierte pasivo si aplica
rep(`        onOk: async () => {
          await db.transaction('rw', db.gastos, db.movCaja, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
          });
          await this.recargar(['gastos', 'movCaja']);
          this.toastMsg('Gasto eliminado');
        }`,
`        onOk: async () => {
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
'B2 eliminar gasto borra asiento + revierte pasivo');

// B5: flujo de caja incluye capital inicial
rep(`    flujoEntradas() {
      const ventas = m(this.ventas.filter(v => !v.anulada).reduce((s,v) => s + n(v.total), 0));
      const aportes = this.aportesTotal;
      const sobrantes = m(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(ventas + aportes + sobrantes);
    },`,
`    flujoEntradas() {
      const capitalIni = n(this.cfg.capitalInicial);
      const ventas = m(this.ventas.filter(v => !v.anulada).reduce((s,v) => s + n(v.total), 0));
      const aportes = this.aportesTotal;
      const sobrantes = m(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(capitalIni + ventas + aportes + sobrantes);
    },`,
'B5 flujo capital inicial');

// B4: mostrar descuadre en Balance general
rep(`          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
        </div>`,
`          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
          <div class="row" :class="Math.abs(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'pos' : 'neg'">
            <span>Cuadre contable</span>
            <b>{{ Math.abs(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) }}</b>
          </div>
        </div>`,
'B4 descuadre visible en Balance');

// B10: resetear iso al cambiar fechas manualmente
rep(`            <input v-model="rep.fechaInicio" type="date">
            <input v-model="rep.fechaFin" type="date">`,
`            <input v-model="rep.fechaInicio" type="date" @input="rep.isoInicio = null; rep.isoFin = null">
            <input v-model="rep.fechaFin" type="date" @input="rep.isoInicio = null; rep.isoFin = null">`,
'B10 resetear ISO en input');

// B13: migrar gastos viejos (nota informativa)
// (no automatico, solo lo anotamos)

// B14: cuadre incluye productos archivados con stock
rep(`      const cuadre = this.productos.filter(p => !p.archivado).map(p => {`,
`      const cuadre = this.productos.filter(p => !p.archivado || this.stock(p.id) > 0).map(p => {`,
'B14 cuadre incluye archivados con stock');

// B15: eliminar pasivosTotal redundante (renombrar llamadas)
rep(`          <div class="row"><span>Pasivos</span><b>{{ fmt(pasivosTotal) }}</b></div>
          <div class="row total"><span>= ACTIVO NETO</span><span>{{ fmt(activosTotal - pasivosTotal) }}</span></div>`,
`          <div class="row"><span>Pasivos</span><b>{{ fmt(pasivosTotalReal) }}</b></div>
          <div class="row total"><span>= ACTIVO NETO</span><span>{{ fmt(activosTotal - pasivosTotalReal) }}</span></div>`,
'B15 usar pasivosTotalReal en Balance situacion');

rep(`          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>`,
`          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>`,
'B15b usar pasivosTotalReal en balance general');

rep(`            <b>{{ Math.abs(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(activosTotal - (pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal)) }}</b>`,
`            <b>{{ Math.abs(activosTotal - (pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal)) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(activosTotal - (pasivosTotalReal + capitalTotal + gananciasAcumuladas - retirosTotal)) }}</b>`,
'B15c usar pasivosTotalReal en cuadre contable');

rep(`    pasivosTotal() { return this.pasivosTotalReal; },

    pasivosActivos() {`,
`    pasivosActivos() {`,
'B15d eliminar pasivosTotal');

// ===== UI: quitar botón Ajustes del menú Más =====
rep(`      <div class="sheet-group">Sistema</div>
      <div class="sheet-grid">
        <button class="sheet-btn" style="grid-column:1/-1" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>
      </div>
    </div>`,
`    </div>`,
'UI quitar Ajustes del menu Mas');

// ===== UI: umbrales expandibles =====
// data flag
rep(`      importFile: null,
      _chart: null,
      _notifTimer: null`,
`      importFile: null,
      _chart: null,
      _notifTimer: null,
      umbralesAbierto: false,
      notifAvanzadoAbierto: false`,
'data umbralesAbierto');

// Reemplazar la seccion de umbrales con un boton colapsable
rep(`        <div class="set-group">Alertas y umbrales</div>
        <div class="set-row">
          <span class="lbl">Dias para cierre pendiente</span>
          <input v-model.number="cfg.umbralDiasCierre" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Mermas por semana (alerta)</span>
          <input v-model.number="cfg.umbralMermasSemana" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Faltantes por mes (alerta)</span>
          <input v-model.number="cfg.umbralFaltantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin backup (alerta)</span>
          <input v-model.number="cfg.umbralBackupDias" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Dias sin movimiento producto</span>
          <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Descuento maximo (%)</span>
          <input v-model.number="cfg.umbralDescuentoPct" type="number" min="0" max="100" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Sobrantes por mes (alerta)</span>
          <input v-model.number="cfg.umbralSobrantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>
        <div class="set-row">
          <span class="lbl">Stock minimo por defecto</span>
          <input v-model.number="cfg.stockMinDefault" type="number" min="0" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
        </div>

        <div class="set-group">Datos</div>`,
`        <div class="set-group" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center" @click="umbralesAbierto = !umbralesAbierto">
          <span>Alertas y umbrales</span>
          <icon name="chevron" :size="14" :color="mutColor" :style="umbralesAbierto ? 'transform:rotate(180deg)' : ''"></icon>
        </div>
        <div v-if="umbralesAbierto">
          <div class="set-row">
            <span class="lbl">Cierre pendiente (dias)</span>
            <input v-model.number="cfg.umbralDiasCierre" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Mermas por semana</span>
            <input v-model.number="cfg.umbralMermasSemana" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Faltantes por mes</span>
            <input v-model.number="cfg.umbralFaltantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Sobrantes por mes</span>
            <input v-model.number="cfg.umbralSobrantesMes" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Dias sin backup</span>
            <input v-model.number="cfg.umbralBackupDias" type="number" min="1" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Dias sin movimiento</span>
            <input v-model.number="cfg.umbralSinMovimientoDias" type="number" min="7" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Descuento maximo (%)</span>
            <input v-model.number="cfg.umbralDescuentoPct" type="number" min="0" max="100" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
          <div class="set-row">
            <span class="lbl">Stock minimo default</span>
            <input v-model.number="cfg.stockMinDefault" type="number" min="0" style="width:5rem;margin:0;padding:.3rem .5rem" @change="guardarCfg">
          </div>
        </div>

        <div class="set-group">Datos</div>`,
'UI umbrales expandibles');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
