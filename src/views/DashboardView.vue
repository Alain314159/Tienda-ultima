<template>
  <section v-if="sec === 'dashboard'" class="fade-up">
    <div class="balance azul">
      <div class="lbl"><icon name="wallet" :size="14" color="#fff"></icon> Efectivo en Caja</div>
      <div class="val">{{ fmt(cajaStore.saldoCaja) }}</div>
      <div class="sub">
        Inventario: {{ fmt(lotesStore.valorInventario) }} · Desde
        {{ fmtFecha(configStore.periodoInicio) }}
      </div>
    </div>

    <div
      v-if="productosStore.productosBajoStock.length || productosStore.productosAgotados.length"
      class="alert-box-stock"
    >
      <div v-if="productosStore.productosAgotados.length" class="alert-chip alert-out" @click="irAStock('agotados')">
        <icon name="alert" :size="14" color="#fff"></icon>
        <b>{{ productosStore.productosAgotados.length }}</b> agotado(s)
      </div>
      <div v-if="productosStore.productosBajoStock.length" class="alert-chip alert-low" @click="irAStock('bajos')">
        <icon name="alert" :size="14" color="#fff"></icon>
        <b>{{ productosStore.productosBajoStock.length }}</b> bajo(s)
      </div>
    </div>

    <div class="grid2">
      <div class="stat">
        <div class="lbl"><icon name="trend" :size="13" :color="mutColor"></icon> Ventas</div>
        <div class="val" style="color: var(--pri)">{{ fmt(ventasStore.ventasPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="dollar" :size="13" :color="mutColor"></icon> Ganancia</div>
        <div class="val pos">{{ fmt(cierresStore.gananciaNetaPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="bag" :size="13" :color="mutColor"></icon> Compras</div>
        <div class="val neg">{{ fmt(cierresStore.comprasPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="chart" :size="13" :color="mutColor"></icon> Margen</div>
        <div class="val" style="color: var(--pri)">{{ cierresStore.margenPeriodo }}%</div>
      </div>
    </div>

    <!-- GRAFICO_CIRCULAR_V1 -->
    <div class="card" style="margin-top: 0.8rem">
      <div
        class="card-title"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem"
      >
        <span style="display: flex; align-items: center; gap: 0.55rem">
          <icon name="chart" :size="18" :color="sec === 'dashboard' ? '#2196F3' : mutColor"></icon>
          Ventas vs Ganancia
        </span>
        <span class="chart-toggle">
          <button :class="{ activo: cfg.graficoVista === 'dia' }" @click="setGraficoVista('dia')">Días</button>
          <button :class="{ activo: cfg.graficoVista === 'semana' }" @click="setGraficoVista('semana')">Semana</button>
          <button :class="{ activo: cfg.graficoVista === 'mes' }" @click="setGraficoVista('mes')">Mes</button>
        </span>
      </div>
      <div class="chart-wrap"><canvas id="chartVentas"></canvas></div>
    </div>

    <!-- GRAFICO_PRODUCTOS_CIRCULAR -->
    <div class="card">
      <div
        class="card-title"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem"
      >
        <span style="display: flex; align-items: center; gap: 0.55rem">
          <icon name="package" :size="18" :color="sec === 'dashboard' ? '#2196F3' : mutColor"></icon>
          Top productos
        </span>
        <span class="chart-toggle">
          <button :class="{ activo: cfg.graficoProdPeriodo === 'semana' }" @click="setGraficoProdPeriodo('semana')">
            Sem
          </button>
          <button :class="{ activo: cfg.graficoProdPeriodo === 'mes' }" @click="setGraficoProdPeriodo('mes')">
            Mes
          </button>
        </span>
      </div>
      <div
        class="chart-toggle"
        style="display: flex; justify-content: center; margin-bottom: 0.5rem; background: transparent"
      >
        <button :class="{ activo: cfg.graficoProdTipo === 'vendidos' }" @click="setGraficoProdTipo('vendidos')">
          Más vendidos
        </button>
        <button :class="{ activo: cfg.graficoProdTipo === 'margen' }" @click="setGraficoProdTipo('margen')">
          Más margen
        </button>
      </div>
      <div class="chart-wrap" v-if="topProductosGrafico().length > 0"><canvas id="chartProductos"></canvas></div>
      <div v-else class="empty" style="padding: 2rem 1rem">Sin ventas en este periodo</div>
    </div>

    <div class="card rec-card" v-if="recomendaciones.length">
      <div class="card-title">
        <icon name="zap" :size="18" :color="'#D97706'"></icon>
        Recomendaciones
        <span v-if="recomendacionesUrgentes > 0" class="badge out" style="margin-left: auto"
          >{{ recomendacionesUrgentes }} urgente(s)</span
        >
      </div>
      <div
        v-for="(rec, i) in recomendaciones"
        :key="i"
        class="rec-row"
        :class="'rec-' + rec.nivel"
        @click="irSeccion(rec.sec, rec.refId)"
      >
        <div class="rec-icon">
          <icon :name="rec.icono" :size="16" :color="colorNivel(rec.nivel)"></icon>
        </div>
        <div class="rec-body">
          <div class="rec-title">{{ rec.titulo }}</div>
          <div class="rec-detail">{{ rec.detalle }}</div>
        </div>
        <button v-if="rec.clave" class="rec-x" @click.stop="descartarAnomalia(rec.clave)" aria-label="Descartar">
          <icon name="x" :size="12" :color="mutColor"></icon>
        </button>
      </div>
      <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap">
        <button
          v-if="cfg.anomaliasDescartadas && cfg.anomaliasDescartadas.length"
          class="link-btn"
          @click="restaurarAnomalias"
        >
          Restaurar {{ cfg.anomaliasDescartadas.length }} descartada(s)
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { fmt, fmtFecha } from '../utils/formato';
import { useConfigStore } from '../stores/useConfigStore';
import { useProductosStore } from '../stores/useProductosStore';
import { useLotesStore } from '../stores/useLotesStore';
import { useVentasStore } from '../stores/useVentasStore';
import { useCajaStore } from '../stores/useCajaStore';
import { useCierresStore } from '../stores/useCierresStore';
import { useInsightsStore } from '../stores/useInsightsStore';
import { useGraficos } from '../composables/useGraficos';
import { ir } from '../utils/navegacion';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';

const router = useRouter();
const configStore = useConfigStore();
const productosStore = useProductosStore();
const lotesStore = useLotesStore();
const ventasStore = useVentasStore();
const cajaStore = useCajaStore();
const cierresStore = useCierresStore();
const insights = useInsightsStore();

const sec = 'dashboard';
const cfg = configStore.cfg;
const mutColor = computed(() => (configStore.tema === 'dark' ? '#94a3b8' : '#6b7280'));

// ===== GRÁFICOS (Chart.js con carga dinámica) =====
const { setGraficoVista, setGraficoProdTipo, setGraficoProdPeriodo, renderChart, renderChartProductos, destruir } =
  useGraficos();

// Top productos para el gráfico circular (expuesto para el v-if del template)
function topProductosGrafico() {
  return ventasStore.ventas.length ? _topProductos() : [];
}
// Réplica ligera del cálculo del composable para el estado vacío del template
function _topProductos() {
  const ahora = new Date();
  const periodo = cfg.graficoProdPeriodo || 'mes';
  let ini;
  if (periodo === 'semana') {
    ini = new Date(ahora);
    ini.setDate(ahora.getDate() - 6);
    ini.setHours(0, 0, 0, 0);
  } else {
    ini = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  }
  return ventasStore.ventas.filter((v) => !v.anulada && new Date(v.fecha) >= ini);
}

onMounted(() => {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
  idle(() => {
    renderChart();
    renderChartProductos();
  });
});

// Repintar al cambiar tema
watch(
  () => configStore.tema,
  () =>
    requestAnimationFrame(() => {
      renderChart();
      renderChartProductos();
    })
);

onBeforeUnmount(destruir);

// ===== RECOMENDACIONES =====
const recomendaciones = computed(() => insights.recomendaciones);
const recomendacionesUrgentes = computed(() => insights.recomendacionesUrgentes);

function colorNivel(nivel) {
  if (nivel === 'urgente') return '#DC2626';
  if (nivel === 'atencion') return '#D97706';
  if (nivel === 'oportunidad') return '#16A34A';
  return '#3B82F6';
}

function descartarAnomalia(clave) {
  if (!configStore.cfg.anomaliasDescartadas) configStore.cfg.anomaliasDescartadas = [];
  if (!configStore.cfg.anomaliasDescartadas.includes(clave)) {
    configStore.cfg.anomaliasDescartadas.push(clave);
    configStore.guardarCfg();
    toastMsg('Anomalia descartada');
  }
}

function restaurarAnomalias() {
  configStore.cfg.anomaliasDescartadas = [];
  configStore.guardarCfg();
  toastMsg('Anomalias restauradas');
}

function irAStock(filtro) {
  productosStore.setFiltroStock(filtro);
  ir(router, 'productos');
}

function irSeccion(s, refId) {
  ir(router, s, refId);
}
</script>
