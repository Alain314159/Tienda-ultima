import fs from 'fs';

// ============ DB.JS: agregar tabla asientos (version 3) ============
let d = fs.readFileSync('src/db.js', 'utf8');

const v2End = `  gastos: 'id, fecha, categoria',
  config: 'key'
});`;

const v3Block = v2End + `

// Version 3: agrega libro diario
db.version(3).stores({
  productos: 'id, nombre, archivado',
  lotes: 'id, productoId, compraId, fecha',
  ventas: 'id, fecha, anulada',
  compras: 'id, productoId, fecha',
  ajustes: 'id, productoId, fecha',
  arqueos: 'id, fecha',
  movCaja: 'id, fecha, tipo',
  cierres: 'id, fechaCierre',
  capital: 'id, fecha',
  retiros: 'id, fecha',
  socios: 'id, nombre, aporte, porcentaje, fecha, activo',
  distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
  gastos: 'id, fecha, categoria',
  asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
  config: 'key'
});`;

if (d.includes('db.version(3)')) {
  console.log('SKIP db.js: ya tiene version 3');
} else if (!d.includes(v2End)) {
  console.log('SKIP db.js: no encontre v2End');
} else {
  d = d.replace(v2End, v3Block);
  fs.writeFileSync('src/db.js', d);
  console.log('OK db.js: version 3 con tabla asientos');
}

// buildData: agregar asientos
let d2 = fs.readFileSync('src/db.js', 'utf8');
if (!d2.includes('asientos: state.asientos')) {
  d2 = d2.replace(`    gastos: state.gastos
  });`, `    gastos: state.gastos,
    asientos: state.asientos
  });`);
  fs.writeFileSync('src/db.js', d2);
  console.log('OK db.js: buildData incluye asientos');
} else {
  console.log('SKIP db.js: buildData ya tiene asientos');
}

// ============ APP.VUE ============
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// 1. data: asientos + filtros + CUENTAS
rep(`      gastos: [],`,
`      gastos: [],
      asientos: [],
      filtroAsientoInicio: new Date().toISOString().split('T')[0],
      filtroAsientoFin: new Date().toISOString().split('T')[0],
      filtroAsientoCuenta: '',
      filtroAsientoTipo: '',
      CUENTAS: {
        CAJA: 'Caja',
        INVENTARIO: 'Inventario',
        VENTAS: 'Ventas',
        COSTO_VENTAS: 'Costo de ventas',
        GASTOS: 'Gastos operativos',
        MERMAS: 'Mermas',
        RETIROS: 'Retiros',
        CAPITAL: 'Capital',
        APORTES: 'Aportes',
        SOBRANTES: 'Sobrantes de arqueo',
        FALTANTES: 'Faltantes de arqueo'
      },`,
'data asientos');

// 2. computed: asientosFiltrados, balanza, cuentasLista
rep(`    movimientosRecientes() {`,
`    cuentasLista() {
      const set = {};
      this.asientos.forEach(a => { set[a.cuentaDebe] = 1; set[a.cuentaHaber] = 1; });
      return Object.keys(set).sort();
    },

    asientosFiltrados() {
      let list = this.asientos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      if (this.filtroAsientoInicio) {
        const i = new Date(this.filtroAsientoInicio);
        list = list.filter(a => new Date(a.fecha) >= i);
      }
      if (this.filtroAsientoFin) {
        const f = new Date(this.filtroAsientoFin);
        f.setHours(23, 59, 59, 999);
        list = list.filter(a => new Date(a.fecha) <= f);
      }
      if (this.filtroAsientoCuenta) {
        list = list.filter(a => a.cuentaDebe === this.filtroAsientoCuenta || a.cuentaHaber === this.filtroAsientoCuenta);
      }
      if (this.filtroAsientoTipo) {
        list = list.filter(a => a.refTipo === this.filtroAsientoTipo);
      }
      return list;
    },

    balanzaPorCuenta() {
      const map = {};
      this.asientosFiltrados.forEach(a => {
        if (!map[a.cuentaDebe]) map[a.cuentaDebe] = { cuenta: a.cuentaDebe, debe: 0, haber: 0 };
        if (!map[a.cuentaHaber]) map[a.cuentaHaber] = { cuenta: a.cuentaHaber, debe: 0, haber: 0 };
        map[a.cuentaDebe].debe += n(a.monto);
        map[a.cuentaHaber].haber += n(a.monto);
      });
      return Object.values(map).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
    },

    totalDebe() { return m(this.balanzaPorCuenta.reduce((s, b) => s + b.debe, 0)); },
    totalHaber() { return m(this.balanzaPorCuenta.reduce((s, b) => s + b.haber, 0)); },

    movimientosRecientes() {`,
'computed libro');

// 3. methods: crearAsientoObj + recrearAsiento* + regenerarAsientos + setMesAsientos
rep(`    // ===== GASTOS =====`,
`    // ===== LIBRO DIARIO =====
    setMesAsientos() {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      this.filtroAsientoInicio = inicio.toISOString().split('T')[0];
      this.filtroAsientoFin = now.toISOString().split('T')[0];
    },

    crearAsientoObj(fecha, descripcion, cuentaDebe, cuentaHaber, monto, refTipo, refId) {
      return {
        id: genId('as'),
        fecha,
        descripcion,
        cuentaDebe,
        cuentaHaber,
        monto: m(monto),
        refTipo,
        refId
      };
    },

    async borrarAsientosDe(refTipo, refId) {
      const existentes = this.asientos.filter(a => a.refTipo === refTipo && a.refId === refId);
      if (existentes.length === 0) return;
      await db.asientos.bulkDelete(existentes.map(a => a.id));
    },

    async recrearAsientoVenta(v) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('venta', v.id);
      await this.borrarAsientosDe('costo', v.id);
      if (v.anulada) return;
      const asientos = [this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id)];
      const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
      if (cogs > 0) {
        asientos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
      }
      await db.asientos.bulkPut(asientos.map(a => clean(a)));
    },

    async recrearAsientoCompra(c) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('compra', c.id);
      if (c.anulada) return;
      const as = this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id);
      await P(db.asientos, as);
    },

    async recrearAsientoGasto(g) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('gasto', g.id);
      if (g.saleDeCaja === false) return;
      const as = this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id);
      await P(db.asientos, as);
    },

    async recrearAsientoMerma(a) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('merma', a.id);
      if (n(a.cantidad) >= 0) return;
      const as = this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id);
      await P(db.asientos, as);
    },

    async recrearAsientoRetiro(r) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('retiro', r.id);
      const as = this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id);
      await P(db.asientos, as);
    },

    async recrearAsientoAporte(k) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('aporte', k.id);
      const as = this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id);
      await P(db.asientos, as);
    },

    async recrearAsientoArqueo(a) {
      const C = this.CUENTAS;
      await this.borrarAsientosDe('arqueo', a.id);
      const diff = n(a.diferencia);
      if (Math.abs(diff) < 0.01) return;
      let as;
      if (diff > 0) {
        as = this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id);
      } else {
        as = this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id);
      }
      await P(db.asientos, as);
    },

    regenerarAsientos() {
      this.confirm = {
        activo: true, titulo: 'Regenerar asientos',
        msg: 'Esto borrara TODOS los asientos actuales y los reconstruira desde cero. Continuar?',
        onOk: async () => {
          try {
            await db.asientos.clear();
            const C = this.CUENTAS;
            const nuevos = [];

            this.ventas.filter(v => !v.anulada).forEach(v => {
              nuevos.push(this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id));
              const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
              if (cogs > 0) {
                nuevos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
              }
            });

            this.compras.filter(c => !c.anulada).forEach(c => {
              nuevos.push(this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id));
            });

            this.gastos.forEach(g => {
              if (g.saleDeCaja === false) return;
              nuevos.push(this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id));
            });

            this.ajustes.filter(a => n(a.cantidad) < 0).forEach(a => {
              nuevos.push(this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id));
            });

            this.retiros.forEach(r => {
              nuevos.push(this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id));
            });

            this.capital.forEach(k => {
              nuevos.push(this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id));
            });

            this.arqueos.forEach(a => {
              const diff = n(a.diferencia);
              if (Math.abs(diff) < 0.01) return;
              if (diff > 0) {
                nuevos.push(this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id));
              } else {
                nuevos.push(this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id));
              }
            });

            if (nuevos.length > 0) {
              await db.asientos.bulkPut(nuevos.map(x => clean(x)));
            }
            await this.recargar(['asientos']);
            this.toastMsg('Asientos regenerados: ' + nuevos.length);
          } catch (e) {
            this.toastMsg('Error: ' + e.message, 'bad');
          }
        }
      };
    },

    // ===== GASTOS =====`,
'methods libro');

// 4. Hook en procesarVenta
rep(`        await this.recargar(['ventas', 'lotes']);
        this.carrito = [];`,
`        await this.recargar(['ventas', 'lotes']);
        await this.recrearAsientoVenta(venta);
        await this.recargar(['asientos']);
        this.carrito = [];`,
'hook procesarVenta');

// 5. Hook en anularVenta
rep(`              await this.recargar(['ventas', 'lotes']);
              this.toastMsg('Venta anulada');`,
`              await this.recargar(['ventas', 'lotes']);
              await this.recrearAsientoVenta(Object.assign({}, v, { anulada: true }));
              await this.recargar(['asientos']);
              this.toastMsg('Venta anulada');`,
'hook anularVenta');

// 6. Hook en guardarCompra (edit y nuevo)
rep(`          await this.recargar(['compras', 'lotes']);
          this.resetCompra();
          this.toastMsg('Compra ' + fmt(total));`,
`          await this.recargar(['compras', 'lotes']);
          const compraGuardada = this.compras.find(x => x.id === (f.editId || this.compras[0].id));
          if (compraGuardada) { await this.recrearAsientoCompra(compraGuardada); await this.recargar(['asientos']); }
          this.resetCompra();
          this.toastMsg('Compra ' + fmt(total));`,
'hook guardarCompra');

// 7. Hook en guardarGasto
rep(`      this.resetGasto();
      await this.recargar(['gastos', 'movCaja']);
    },`,
`      this.resetGasto();
      await this.recargar(['gastos', 'movCaja']);
      const gs = this.gastos.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (gs && (!f.editId || gs.id === f.editId)) { await this.recrearAsientoGasto(gs); await this.recargar(['asientos']); }
    },`,
'hook guardarGasto');

// 8. Hook en registrarAjuste (mermas)
rep(`        await this.recargar(['ajustes', 'lotes']);
        this.toastMsg('Merma registrada · pérdida ' + fmt(res.costoPerdida));`,
`        await this.recargar(['ajustes', 'lotes']);
        const mermaGuardada = this.ajustes.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
        if (mermaGuardada) { await this.recrearAsientoMerma(mermaGuardada); await this.recargar(['asientos']); }
        this.toastMsg('Merma registrada · pérdida ' + fmt(res.costoPerdida));`,
'hook registrarAjuste merma');

// 9. Hook en registrarRetiro
rep(`        await P(db.retiros, { id: genId('r'), fecha: new Date().toISOString(), monto, concepto: c });
        await this.recargar(['retiros']);
        this.retiroForm = { monto: '', concepto: '' };`,
`        await P(db.retiros, { id: genId('r'), fecha: new Date().toISOString(), monto, concepto: c });
        await this.recargar(['retiros']);
        const rGuardado = this.retiros.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
        if (rGuardado) { await this.recrearAsientoRetiro(rGuardado); await this.recargar(['asientos']); }
        this.retiroForm = { monto: '', concepto: '' };`,
'hook registrarRetiro');

// 10. Hook en registrarAporte
rep(`      await P(db.capital, { id: genId('k'), fecha: new Date().toISOString(), monto, nota: this.aporteForm.nota || '' });
      await this.recargar(['capital']);
      this.aporteForm = { monto: '', nota: '' };`,
`      await P(db.capital, { id: genId('k'), fecha: new Date().toISOString(), monto, nota: this.aporteForm.nota || '' });
      await this.recargar(['capital']);
      const kGuardado = this.capital.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (kGuardado) { await this.recrearAsientoAporte(kGuardado); await this.recargar(['asientos']); }
      this.aporteForm = { monto: '', nota: '' };`,
'hook registrarAporte');

// 11. Hook en registrarArqueo
rep(`      this.arqueoForm = { monto: '', nota: '' };
      this.arqueoPreview = { fisico: 0, diff: 0, class: 'cuadre' };
      await this.recargar(['arqueos', 'movCaja']);`,
`      this.arqueoForm = { monto: '', nota: '' };
      this.arqueoPreview = { fisico: 0, diff: 0, class: 'cuadre' };
      await this.recargar(['arqueos', 'movCaja']);
      const arqGuardado = this.arqueos.slice().sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
      if (arqGuardado) { await this.recrearAsientoArqueo(arqGuardado); await this.recargar(['asientos']); }`,
'hook registrarArqueo');

// 12. recargar map
rep(`        gastos: () => db.gastos.toArray()
      };`,
`        gastos: () => db.gastos.toArray(),
        asientos: () => db.asientos.toArray()
      };`,
'recargar asientos');

// 13. recargarTodo
rep(`        db.socios.toArray(), db.distribuciones.toArray(), db.gastos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos'].forEach((k, i) => this[k] = r[i]);`,
`        db.socios.toArray(), db.distribuciones.toArray(), db.gastos.toArray(),
        db.asientos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'].forEach((k, i) => this[k] = r[i]);`,
'recargarTodo asientos');

// 14. importarData tables
rep(`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos'];`,
`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'];`,
'importarData asientos');

// 15. Auto-regenerar asientos si estan vacios al iniciar
rep(`        const hash = location.hash.slice(1);
        const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos', 'contabilidad'];`,
`        if (this.asientos.length === 0 && (this.ventas.length > 0 || this.compras.length > 0 || this.gastos.length > 0)) {
          try {
            const C = this.CUENTAS;
            const nuevos = [];
            this.ventas.filter(v => !v.anulada).forEach(v => {
              nuevos.push(this.crearAsientoObj(v.fecha, 'Venta #' + v.id.slice(-6), C.CAJA, C.VENTAS, n(v.total), 'venta', v.id));
              const cogs = m(v.items.reduce((sum, it) => sum + n(it.costo), 0));
              if (cogs > 0) nuevos.push(this.crearAsientoObj(v.fecha, 'Costo venta #' + v.id.slice(-6), C.COSTO_VENTAS, C.INVENTARIO, cogs, 'costo', v.id));
            });
            this.compras.filter(c => !c.anulada).forEach(c => {
              nuevos.push(this.crearAsientoObj(c.fecha, 'Compra ' + (c.productoNombre || '') + ' #' + c.id.slice(-6), C.INVENTARIO, C.CAJA, n(c.total), 'compra', c.id));
            });
            this.gastos.forEach(g => {
              if (g.saleDeCaja === false) return;
              nuevos.push(this.crearAsientoObj(g.fecha, 'Gasto ' + g.categoria + ': ' + g.concepto, C.GASTOS, C.CAJA, n(g.monto), 'gasto', g.id));
            });
            this.ajustes.filter(a => n(a.cantidad) < 0).forEach(a => {
              nuevos.push(this.crearAsientoObj(a.fecha, 'Merma ' + (a.productoNombre || ''), C.MERMAS, C.INVENTARIO, n(a.costoPerdida), 'merma', a.id));
            });
            this.retiros.forEach(r => {
              nuevos.push(this.crearAsientoObj(r.fecha, 'Retiro: ' + (r.concepto || ''), C.RETIROS, C.CAJA, n(r.monto), 'retiro', r.id));
            });
            this.capital.forEach(k => {
              nuevos.push(this.crearAsientoObj(k.fecha, 'Aporte: ' + (k.nota || ''), C.CAJA, C.APORTES, n(k.monto), 'aporte', k.id));
            });
            this.arqueos.forEach(a => {
              const diff = n(a.diferencia);
              if (Math.abs(diff) < 0.01) return;
              if (diff > 0) nuevos.push(this.crearAsientoObj(a.fecha, 'Sobrante de arqueo', C.CAJA, C.SOBRANTES, diff, 'arqueo', a.id));
              else nuevos.push(this.crearAsientoObj(a.fecha, 'Faltante de arqueo', C.FALTANTES, C.CAJA, Math.abs(diff), 'arqueo', a.id));
            });
            if (nuevos.length > 0) {
              await db.asientos.bulkPut(nuevos.map(x => clean(x)));
              await this.recargar(['asientos']);
            }
          } catch (e) { console.error('auto asientos', e); }
        }

        const hash = location.hash.slice(1);
        const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos', 'contabilidad'];`,
'auto-generar asientos');

// 16. Template: card libro diario dentro de contabilidad
const cardLibro = `        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario ({{ asientosFiltrados.length }})</div>
          <div class="grid2" style="margin-bottom:.5rem">
            <input v-model="filtroAsientoInicio" type="date">
            <input v-model="filtroAsientoFin" type="date">
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="filtroAsientoInicio = filtroAsientoFin = new Date().toISOString().split('T')[0]">Hoy</button>
            <button class="btn ghost" style="margin-bottom:0;font-size:.72rem" @click="setMesAsientos()">Este mes</button>
          </div>
          <div class="grid2" style="margin-bottom:.5rem">
            <select v-model="filtroAsientoCuenta" style="font-size:.75rem">
              <option value="">Todas las cuentas</option>
              <option v-for="c in cuentasLista" :key="c" :value="c">{{ c }}</option>
            </select>
            <select v-model="filtroAsientoTipo" style="font-size:.75rem">
              <option value="">Todos los tipos</option>
              <option value="venta">Ventas</option>
              <option value="costo">Costo venta</option>
              <option value="compra">Compras</option>
              <option value="gasto">Gastos</option>
              <option value="merma">Mermas</option>
              <option value="retiro">Retiros</option>
              <option value="aporte">Aportes</option>
              <option value="arqueo">Arqueos</option>
            </select>
          </div>
          <button class="btn warn" style="margin-bottom:.5rem;font-size:.72rem" @click="regenerarAsientos()">
            <icon name="refresh" :size="14" color="#fff"></icon> Regenerar todos los asientos
          </button>

          <div v-if="asientosFiltrados.length === 0" class="empty">Sin asientos en el rango</div>
          <div v-else style="overflow-x:auto">
            <table class="cuadre-table" style="font-size:.7rem">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th style="text-align:left">Descripcion</th>
                  <th style="text-align:left">Debe</th>
                  <th style="text-align:left">Haber</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in asientosFiltrados" :key="a.id">
                  <td>{{ fmtFecha(a.fecha) }}</td>
                  <td style="text-align:left">{{ a.descripcion }}</td>
                  <td class="pos" style="text-align:left;font-size:.68rem">{{ a.cuentaDebe }}</td>
                  <td class="neg" style="text-align:left;font-size:.68rem">{{ a.cuentaHaber }}</td>
                  <td>{{ fmt(a.monto) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="balanzaPorCuenta.length" style="margin-top:1rem">
            <div class="card-title" style="margin-top:0"><icon name="chart" :size="18"></icon> Balanza de comprobacion</div>
            <div class="row" style="font-weight:800;font-size:.78rem"><span>Cuenta</span><span style="display:flex;gap:1.5rem"><span>Debe</span><span>Haber</span></span></div>
            <div v-for="b in balanzaPorCuenta" :key="b.cuenta" class="row" style="font-size:.72rem">
              <span>{{ b.cuenta }}</span>
              <span style="display:flex;gap:1.5rem"><span class="pos">{{ fmt(b.debe) }}</span><span class="neg">{{ fmt(b.haber) }}</span></span>
            </div>
            <div class="row total">
              <span>TOTALES</span>
              <span style="display:flex;gap:1.5rem"><span>{{ fmt(totalDebe) }}</span><span>{{ fmt(totalHaber) }}</span></span>
            </div>
            <div class="det" style="font-size:.7rem;text-align:center;margin-top:.3rem"
              :style="Math.abs(totalDebe - totalHaber) < 0.01 ? 'color:var(--ok)' : 'color:var(--bad)'">
              {{ Math.abs(totalDebe - totalHaber) < 0.01 ? 'OK: Cuadra' : 'DESCUADRE: ' + fmt(Math.abs(totalDebe - totalHaber)) }}
            </div>
          </div>
        </div>

      </section>`;

rep(`          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>
      </section>`,
`          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>

${cardLibro}`,
'template libro diario');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
