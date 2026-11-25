import fs from 'fs';

// ============ 1. INDEX.HTML: Eruda sin auto-carga ============
let h = fs.readFileSync('index.html', 'utf8');
const autoLoad = `  <!-- ERUDA TEMPORAL: consola móvil para diagnóstico -->
  <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
  <script>eruda.init();</script>`;
if (h.includes(autoLoad)) {
  h = h.replace(autoLoad, `  <!-- Eruda: se carga dinamicamente desde Ajustes cuando se activa -->
  <script>
    window.__loadEruda = function() {
      if (window.eruda) { try { window.eruda.init(); } catch(e){} return; }
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
      sc.onload = function() { try { window.eruda.init(); } catch(e){} };
      document.head.appendChild(sc);
    };
    window.__unloadEruda = function() {
      if (window.eruda && window.eruda.destroy) { try { window.eruda.destroy(); } catch(e){} }
    };
  </script>`);
  fs.writeFileSync('index.html', h);
  console.log('OK index.html: Eruda sin auto-carga');
} else if (h.includes('window.__loadEruda')) {
  console.log('SKIP index.html: ya tiene Eruda dinamico');
} else {
  console.log('SKIP index.html: no encontre el auto-load de Eruda');
}

// ============ 2. APP.VUE ============
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// cfg: erudaActivo
rep(`        notifActivo: false,`,
`        notifActivo: false,
        erudaActivo: false,`,
'cfg erudaActivo');

// methods: toggleEruda
rep(`    // ===== NOTIFICACIONES =====`,
`    // ===== ERUDA =====
    toggleEruda() {
      try {
        if (this.cfg.erudaActivo) {
          if (window.__loadEruda) window.__loadEruda();
          else {
            const sc = document.createElement('script');
            sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
            sc.onload = () => { try { window.eruda.init(); } catch(e){} };
            document.head.appendChild(sc);
          }
          this.toastMsg('Consola activada');
        } else {
          if (window.__unloadEruda) window.__unloadEruda();
          this.toastMsg('Consola desactivada');
        }
        this.guardarCfg();
      } catch (e) { console.error('toggleEruda', e); }
    },

    // ===== NOTIFICACIONES =====`,
'method toggleEruda');

// Ajustes: switch Eruda (dentro de seccion Informacion, antes)
rep(`        <div class="set-group">Información</div>`,
`        <div class="set-group">Avanzado</div>
        <div class="set-row">
          <span class="lbl"><icon name="settings" :size="18"></icon> Consola de desarrollo</span>
          <label class="switch">
            <input type="checkbox" v-model="cfg.erudaActivo" @change="toggleEruda">
            <span class="slider"></span>
          </label>
        </div>
        <div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">
          Activa la consola Eruda para depurar. Dejalo desactivado si no la necesitas.
        </div>

        <div class="set-group">Información</div>`,
'ajustes switch eruda');

// ===== C3: cerrarPeriodo enriquecido =====
rep(`            const c = {
              id: genId('z'),
              periodo: fmtFecha(this.cfg.periodoInicio) + ' - ' + fmtFecha(new Date().toISOString()),
              fechaCierre: new Date().toISOString(),
              totalVentas: this.ventasPeriodo,
              totalCompras: this.comprasPeriodo,
              ganancia: this.gananciaNetaPeriodo
            };
            this.cfg.periodoInicio = new Date().toISOString();
            await P(db.cierres, c);
            await this.guardarCfg();
            await this.recargar(['cierres']);
            this.toastMsg('Período cerrado');`,
`            const i = new Date(this.cfg.periodoInicio);
            const f = new Date();
            const ventasRango = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= i && new Date(v.fecha) <= f);
            const comprasRango = this.compras.filter(c => !c.anulada && new Date(c.fecha) >= i && new Date(c.fecha) <= f);
            const gastosRango = this.gastos.filter(g => new Date(g.fecha) >= i && new Date(g.fecha) <= f);
            const mermasRango = this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= i && new Date(a.fecha) <= f);

            const totVentas = m(ventasRango.reduce((s, v) => s + n(v.total), 0));
            const cogs = m(ventasRango.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
            const bruta = m(totVentas - cogs);
            const totGastos = m(gastosRango.reduce((s, g) => s + n(g.monto), 0));
            const totMermas = m(mermasRango.reduce((s, a) => s + n(a.costoPerdida), 0));
            const neta = m(bruta - totGastos - totMermas);

            const c = {
              id: genId('z'),
              periodo: fmtFecha(i.toISOString()) + ' - ' + fmtFecha(f.toISOString()),
              fechaCierre: f.toISOString(),
              periodoInicio: i.toISOString(),
              periodoFin: f.toISOString(),
              totalVentas: totVentas,
              totalCompras: m(comprasRango.reduce((s, c2) => s + n(c2.total), 0)),
              cogs,
              bruta,
              gastos: totGastos,
              mermas: totMermas,
              ganancia: neta,
              numVentas: ventasRango.length,
              numCompras: comprasRango.length,
              numGastos: gastosRango.length,
              numMermas: mermasRango.length,
              cajaAlCierre: this.saldoCaja,
              inventarioAlCierre: this.valorInventario,
              capitalAlCierre: this.capitalTotal,
              cerrado: true
            };
            this.cfg.periodoInicio = f.toISOString();
            await P(db.cierres, c);
            await this.guardarCfg();
            await this.recargar(['cierres']);
            this.toastMsg('Período cerrado · Ganancia ' + fmt(neta));`,
'cerrarPeriodo enriquecido');

// Template: historial de cierres (Reportes) - mostrar mas datos
rep(`          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>

        <!-- CUADRE POR PERÍODO`,
`          <div v-for="c in cierresOrdenados" :key="c.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
              <div class="nm">{{ c.periodo }}</div>
              <b :class="c.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(c.ganancia) }}</b>
            </div>
            <div class="det" style="font-size:.72rem">
              Cerrado {{ fmtFecha(c.fechaCierre) }}
              <span v-if="c.numVentas !== undefined"> · {{ c.numVentas }} venta(s)</span>
            </div>
            <div v-if="c.cogs !== undefined" style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;font-size:.7rem;margin-top:.2rem">
              <div style="color:var(--mut)">Ventas: <b style="color:var(--ok)">{{ fmt(c.totalVentas) }}</b></div>
              <div style="color:var(--mut)">COGS: <b style="color:var(--bad)">-{{ fmt(c.cogs) }}</b></div>
              <div style="color:var(--mut)">Gastos: <b style="color:var(--bad)">-{{ fmt(c.gastos) }}</b></div>
              <div style="color:var(--mut)">Mermas: <b style="color:var(--bad)">-{{ fmt(c.mermas) }}</b></div>
            </div>
          </div>
        </div>

        <!-- CUADRE POR PERÍODO`,
'historial cierres Reportes');

// Template: historial de cierres (Contabilidad) - mostrar mas datos
rep(`          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario`,
`          <div v-for="c in cierresOrdenados" :key="c.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
              <div class="nm">{{ c.periodo }}</div>
              <b :class="c.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(c.ganancia) }}</b>
            </div>
            <div class="det" style="font-size:.72rem">
              Cerrado {{ fmtFecha(c.fechaCierre) }}
              <span v-if="c.numVentas !== undefined"> · {{ c.numVentas }} venta(s)</span>
            </div>
            <div v-if="c.cogs !== undefined" style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;font-size:.7rem;margin-top:.2rem">
              <div style="color:var(--mut)">Ventas: <b style="color:var(--ok)">{{ fmt(c.totalVentas) }}</b></div>
              <div style="color:var(--mut)">COGS: <b style="color:var(--bad)">-{{ fmt(c.cogs) }}</b></div>
              <div style="color:var(--mut)">Gastos: <b style="color:var(--bad)">-{{ fmt(c.gastos) }}</b></div>
              <div style="color:var(--mut)">Mermas: <b style="color:var(--bad)">-{{ fmt(c.mermas) }}</b></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario`,
'historial cierres Contabilidad');

fs.writeFileSync(APP, s);
console.log('\n=== APP.VUE ===');
log.forEach(l => console.log(l));
