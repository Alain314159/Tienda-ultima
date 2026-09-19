import fs from 'fs';

// ============ DB.JS: tabla pasivos (version 4) ============
let d = fs.readFileSync('src/db.js', 'utf8');
const v3End = `  asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
  config: 'key'
});`;

const v4Block = v3End + `

// Version 4: agrega pasivos (deudas)
db.version(4).stores({
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
  pasivos: 'id, fecha, acreedor, pagado, vencimiento',
  config: 'key'
});`;

if (d.includes('db.version(4)')) {
  console.log('SKIP db.js: ya tiene version 4');
} else if (!d.includes(v3End)) {
  console.log('SKIP db.js: no encontre v3End');
} else {
  d = d.replace(v3End, v4Block);
  fs.writeFileSync('src/db.js', d);
  console.log('OK db.js: version 4 con tabla pasivos');
}

// buildData
let d2 = fs.readFileSync('src/db.js', 'utf8');
if (!d2.includes('pasivos: state.pasivos')) {
  d2 = d2.replace(`    asientos: state.asientos
  });`, `    asientos: state.asientos,
    pasivos: state.pasivos
  });`);
  fs.writeFileSync('src/db.js', d2);
  console.log('OK db.js: buildData incluye pasivos');
} else console.log('SKIP db.js: buildData ya tiene pasivos');

// ============ APP.VUE ============
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// 1. data
rep(`      asientos: [],`,
`      asientos: [],
      pasivos: [],`,
'data pasivos');

rep(`      CUENTAS: {`,
`      pasivoForm: { editId: '', acreedor: '', concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0], vencimiento: '', nota: '' },
      CUENTAS: {`,
'data pasivoForm');

// 2. CUENTAS: agregar PASIVOS y PAGO_PASIVOS
rep(`        FALTANTES: 'Faltantes de arqueo'
      },`,
`        FALTANTES: 'Faltantes de arqueo',
        PASIVOS: 'Cuentas por pagar',
        PAGO_PASIVOS: 'Pago de deudas'
      },`,
'cuentas pasivos');

// 3. computed pasivos
rep(`    flujoEntradas() {`,
`    pasivosActivos() {
      return this.pasivos.filter(p => !p.pagado);
    },

    pasivosTotalReal() {
      return m(this.pasivosActivos.reduce((s, p) => s + n(p.monto), 0));
    },

    pasivosPagadosTotal() {
      return m(this.pasivos.filter(p => p.pagado).reduce((s, p) => s + n(p.monto), 0));
    },

    pasivosOrdenados() {
      return this.pasivos.slice().sort((a, b) => {
        if (a.pagado !== b.pagado) return a.pagado ? 1 : -1;
        return new Date(a.fecha) - new Date(b.fecha);
      });
    },

    pasivosVencidos() {
      const ahora = new Date();
      return this.pasivosActivos.filter(p => p.vencimiento && new Date(p.vencimiento) < ahora);
    },

    flujoEntradas() {`,
'computed pasivos');

// 4. Reemplazar pasivosTotal() por el real
rep(`    pasivosTotal() { return 0; },`,
`    pasivosTotal() { return this.pasivosTotalReal; },`,
'pasivosTotal real');

// 5. Actualizar Balance general para incluir pasivos reales
rep(`          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PASIVOS</span><span>{{ fmt(pasivosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Sin deudas registradas</span><span>{{ fmt(0) }}</span></div>`,
`          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PASIVOS</span><span class="neg">{{ fmt(pasivosTotalReal) }}</span></div>
          <div v-if="pasivosActivos.length === 0" class="row" style="padding-left:1rem;font-size:.78rem;color:var(--mut)"><span>Sin deudas activas</span><span>{{ fmt(0) }}</span></div>
          <div v-for="p in pasivosActivos" :key="p.id" class="row" style="padding-left:1rem;font-size:.78rem">
            <span>{{ p.acreedor }}{{ p.vencimiento && new Date(p.vencimiento) < new Date() ? ' ⚠ vencido' : '' }}</span>
            <span class="neg">{{ fmt(p.monto) }}</span>
          </div>`,
'balance general pasivos');

// 6. metodo guardarPasivo, pagarPasivo, eliminarPasivo, resetPasivo
rep(`    // ===== ERUDA =====`,
`    // ===== PASIVOS =====
    resetPasivo() {
      this.pasivoForm = { editId: '', acreedor: '', concepto: '', monto: '', fecha: new Date().toISOString().split('T')[0], vencimiento: '', nota: '' };
    },

    async guardarPasivo() {
      const f = this.pasivoForm;
      const acreedor = (f.acreedor || '').trim();
      const concepto = (f.concepto || '').trim();
      const monto = n(f.monto);
      if (!acreedor) return this.toastMsg('Acreedor obligatorio', 'bad');
      if (!concepto) return this.toastMsg('Concepto obligatorio', 'bad');
      if (monto <= 0) return this.toastMsg('Monto debe ser > 0', 'bad');

      const fechaISO = f.fecha ? new Date(f.fecha + 'T12:00:00').toISOString() : new Date().toISOString();
      const vencISO = f.vencimiento ? new Date(f.vencimiento + 'T12:00:00').toISOString() : null;

      if (f.editId) {
        const o = this.pasivos.find(x => x.id === f.editId);
        if (!o) return;
        await P(db.pasivos, Object.assign({}, o, { acreedor, concepto, monto, fecha: fechaISO, vencimiento: vencISO, nota: f.nota || '' }));
        this.toastMsg('Pasivo actualizado');
      } else {
        await P(db.pasivos, { id: genId('pv'), acreedor, concepto, monto, fecha: fechaISO, vencimiento: vencISO, nota: f.nota || '', pagado: false });
        this.toastMsg('Pasivo registrado: ' + fmt(monto));
      }
      this.resetPasivo();
      await this.recargar(['pasivos']);
    },

    editarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p) return;
      this.pasivoForm = {
        editId: p.id,
        acreedor: p.acreedor || '',
        concepto: p.concepto || '',
        monto: String(p.monto || ''),
        fecha: p.fecha ? p.fecha.split('T')[0] : new Date().toISOString().split('T')[0],
        vencimiento: p.vencimiento ? p.vencimiento.split('T')[0] : '',
        nota: p.nota || ''
      };
      window.scrollTo(0, 0);
    },

    eliminarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p) return;
      this.confirm = {
        activo: true, titulo: 'Eliminar pasivo',
        msg: 'Eliminar deuda con "' + p.acreedor + '" por ' + fmt(p.monto) + '?',
        onOk: async () => {
          await db.pasivos.delete(id);
          await this.recargar(['pasivos']);
          this.toastMsg('Pasivo eliminado');
        }
      };
    },

    pagarPasivo(id) {
      const p = this.pasivos.find(x => x.id === id);
      if (!p || p.pagado) return;
      this.confirm = {
        activo: true, titulo: 'Pagar deuda',
        msg: 'Pagar ' + fmt(p.monto) + ' a "' + p.acreedor + '"? Se registrara un gasto y saldra de caja.',
        onOk: async () => {
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
        }
      };
    },

    // ===== ERUDA =====`,
'methods pasivos');

// 7. recargar map
rep(`        asientos: () => db.asientos.toArray()
      };`,
`        asientos: () => db.asientos.toArray(),
        pasivos: () => db.pasivos.toArray()
      };`,
'recargar pasivos');

// 8. recargarTodo
rep(`        db.asientos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'].forEach((k, i) => this[k] = r[i]);`,
`        db.asientos.toArray(), db.pasivos.toArray()
      ]);
      ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos', 'pasivos'].forEach((k, i) => this[k] = r[i]);`,
'recargarTodo pasivos');

// 9. importarData
rep(`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos'];`,
`const tables = ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'asientos', 'pasivos'];`,
'importarData pasivos');

// 10. Template: Card pasivos dentro de Contabilidad, antes del card de Libro diario
rep(`        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario`,
`        <div class="card">
          <div class="card-title"><icon name="credit-card" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Cuentas por pagar ({{ pasivosActivos.length }})</div>
          <div class="row total">
            <span>Deuda activa</span>
            <span class="neg">{{ fmt(pasivosTotalReal) }}</span>
          </div>
          <div v-if="pasivosVencidos.length" class="alert-box" style="margin:.5rem 0">
            <icon name="alert" :size="14" color="#d97706"></icon>
            {{ pasivosVencidos.length }} deuda(s) vencida(s)
          </div>

          <div style="margin-top:.6rem;border-top:1px solid var(--brd);padding-top:.6rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--pri);margin-bottom:.4rem">{{ pasivoForm.editId ? 'Editar' : 'Nueva' }} deuda</div>
            <input v-model="pasivoForm.acreedor" type="text" placeholder="Acreedor (proveedor, banco, persona)">
            <input v-model="pasivoForm.concepto" type="text" placeholder="Concepto (ej: compra a credito)">
            <div class="grid2">
              <input v-model="pasivoForm.monto" type="number" inputmode="decimal" step="0.01" placeholder="Monto">
              <input v-model="pasivoForm.fecha" type="date">
            </div>
            <input v-model="pasivoForm.vencimiento" type="date" placeholder="Vencimiento (opcional)">
            <input v-model="pasivoForm.nota" type="text" placeholder="Nota (opcional)">
            <button class="btn warn" @click="guardarPasivo()">
              <icon name="check" :size="16" color="#fff"></icon>
              {{ pasivoForm.editId ? 'Actualizar' : 'Registrar deuda' }}
            </button>
            <button v-if="pasivoForm.editId" class="btn ghost" @click="resetPasivo()">Cancelar</button>
          </div>

          <div v-if="pasivosActivos.length" style="margin-top:.8rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--pri);margin-bottom:.4rem">Deudas activas</div>
            <div v-for="p in pasivosActivos" :key="p.id" class="item" style="flex-direction:column;align-items:stretch;gap:.3rem">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
                <div class="nm">{{ p.acreedor }}</div>
                <b class="neg">{{ fmt(p.monto) }}</b>
              </div>
              <div class="det" style="font-size:.72rem">
                {{ p.concepto }} · {{ fmtFecha(p.fecha) }}
                <span v-if="p.vencimiento" :style="new Date(p.vencimiento) < new Date() ? 'color:var(--bad);font-weight:700' : ''">
                  · Vence {{ fmtFecha(p.vencimiento) }}
                </span>
              </div>
              <div class="act-btns" style="justify-content:flex-end">
                <button class="btn ok" style="width:auto;padding:.3rem .7rem;font-size:.72rem;margin:0" @click="pagarPasivo(p.id)">
                  <icon name="check" :size="12" color="#fff"></icon> Pagar
                </button>
                <button class="icon-btn" @click="editarPasivo(p.id)" aria-label="Editar">
                  <icon name="edit" :size="14" :color="txtColor"></icon>
                </button>
                <button class="icon-btn bad" @click="eliminarPasivo(p.id)" aria-label="Eliminar">
                  <icon name="trash" :size="14" color="#dc2626"></icon>
                </button>
              </div>
            </div>
          </div>

          <div v-if="pasivos.filter(p => p.pagado).length" style="margin-top:.8rem">
            <div style="font-size:.78rem;font-weight:800;color:var(--mut);margin-bottom:.4rem">Pagadas recientemente</div>
            <div v-for="p in pasivos.filter(x => x.pagado).slice(0, 5)" :key="p.id" class="item" style="opacity:.6">
              <div class="info">
                <div class="nm">{{ p.acreedor }}</div>
                <div class="det">Pagada {{ fmtFecha(p.fechaPago || p.fecha) }}</div>
              </div>
              <b>{{ fmt(p.monto) }}</b>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Libro diario`,
'template pasivos contabilidad');

// 11. Icono credit-card en PATHS
rep(`  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 00-3-3.87"></path><path d="M16 3.13a4 4 0 010 7.75"></path>'`,
`  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 00-3-3.87"></path><path d="M16 3.13a4 4 0 010 7.75"></path>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>'`,
'icono credit-card');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
