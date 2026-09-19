import fs from 'fs';
const APP = 'src/App.vue';
let s = fs.readFileSync(APP, 'utf8');
const log = [];
const rep = (from, to, label) => {
  if (!s.includes(from)) { log.push('SKIP ' + label); return; }
  s = s.split(from).join(to);
  log.push('OK ' + label);
};

// 1. masActivo
rep(`    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios','gastos'].includes(this.sec); },`,
`    masActivo() { return this.masAbierto || ['productos','inventario','patrimonio','reportes','socios','gastos','contabilidad'].includes(this.sec); },`,
'masActivo');

// 2. valid sections
rep(`const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos'];`,
`const valid = ['dashboard', 'ventas', 'compras', 'productos', 'inventario', 'caja', 'patrimonio', 'reportes', 'socios', 'gastos', 'contabilidad'];`,
'valid sections');

// 3. sheet button
rep(`<button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>`,
`<button class="sheet-btn" :class="{ activo: sec === 'gastos' }" @click="ir('gastos')"><icon name="dollar" :size="22"></icon>Gastos</button>
        <button class="sheet-btn" :class="{ activo: sec === 'contabilidad' }" @click="ir('contabilidad')"><icon name="chart" :size="22"></icon>Contabilidad</button>`,
'sheet button');

// 4. Computed flujo + activos
rep(`    movimientosRecientes() {`,
`    activosTotal() { return m(this.saldoCaja + this.valorInventario); },

    pasivosTotal() { return 0; },

    flujoEntradas() {
      const ventas = m(this.ventas.filter(v => !v.anulada).reduce((s,v) => s + n(v.total), 0));
      const aportes = this.aportesTotal;
      const sobrantes = m(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(ventas + aportes + sobrantes);
    },

    flujoSalidas() {
      const compras = m(this.compras.filter(c => !c.anulada).reduce((s,c) => s + n(c.total), 0));
      const gastos = m(this.gastos.reduce((s,g) => s + n(g.monto), 0));
      const retiros = this.retirosTotal;
      const faltantes = m(this.movCaja.filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.includes('Faltante')).reduce((s,mv) => s + n(mv.monto), 0));
      return m(compras + gastos + retiros + faltantes);
    },

    flujoNeto() { return m(this.flujoEntradas - this.flujoSalidas); },

    margenBrutoPct() {
      const ing = this.ventasContadoTotal;
      return ing > 0 ? ((this.gananciaBrutaPeriodo / ing) * 100).toFixed(2) : '0.00';
    },

    margenNetoPct() {
      const ing = this.ventasContadoTotal;
      return ing > 0 ? ((this.gananciaNetaPeriodo / ing) * 100).toFixed(2) : '0.00';
    },

    movimientosRecientes() {`,
'computed flujo');

// 5. Seccion template contabilidad
const seccionContab = `      <!-- ==================== CONTABILIDAD ==================== -->
      <section v-show="sec === 'contabilidad'" class="fade-up">
        <div class="balance azul">
          <div class="lbl"><icon name="chart" :size="14" color="#fff"></icon> Resultado del periodo</div>
          <div class="val" :style="gananciaNetaPeriodo >= 0 ? '' : 'color:#fca5a5'">{{ fmt(gananciaNetaPeriodo) }}</div>
          <div class="sub">Margen neto: {{ margenNetoPct }}% · Margen bruto: {{ margenBrutoPct }}%</div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="chart" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Balance de situacion</div>
          <div class="row"><span>Activos (Caja + Inventario)</span><b class="pos">{{ fmt(activosTotal) }}</b></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row"><span>Pasivos</span><b>{{ fmt(pasivosTotal) }}</b></div>
          <div class="row total"><span>= ACTIVO NETO</span><span>{{ fmt(activosTotal - pasivosTotal) }}</span></div>
          <div class="row" style="margin-top:.5rem"><span>Capital</span><span class="pos">{{ fmt(capitalTotal) }}</span></div>
          <div class="row"><span>Ganancias acumuladas</span><span class="pos">{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PATRIMONIO</span><span>{{ fmt(patrimonioTotal - retirosTotal + 0) }}</span></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="file" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Estado de resultados</div>
          <div class="row"><span>Ingresos por ventas</span><b class="pos">{{ fmt(ventasContadoTotal) }}</b></div>
          <div class="row"><span>(-) Costo de lo vendido</span><b class="neg">{{ fmt(-1 * m(ventasContadoTotal - gananciaBrutaPeriodo)) }}</b></div>
          <div class="row total"><span>= GANANCIA BRUTA</span><span>{{ fmt(gananciaBrutaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenBrutoPct }}%)</span></span></div>
          <div class="row" style="margin-top:.5rem"><span>(-) Gastos operativos</span><span class="neg">-{{ fmt(gastosOpPeriodo) }}</span></div>
          <div class="row"><span>(-) Mermas</span><span class="neg">-{{ fmt(this.ajustes.filter(a => a.cantidad < 0 && new Date(a.fecha) >= new Date(cfg.periodoInicio)).reduce((s,a) => s + n(a.costoPerdida), 0)) }}</span></div>
          <div class="row total"><span>= GANANCIA NETA</span>
            <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }} <span style="font-weight:400;font-size:.78rem">({{ margenNetoPct }}%)</span></span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="dollar" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Balance general</div>
          <div class="info-box" style="margin-bottom:.6rem;font-size:.72rem">
            Activo = Pasivo + Patrimonio
          </div>
          <div class="row" style="font-weight:800;color:var(--pri)"><span>ACTIVOS</span><span>{{ fmt(activosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Caja</span><span>{{ fmt(saldoCaja) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Inventario</span><span>{{ fmt(valorInventario) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PASIVOS</span><span>{{ fmt(pasivosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Sin deudas registradas</span><span>{{ fmt(0) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--pri);margin-top:.5rem"><span>PATRIMONIO</span><span>{{ fmt(capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Capital</span><span>{{ fmt(capitalTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Ganancias acumuladas</span><span>{{ fmt(gananciasAcumuladas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Retiros</span><span class="neg">-{{ fmt(retirosTotal) }}</span></div>
          <div class="row total"><span>= PASIVO + PATRIMONIO</span><span>{{ fmt(pasivosTotal + capitalTotal + gananciasAcumuladas - retirosTotal) }}</span></div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="wallet" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Flujo de caja</div>
          <div class="row" style="font-weight:800;color:var(--ok)"><span>ENTRADAS</span><span>+{{ fmt(flujoEntradas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Ventas al contado</span><span>{{ fmt(ventasContadoTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Aportes de capital</span><span>{{ fmt(aportesTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Sobrantes de arqueo</span><span>{{ fmt(this.movCaja.filter(mv => mv.tipo === 'ingreso' && mv.concepto && mv.concepto.includes('Sobrante')).reduce((s,mv) => s + n(mv.monto), 0)) }}</span></div>
          <div class="row" style="font-weight:800;color:var(--bad);margin-top:.5rem"><span>SALIDAS</span><span>-{{ fmt(flujoSalidas) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Compras de mercancia</span><span>{{ fmt(comprasTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Gastos operativos</span><span>{{ fmt(gastosTotalAcumulado) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Retiros</span><span>{{ fmt(retirosTotal) }}</span></div>
          <div class="row" style="padding-left:1rem;font-size:.78rem"><span>Faltantes de arqueo</span><span>{{ fmt(this.movCaja.filter(mv => mv.tipo === 'egreso' && mv.concepto && mv.concepto.includes('Faltante')).reduce((s,mv) => s + n(mv.monto), 0)) }}</span></div>
          <div class="row total"><span>= FLUJO NETO</span>
            <span :class="flujoNeto >= 0 ? 'pos' : 'neg'">{{ fmt(flujoNeto) }}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><icon name="calendar" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Cierres contables</div>
          <div style="font-size:.82rem;color:var(--mut);margin-bottom:.5rem">
            Periodo actual: desde {{ fmtFecha(cfg.periodoInicio) }}
          </div>
          <div class="row"><span>Ventas acumuladas</span><b>{{ fmt(ventasPeriodo) }}</b></div>
          <div class="row"><span>Ganancia del periodo</span>
            <b :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(gananciaNetaPeriodo) }}</b>
          </div>
          <div class="row"><span>Cierres registrados</span><b>{{ cierres.length }}</b></div>
          <button class="btn warn" style="margin-top:.5rem" @click="ir('reportes')">
            <icon name="calendar" :size="16" color="#fff"></icon> Ir a cerrar periodo
          </button>
        </div>

        <div class="card">
          <div class="card-title"><icon name="list" :size="18" :color="sec === 'contabilidad' ? '#2196F3' : mutColor"></icon> Historial de cierres</div>
          <div v-if="cierres.length === 0" class="empty">Sin cierres registrados</div>
          <div v-for="c in cierresOrdenados" :key="c.id" class="item">
            <div class="info">
              <div class="nm">{{ c.periodo }}</div>
              <div class="det">Cerrado {{ fmtFecha(c.fechaCierre) }} · Vtas {{ fmt(c.totalVentas) }} · Gan {{ fmt(c.ganancia) }}</div>
            </div>
          </div>
        </div>
      </section>

    </main>`;

rep(`      </section>

    </main>`, seccionContab, 'seccion contabilidad');

fs.writeFileSync(APP, s);
console.log('\n=== RESULTADO ===');
log.forEach(l => console.log(l));
