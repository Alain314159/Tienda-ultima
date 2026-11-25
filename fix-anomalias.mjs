import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// ===== 1. cfg: agregar umbrales =====
rep(`        ultimoBackupAuto: null,
        ultimoExport: null
      },`,
`        ultimoBackupAuto: null,
        ultimoExport: null,
        umbralDiasCierre: 30,
        umbralMermasSemana: 3,
        umbralFaltantesMes: 2,
        umbralBackupDias: 7,
        umbralSinMovimientoDias: 60
      },`,
'cfg umbrales');

// ===== 2. Computed anomalias =====
rep(`    ultimaActividad() {`,
`    anomalias() {
      const out = [];
      const ahora = new Date();
      const hace7d = new Date(ahora.getTime() - 7 * 86400000);
      const hace30d = new Date(ahora.getTime() - 30 * 86400000);
      const umbralSinMov = new Date(ahora.getTime() - n(this.cfg.umbralSinMovimientoDias || 60) * 86400000);

      // 1. Caja negativa
      if (this.saldoCaja < -0.01) {
        out.push({ nivel: 'alta', icono: 'alert', titulo: 'Caja en negativo', detalle: fmt(this.saldoCaja), sec: 'caja' });
      }

      // 2. Ventas bajo costo
      const ventasBajoCosto = this.ventas.filter(v => !v.anulada && new Date(v.fecha) >= hace30d)
        .flatMap(v => v.items.filter(it => it.ganancia < 0).map(it => ({ venta: v, item: it })));
      if (ventasBajoCosto.length > 0) {
        const totalPerdido = m(ventasBajoCosto.reduce((s, x) => s + n(x.item.ganancia), 0));
        out.push({ nivel: 'alta', icono: 'trend', titulo: ventasBajoCosto.length + ' venta(s) bajo costo', detalle: 'Perdida: ' + fmt(totalPerdido), sec: 'ventas' });
      }

      // 3. Stock negativo
      const stockNeg = this.productos.filter(p => !p.archivado && this.stock(p.id) < -0.001);
      if (stockNeg.length > 0) {
        out.push({ nivel: 'alta', icono: 'package', titulo: stockNeg.length + ' producto(s) con stock negativo', detalle: stockNeg.slice(0,3).map(p => p.nombre).join(', '), sec: 'inventario' });
      }

      // 4. Mermas frecuentes
      const mermasSemana = {};
      this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= hace7d).forEach(a => {
        mermasSemana[a.productoId] = (mermasSemana[a.productoId] || 0) + 1;
      });
      Object.keys(mermasSemana).forEach(pid => {
        if (mermasSemana[pid] >= n(this.cfg.umbralMermasSemana || 3)) {
          const p = this.productos.find(x => x.id === pid);
          out.push({ nivel: 'media', icono: 'alert', titulo: (p ? p.nombre : 'Producto') + ': mermas frecuentes', detalle: mermasSemana[pid] + ' mermas en 7 dias', sec: 'inventario' });
        }
      });

      // 5. Faltantes repetidos
      const faltantes = this.movCaja.filter(mv => mv.concepto && mv.concepto.includes('Faltante') && new Date(mv.fecha) >= hace30d);
      if (faltantes.length >= n(this.cfg.umbralFaltantesMes || 2)) {
        const total = m(faltantes.reduce((s, f) => s + n(f.monto), 0));
        out.push({ nivel: 'media', icono: 'wallet', titulo: faltantes.length + ' faltantes de caja en 30 dias', detalle: 'Total: ' + fmt(total), sec: 'caja' });
      }

      // 6. Compras con costo elevado
      this.productos.filter(p => !p.archivado).forEach(p => {
        const comprasProd = this.compras.filter(c => c.productoId === p.id).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
        if (comprasProd.length < 2) return;
        const ult = n(comprasProd[0].costo);
        const prom = comprasProd.slice(1, 6).reduce((s, c) => s + n(c.costo), 0) / Math.min(comprasProd.length - 1, 5);
        if (prom > 0 && ult > prom * 1.5) {
          out.push({ nivel: 'baja', icono: 'bag', titulo: p.nombre + ': compra ' + ((ult/prom - 1) * 100).toFixed(0) + '% mas caro', detalle: fmt(ult) + ' vs ' + fmt(prom) + ' promedio', sec: 'compras' });
        }
      });

      // 7. Ventas anuladas recientes
      const anuladas30 = this.ventas.filter(v => v.anulada && v.fechaAnulacion && new Date(v.fechaAnulacion) >= hace30d);
      if (anuladas30.length > 3) {
        out.push({ nivel: 'baja', icono: 'x', titulo: anuladas30.length + ' ventas anuladas en 30 dias', detalle: 'Revisar historial', sec: 'ventas' });
      }

      // 8. Productos sin movimiento con stock
      const sinMov = this.productos.filter(p => !p.archivado && this.stock(p.id) > 0 && !this.ventas.some(v => !v.anulada && new Date(v.fecha) >= umbralSinMov && v.items.some(it => it.productoId === p.id)));
      if (sinMov.length > 0) {
        out.push({ nivel: 'baja', icono: 'package', titulo: sinMov.length + ' producto(s) sin movimiento', detalle: 'Con stock, sin ventas en ' + (this.cfg.umbralSinMovimientoDias || 60) + ' dias', sec: 'inventario' });
      }

      // 9. Cierre pendiente
      const ultimoCierre = this.cierres.length > 0 ? Math.max(...this.cierres.map(c => new Date(c.fechaCierre).getTime())) : new Date(this.cfg.periodoInicio).getTime();
      const diasSinCierre = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
      if (diasSinCierre >= n(this.cfg.umbralDiasCierre || 30)) {
        out.push({ nivel: 'media', icono: 'calendar', titulo: 'Cierre pendiente', detalle: diasSinCierre + ' dias sin cerrar periodo', sec: 'reportes' });
      }

      // 10. Backup viejos
      if (this.ultimoBackup && this.ultimoBackup.fecha) {
        const diasSinBackup = Math.floor((ahora.getTime() - new Date(this.ultimoBackup.fecha).getTime()) / 86400000);
        if (diasSinBackup >= n(this.cfg.umbralBackupDias || 7)) {
          out.push({ nivel: 'baja', icono: 'download', titulo: 'Backup antiguo', detalle: diasSinBackup + ' dias desde el ultimo backup', sec: 'ajustes' });
        }
      }

      const orden = { alta: 0, media: 1, baja: 2 };
      return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    },

    anomaliasCriticas() {
      return this.anomalias.filter(a => a.nivel === 'alta').length;
    },

    ultimaActividad() {`,
'computed anomalias');

// ===== 3. Card en Dashboard, antes de "Última actividad" =====
rep(`        <div class="card">
          <div class="det" style="font-size:.78rem;color:var(--mut)">
            Última actividad: <b style="color:var(--txt)">{{ ultimaActividad }}</b>
          </div>
        </div>`,
`        <div class="card" v-if="anomalias.length">
          <div class="card-title">
            <icon name="alert" :size="18" :color="anomaliasCriticas > 0 ? '#dc2626' : '#d97706'"></icon>
            Anomalias ({{ anomalias.length }})
            <span v-if="anomaliasCriticas > 0" class="badge out" style="margin-left:auto">{{ anomaliasCriticas }} criticas</span>
          </div>
          <div v-for="(a, i) in anomalias.slice(0, 5)" :key="i" class="item" style="cursor:pointer" @click="ir(a.sec)">
            <div class="info">
              <div class="nm">
                <span class="badge" :class="a.nivel === 'alta' ? 'out' : (a.nivel === 'media' ? 'low' : 'arch')" style="margin-right:.3rem">{{ a.nivel.toUpperCase() }}</span>
                {{ a.titulo }}
              </div>
              <div class="det">{{ a.detalle }}</div>
            </div>
            <icon name="chevron" :size="14" :color="mutColor" style="transform:rotate(-90deg)"></icon>
          </div>
          <div v-if="anomalias.length > 5" class="det" style="text-align:center;margin-top:.4rem;font-size:.72rem;color:var(--mut)">
            + {{ anomalias.length - 5 }} mas
          </div>
        </div>

        <div class="card">
          <div class="det" style="font-size:.78rem;color:var(--mut)">
            Última actividad: <b style="color:var(--txt)">{{ ultimaActividad }}</b>
          </div>
        </div>`,
'card anomalias dashboard');

// ===== 4. Config umbrales en Ajustes =====
rep(`        <div class="set-group">Datos</div>
        <button class="btn pri" @click="exportar">`,
`        <div class="set-group">Alertas y umbrales</div>
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

        <div class="set-group">Datos</div>
        <button class="btn pri" @click="exportar">`,
'config umbrales');

// ===== 5. Badge critico en nav "Inicio" =====
rep(`      <button :class="{ activo: sec === 'dashboard' }" @click="ir('dashboard')">
        <icon name="home" :size="22" :color="sec === 'dashboard' ? '#2196F3' : '#6b7280'"></icon><span>Inicio</span>
      </button>`,
`      <button :class="{ activo: sec === 'dashboard' }" @click="ir('dashboard')" style="position:relative">
        <icon name="home" :size="22" :color="sec === 'dashboard' ? '#2196F3' : '#6b7280'"></icon><span>Inicio</span>
        <span v-if="anomaliasCriticas > 0" class="nav-dot"></span>
      </button>`,
'badge nav Inicio');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
