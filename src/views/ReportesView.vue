<template>
  <section v-if="sec === 'reportes'" class="fade-up">
    <!-- Cerrar Período -->
    <div class="card">
      <div class="card-title">
        <icon name="calendar" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Cerrar Período
      </div>
      <div class="info-box" style="margin-bottom: 0.6rem">
        Al cerrar, los contadores del inicio se reinician. El historial se conserva y la ganancia se acumula.
      </div>
      <div style="font-size: 0.82rem; color: var(--mut); margin-bottom: 0.5rem">
        Período actual: desde {{ fmtFecha(cfg.periodoInicio) }}
      </div>
      <div class="grid2" style="margin-bottom: 0.5rem">
        <div>
          <span class="det">Ventas</span>
          <div style="font-weight: 800">{{ fmt(ventasStore.ventasPeriodo) }}</div>
        </div>
        <div>
          <span class="det">Compras</span>
          <div style="font-weight: 800" class="neg">{{ fmt(cierresStore.comprasPeriodo) }}</div>
        </div>
      </div>
      <div style="font-size: 0.9rem; font-weight: 800; margin-bottom: 0.6rem">
        Ganancia:
        <span :class="gananciaNetaPeriodo >= 0 ? 'pos' : 'neg'">{{ fmt(cierresStore.gananciaNetaPeriodo) }}</span>
      </div>
      <button class="btn warn" @click="cerrarPeriodo()">
        <icon name="calendar" :size="16" color="#fff"></icon> Cerrar Período y Empezar Nuevo
      </button>
    </div>

    <!-- Historial de Cierres -->
    <div class="card">
      <div class="card-title">
        <icon name="list" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Historial de Cierres
      </div>
      <div v-if="cierres.length === 0" class="empty">Sin cierres</div>
      <div
        v-for="c in cierresStore.cierresOrdenados"
        :key="c.id"
        class="item"
        style="flex-direction: column; align-items: stretch; gap: 0.3rem"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem">
          <div class="nm">{{ c.periodo }}</div>
          <b :class="c.ganancia >= 0 ? 'pos' : 'neg'">{{ fmt(c.ganancia) }}</b>
        </div>
        <div class="det" style="font-size: 0.72rem">
          Cerrado {{ fmtFecha(c.fechaCierre) }}
          <span v-if="c.numVentas !== undefined"> · {{ c.numVentas }} venta(s)</span>
        </div>
        <div
          v-if="c.cogs !== undefined"
          style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.2rem; font-size: 0.7rem; margin-top: 0.2rem"
        >
          <div style="color: var(--mut)">
            Ventas: <b style="color: var(--ok)">{{ fmt(c.totalVentas) }}</b>
          </div>
          <div style="color: var(--mut)">
            COGS: <b style="color: var(--bad)">-{{ fmt(c.cogs) }}</b>
          </div>
          <div style="color: var(--mut)">
            Gastos: <b style="color: var(--bad)">-{{ fmt(c.gastos) }}</b>
          </div>
          <div style="color: var(--mut)">
            Mermas: <b style="color: var(--bad)">-{{ fmt(c.mermas) }}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- CUADRE POR PERÍODO (NUEVO - reemplaza Reporte viejo) -->
    <div class="card">
      <div class="card-title">
        <icon name="file" :size="18" :color="sec === 'reportes' ? '#2196F3' : mutColor"></icon> Cuadre por Período
      </div>
      <div class="grid2">
        <input
          v-model="rep.fechaInicio"
          type="date"
          @input="
            rep.isoInicio = null;
            rep.isoFin = null;
            rep.periodoActivo = null;
          "
        />
        <input
          v-model="rep.fechaFin"
          type="date"
          @input="
            rep.isoInicio = null;
            rep.isoFin = null;
            rep.periodoActivo = null;
          "
        />
      </div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem; margin-bottom: 0.5rem">
        <button
          class="btn"
          :class="rep.periodoActivo === 'hoy' ? 'pri' : 'ghost'"
          style="margin: 0; padding: 0.5rem 0.2rem; font-size: 0.65rem"
          @click="setHoy()"
        >
          Hoy
        </button>
        <button
          class="btn"
          :class="rep.periodoActivo === 'semana' ? 'pri' : 'ghost'"
          style="margin: 0; padding: 0.5rem 0.2rem; font-size: 0.65rem"
          @click="setSemana()"
        >
          7d
        </button>
        <button
          class="btn"
          :class="rep.periodoActivo === 'mes' ? 'pri' : 'ghost'"
          style="margin: 0; padding: 0.5rem 0.2rem; font-size: 0.65rem"
          @click="setMesActual()"
        >
          Mes
        </button>
        <button
          class="btn"
          :class="rep.periodoActivo === 'mes-ant' ? 'pri' : 'ghost'"
          style="margin: 0; padding: 0.5rem 0.2rem; font-size: 0.65rem"
          @click="setMesAnterior()"
        >
          Mes ant
        </button>
        <button
          class="btn"
          :class="rep.periodoActivo === 'anio' ? 'pri' : 'ghost'"
          style="margin: 0; padding: 0.5rem 0.2rem; font-size: 0.65rem"
          @click="setAnio()"
        >
          Año
        </button>
      </div>
      <button
        class="btn"
        :class="rep.periodoActivo === 'actual' ? 'pri' : 'ghost'"
        style="margin-bottom: 0.5rem; font-size: 0.72rem"
        @click="setPeriodoActual()"
      >
        Periodo actual (desde {{ fmtFecha(cfg.periodoInicio) }})
      </button>
      <div v-if="cierresOrdenados.length" style="margin-bottom: 0.7rem">
        <div class="det" style="font-size: 0.72rem; color: var(--mut); margin-bottom: 0.35rem">
          Periodos cerrados anteriores:
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.4rem">
          <button
            v-for="c in cierresOrdenados.slice(0, 6)"
            :key="c.id"
            class="btn"
            :class="rep.periodoActivo === c.id ? 'pri' : 'ghost'"
            style="width: auto; padding: 0.35rem 0.7rem; font-size: 0.68rem; margin: 0"
            @click="setPeriodoCierre(c)"
          >
            {{ c.periodo }}
          </button>
        </div>
      </div>
      <button class="btn pri" @click="generarReporte()">
        <icon name="search" :size="16" color="#fff"></icon> Generar Cuadre
      </button>

      <!-- Resumen del cuadre -->
      <div v-if="rep.resultado" style="margin-top: 0.8rem">
        <div class="card-title" style="margin-top: 0"><icon name="chart" :size="18"></icon> Resumen</div>
        <div class="row">
          <span>Ingresos</span><b class="pos">{{ fmt(rep.resultado.ingresos) }}</b>
        </div>
        <div class="row">
          <span>Costos (COGS)</span><b class="neg">-{{ fmt(rep.resultado.cogs) }}</b>
        </div>
        <div class="row">
          <span>Ganancia bruta</span><b>{{ fmt(rep.resultado.bruta) }} ({{ rep.resultado.margenB }}%)</b>
        </div>
        <div class="row">
          <span>Mermas</span><b class="neg">-{{ fmt(rep.resultado.mermas) }}</b>
        </div>
        <div class="row">
          <span>Gastos operativos</span><b class="neg">-{{ fmt(rep.resultado.gastos) }}</b>
        </div>
        <div class="row total">
          <span>Ganancia neta</span>
          <span :class="rep.resultado.neta >= 0 ? 'pos' : 'neg'"
            >{{ fmt(rep.resultado.neta) }} ({{ rep.resultado.margenN }}%)</span
          >
        </div>
        <div class="det" style="font-size: 0.75rem; color: var(--mut); margin-top: 0.3rem">
          Ventas realizadas: {{ rep.resultado.numVentas }}
        </div>
      </div>

      <!-- Tabla de cuadre por producto -->
      <div v-if="rep.resultado && rep.resultado.cuadre" style="margin-top: 1rem">
        <div class="card-title"><icon name="package" :size="18"></icon> Cuadre por producto</div>
        <div style="overflow-x: auto">
          <table class="cuadre-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Compras</th>
                <th>Costo c/u</th>
                <th>Ventas</th>
                <th>Precio c/u</th>
                <th>Ingresos</th>
                <th>Costo</th>
                <th>Ganancia</th>
                <th>Stock</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in rep.resultado.cuadre" :key="r.id">
                <tr
                  class="product-row"
                  style="cursor: pointer"
                  @click="r.subfilas.length > 1 ? toggleCuadreProducto(r.id) : null"
                >
                  <td>
                    <span
                      v-if="r.subfilas.length > 1"
                      class="chev"
                      :class="{ open: cuadreExpandido[r.id] }"
                      style="margin-right: 0.3rem; display: inline-flex"
                    >
                      <icon name="chevron" :size="12" :color="mutColor"></icon>
                    </span>
                    <b>{{ r.nombre }}</b>
                    <span v-if="r.subfilas.length > 1" class="badge-lotes">{{ r.subfilas.length }} lotes</span>
                  </td>
                  <td>{{ fmtCant(r.compras) }}</td>
                  <td>{{ fmt(r.costoCompra) }}</td>
                  <td>{{ fmtCant(r.ventas) }}</td>
                  <td>{{ fmt(r.precioVenta) }}</td>
                  <td class="pos">{{ fmt(r.ingresos) }}</td>
                  <td class="neg">{{ fmt(r.costo) }}</td>
                  <td :class="r.ganancia >= 0 ? 'pos' : 'neg'">
                    <b>{{ fmt(r.ganancia) }}</b>
                  </td>
                  <td>{{ fmtCant(r.stockFinal) }}</td>
                  <td>{{ fmt(r.valorInv) }}</td>
                </tr>
                <template v-if="r.subfilas.length > 1 && cuadreExpandido[r.id]">
                  <tr v-for="(sf, i) in r.subfilas" :key="r.id + '_' + i" class="sub-row">
                    <td class="sub-lote-cell">
                      <span class="sub-arrow">└</span>
                      <span class="sub-num">Lote {{ i + 1 }}</span>
                      <span class="sub-fechas"
                        >{{ fmt(sf.costo) }}<span v-if="sf.precio !== null"> → {{ fmt(sf.precio) }}</span
                        ><span v-else class="sub-sin-venta"> · sin ventas</span></span
                      >
                    </td>
                    <td>{{ sf.comprasCant ? fmtCant(sf.comprasCant) : '—' }}</td>
                    <td>{{ fmt(sf.costo) }}</td>
                    <td>{{ sf.cantVend ? fmtCant(sf.cantVend) : '—' }}</td>
                    <td>{{ sf.precio !== null ? fmt(sf.precio) : '—' }}</td>
                    <td class="pos">{{ sf.ingresos ? fmt(sf.ingresos) : '—' }}</td>
                    <td class="neg">{{ sf.costoVend ? fmt(sf.costoVend) : '—' }}</td>
                    <td :class="sf.ganancia >= 0 ? 'pos' : 'neg'">{{ sf.ganancia ? fmt(sf.ganancia) : '—' }}</td>
                    <td>{{ fmtCant(sf.stockActual) }}</td>
                    <td>{{ fmt(sf.valorActual) }}</td>
                  </tr>
                </template>
              </template>
              <tr class="total-row">
                <td>TOTAL</td>
                <td>{{ fmtCant(rep.resultado.totales.compras) }}</td>
                <td></td>
                <td>{{ fmtCant(rep.resultado.totales.ventas) }}</td>
                <td></td>
                <td class="pos">{{ fmt(rep.resultado.totales.ingresos) }}</td>
                <td class="neg">{{ fmt(rep.resultado.totales.costo) }}</td>
                <td :class="rep.resultado.totales.ganancia >= 0 ? 'pos' : 'neg'">
                  {{ fmt(rep.resultado.totales.ganancia) }}
                </td>
                <td>{{ fmtCant(rep.resultado.totales.stockFinal) }}</td>
                <td>{{ fmt(rep.resultado.totales.valorInv) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Botón PDF (reemplaza CSV y Compartir) -->
        <button class="btn ok" style="margin-top: 0.8rem" @click="generarPDFCuadre()">
          <icon name="file" :size="16" color="#fff"></icon> Exportar PDF
        </button>

        <!-- Reparto entre socios -->
        <div v-if="sociosActivos.length" style="margin-top: 1.2rem">
          <div class="card-title"><icon name="users" :size="18"></icon> Reparto entre socios</div>
          <div class="info-box" style="margin-bottom: 0.5rem">
            Ganancia neta del periodo: <b>{{ fmt(rep.resultado.neta) }}</b>
          </div>
          <div v-for="s in sociosActivos" :key="s.id" class="row">
            <span>{{ s.nombre }} ({{ n(s.porcentaje).toFixed(2) }}%)</span>
            <b :class="(rep.resultado.neta * n(s.porcentaje)) / 100 >= 0 ? 'pos' : 'neg'">
              {{ fmt((rep.resultado.neta * n(s.porcentaje)) / 100) }}
            </b>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { n, fmt, fmtCant, fmtFecha } from '../db.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useVentasStore } from '../stores/useVentasStore.js';
import { useCierresStore } from '../stores/useCierresStore.js';
import { useCapitalStore } from '../stores/useCapitalStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useCuadre } from '../composables/useCuadre.js';
import { TOAST } from '../constants.js';
import { toastMsg } from '../utils/toast.js';

const configStore = useConfigStore();
const ui = useUIStore();
const ventasStore = useVentasStore();
const cierresStore = useCierresStore();
const capitalStore = useCapitalStore();

const sec = 'reportes';
const cfg = configStore.cfg;
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));

// ===== CIERRES =====
const cierres = computed(() => cierresStore.cierres);
const cierresOrdenados = computed(() => cierresStore.cierresOrdenados);
const gananciaNetaPeriodo = computed(() => cierresStore.gananciaNetaPeriodo);

function cerrarPeriodo() {
  return cierresStore.cerrarPeriodo();
}

// ===== SOCIOS (para el reparto del PDF) =====
const sociosActivos = computed(() => capitalStore.socios.filter((s) => s.activo !== false));

// ===== CUADRE POR PERÍODO =====
const {
  rep,
  cuadreExpandido,
  setSemana,
  setMesAnterior,
  setAnio,
  setHoy,
  setPeriodoCierre,
  setMesActual,
  setPeriodoActual,
  toggleCuadreProducto,
  generarReporte,
  generarPDFCuadre,
} = useCuadre();
</script>
