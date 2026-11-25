import fs from 'fs';

// ============ DB.JS: agregar tabla gastos (version 2) ============
let d = fs.readFileSync('src/db.js', 'utf8');
const storesV1 = `db.version(1).stores({
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
  config: 'key'
});`;

const storesV2 = storesV1 + `

// Version 2: agrega gastos operativos
db.version(2).stores({
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
  config: 'key'
});`;

if (!d.includes(storesV1)) {
  console.log('SKIP db.js: storesV1 no encontrado');
} else if (d.includes('db.version(2)')) {
  console.log('SKIP db.js: ya tiene version 2');
} else {
  d = d.replace(storesV1, storesV2);
  fs.writeFileSync('src/db.js', d);
  console.log('OK db.js: agregada version 2 con tabla gastos');
}

// buildData: agregar gastos
let d2 = fs.readFileSync('src/db.js', 'utf8');
if (!d2.includes('gastos: state.gastos')) {
  d2 = d2.replace(`    socios: state.socios,
    distribuciones: state.distribuciones
  });`, `    socios: state.socios,
    distribuciones: state.distribuciones,
    gastos: state.gastos
  });`);
  fs.writeFileSync('src/db.js', d2);
  console.log('OK db.js: buildData incluye gastos');
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

// Data: gastos + gastoForm
rep(`      socios: [],
      distribuciones: [],`,
`      socios: [],
      distribuciones: [],
      gastos: [],`,
'data gastos');

rep(`      socioForm: { editId: '', nombre: '', porcentaje: '', aporte: '' },
      repartoForm: { monto: '', concepto: '' },`,
`      socioForm: { editId: '', nombre: '', porcentaje: '', aporte: '' },
      repartoForm: { monto: '', concepto: '' },
      gastoForm: { editId: '', fecha: new Date().toISOString().split('T')[0], categoria: '', concepto: '', monto: '', nota: '', metodoPago: 'efectivo', saleDeCaja: true },`,
'data gastoForm');

// masActivo: agregar gastos
rep(`    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios'].includes(this.sec); },`,
`    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios','gastos'].includes(this.sec); },`,
'masActivo');

// Computed: gastosOpPeriodo -> usar tabla gastos
rep(`    gastosOpPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.movCaja
        .filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.toLowerCase().includes('gasto') && new Date(mv.fecha) >= ini)
        .reduce((s, mv) => s + n(mv.monto), 0));
    },`,
`    gastosOpPeriodo() {
      const ini = new Date(this.cfg.periodoInicio);
      return m(this.gastos
        .filter(g => new Date(g.fecha) >= ini)
        .reduce((s, g) => s + n(g.monto), 0));
    },

    gastosOrdenados() {
      return this.gastos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },

    gastosTotalAcumulado() {
      return m(this.gastos.reduce((s, g) => s + n(g.monto), 0));
    },

    gastosPorCategoria() {
      const map = {};
      this.gastos.forEach(g => {
        const c = g.categoria || 'Sin categoria';
        if (!map[c]) map[c] = 0;
        map[c] += n(g.monto);
      });
      return Object.keys(map).map(k => ({ cat: k, monto: m(map[k]) })).sort((a, b) => b.monto - a.monto);
    },`,
'computed gastos');

// generarReporte: gastosTotal -> usar tabla gastos
rep(`      let gastosTotal = 0;
      try {
        gastosTotal = m(this.movCaja
          .filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.toLowerCase().includes('gasto'))
          .filter(mv => new Date(mv.fecha) >= i && new Date(mv.fecha) <= f)
          .reduce((s, mv) => s + n(mv.monto), 0));
      } catch (e) {}`,
`      const gastosTotal = m(this.gastos
        .filter(g => new Date(g.fecha) >= i && new Date(g.fecha) <= f)
        .reduce((s, g) => s + n(g.monto), 0));`,
'generarReporte gastos');

// Methods: agregar metodos gastos (antes de "// ===== COMPARTIR EXISTENCIA")
rep(`    // ===== COMPARTIR EXISTENCIA (NUEVO) =====`,
`    // ===== GASTOS =====
    resetGasto() {
      this.gastoForm = { editId: '', fecha: new Date().toISOString().split('T')[0], categoria: '', concepto: '', monto: '', nota: '', metodoPago: 'efectivo', saleDeCaja: true };
    },

    async guardarGasto() {
      const f = this.gastoForm;
      const categoria = (f.categoria || '').trim();
      const concepto = (f.concepto || '').trim();
      const monto = n(f.monto);
      const fechaISO = f.fecha ? new Date(f.fecha + 'T12:00:00').toISOString() : new Date().toISOString();
      if (!categoria) return this.toastMsg('Categoria obligatoria', 'bad');
      if (!concepto) return this.toastMsg('Concepto obligatorio', 'bad');
      if (monto <= 0) return this.toastMsg('Monto debe ser > 0', 'bad');

      if (f.editId) {
        const o = this.gastos.find(x => x.id === f.editId);
        if (!o) return;
        await db.transaction('rw', db.gastos, db.movCaja, async () => {
          let movId = o.movId || null;
          if (f.saleDeCaja && movId) {
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          } else if (f.saleDeCaja && !movId) {
            movId = genId('mc');
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          } else if (!f.saleDeCaja && movId) {
            await db.movCaja.delete(movId);
            movId = null;
          }
          await P(db.gastos, { id: o.id, fecha: fechaISO, categoria, concepto, monto, nota: f.nota || '', metodoPago: f.metodoPago, saleDeCaja: !!f.saleDeCaja, movId });
        });
        this.toastMsg('Gasto actualizado');
      } else {
        const id = genId('g');
        let movId = null;
        await db.transaction('rw', db.gastos, db.movCaja, async () => {
          if (f.saleDeCaja) {
            movId = genId('mc');
            await P(db.movCaja, { id: movId, fecha: fechaISO, tipo: 'egreso', monto, concepto: 'Gasto: ' + categoria + ' - ' + concepto, nota: f.nota || '' });
          }
          await P(db.gastos, { id, fecha: fechaISO, categoria, concepto, monto, nota: f.nota || '', metodoPago: f.metodoPago, saleDeCaja: !!f.saleDeCaja, movId });
        });
        this.toastMsg('Gasto registrado: ' + fmt(monto));
      }
      this.resetGasto();
      await this.recargar(['gastos', 'movCaja']);
    },

    editarGasto(id) {
      const g = this.gastos.find(x => x.id === id);
      if (!g) return;
      this.gastoForm = {
        editId: g.id,
        fecha: g.fecha ? g.fecha.split('T')[0] : new Date().toISOString().split('T')[0],
        categoria: g.categoria || '',
        concepto: g.concepto || '',
        monto: String(g.monto || ''),
        nota: g.nota || '',
        metodoPago: g.metodoPago || 'efectivo',
        saleDeCaja: g.saleDeCaja !== false
      };
      window.scrollTo(0, 0);
    },

    eliminarGasto(id) {
      const g = this.gastos.find(x => x.id === id);
      if (!g) return;
      this.confirm = {
        activo: true, titulo: 'Eliminar gasto',
        msg: 'Eliminar "' + g.concepto + '" por ' + fmt(g.monto) + '?',
        onOk: async () => {
          await db.transaction('rw', db.gastos, db.movCaja, async () => {
            await db.gastos.delete(id);
            if (g.movId) await db.movCaja.delete(g.movId);
          });
          await this.recargar(['gastos', 'movCaja']);
          this.toastMsg('Gasto eliminado');
        }
      };
    },

    // ===== COMPARTIR EXISTENCIA (NUEVO) =====`,
'methods gastos');

// recargar map
rep(`        socios: () => db.socios.toArray(),
        distribuciones: () => db.distribuciones.toArray()
      };`,
`        socios: () => db.socios.toArray(),
        distribuciones: () => db.distribuciones.toArray(),
        gastos: () => db.gastos.toArray()
      };`,
'recargar gastos');

// recargarTodo
rep(`        db.socios.toArray(), db.distribuciones.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones'].forEach((k, i) => this[k] = r[i]);`,
`        db.socios.toArray(), db.distribuciones.toArray(), db.gastos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos'].forEach((k, i) => this[k] = r[i]);`,
'recargarTodo gastos');

// importarData tables
rep(`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones'];`,
`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos'];`,
'importarData gastos');

// valid sections
rep(`const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios'];`,
`const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos'];`,
'valid sections');

// sheet button
rep(`<button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>`,
`<button class="sheet-btn" :class="{ activo: sec === 'socios' }" @click="ir('socios')"><icon name="users" :size="22"></icon>Socios</button>
        <button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>
        <button class="sheet-btn" @click="ajustesAbierto = true"><icon name="settings" :size="22"></icon>Ajustes</button>`,
'sheet button gastos');

// Template: seccion gastos antes de </main>
const seccionGastos = `      <!-- ==================== GASTOS ==================== -->
      <section v-show="sec === 'gastos'" class="fade-up">
        <div class="balance neg">
          <div class="lbl"><icon name="dollar" :size="14" color="#fff"></icon> Gastos del periodo</div>
          <div class="val">{{ fmt(gastosOpPeriodo) }}</div>
          <div class="sub">Acumulado: {{ fmt(gastosTotalAcumulado) }} · {{ gastos.length }} registro(s)</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="plus" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> {{ gastoForm.editId ? 'Editar' : 'Registrar' }} Gasto</div>
          <div class="grid2">
            <input v-model="gastoForm.fecha" type="date">
            <select v-model="gastoForm.categoria">
              <option value="">Categoria...</option>
              <option value="Luz">Luz</option>
              <option value="Agua">Agua</option>
              <option value="Alquiler">Alquiler</option>
              <option value="Internet">Internet</option>
              <option value="Transporte">Transporte</option>
              <option value="Publicidad">Publicidad</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Limpieza">Limpieza</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <input v-model="gastoForm.concepto" type="text" placeholder="Concepto (ej: Recibo de luz agosto)">
          <div class="grid2">
            <input v-model="gastoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto">
            <select v-model="gastoForm.metodoPago">
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <input v-model="gastoForm.nota" type="text" placeholder="Nota (opcional)">
          <div class="set-row">
            <span class="lbl"><icon name="wallet" :size="18"></icon> Sale de caja</span>
            <label class="switch">
              <input type="checkbox" v-model="gastoForm.saleDeCaja">
              <span class="slider"></span>
            </label>
          </div>
          <button class="btn warn" @click="guardarGasto()">
            <icon name="check" :size="16" color="#fff"></icon>
            {{ gastoForm.editId ? 'Actualizar' : 'Registrar Gasto' }}
          </button>
          <button v-if="gastoForm.editId" class="btn ghost" @click="resetGasto()">Cancelar</button>
        </div>

        <div class="card" v-if="gastosPorCategoria.length">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Por categoria (acumulado)</div>
          <div v-for="g in gastosPorCategoria" :key="g.cat" class="row">
            <span>{{ g.cat }}</span>
            <b class="neg">{{ fmt(g.monto) }}</b>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'gastos' ? '#2196F3' : mutColor"></icon> Historial</div>
          <div v-if="gastosOrdenados.length === 0" class="empty">Sin gastos registrados</div>
          <div v-for="g in gastosOrdenados" :key="g.id" class="item">
            <div class="info">
              <div class="nm">{{ g.categoria }} · {{ g.concepto }}</div>
              <div class="det">{{ fmtFH(g.fecha) }} · {{ g.metodoPago || 'efectivo' }}{{ g.saleDeCaja ? ' · Caja' : ' · Sin caja' }}{{ g.nota ? ' · ' + g.nota : '' }}</div>
            </div>
            <div class="act-btns">
              <b class="neg">-{{ fmt(g.monto) }}</b>
              <button class="icon-btn" @click="editarGasto(g.id)" aria-label="Editar">
                <icon name="edit" :size="15" :color="txtColor"></icon>
              </button>
              <button class="icon-btn bad" @click="eliminarGasto(g.id)" aria-label="Eliminar">
                <icon name="trash" :size="15" color="#dc2626"></icon>
              </button>
            </div>
          </div>
        </div>
      </section>

    </main>`;

rep(`      </section>

    </main>`, seccionGastos, 'seccion template gastos');

fs.writeFileSync(APP, s);
console.log('\n=== APP.VUE ===');
log.forEach(l => console.log(l));
