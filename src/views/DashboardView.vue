<template>
  <section v-if="app.sec === 'dashboard'" class="fade-up">
    <div class="balance azul">
      <div class="lbl"><icon name="wallet" :size="14" color="#fff"></icon> Efectivo en Caja</div>
      <div class="val">{{ app.fmt(app.cajaStore.saldoCaja) }}</div>
      <div class="sub">
        Inventario: {{ app.fmt(app.lotesStore.valorInventario) }} · Desde
        {{ app.fmtFecha(app.configStore.periodoInicio) }}
      </div>
    </div>

    <div
      v-if="app.productosStore.productosBajoStock.length || app.productosStore.productosAgotados.length"
      class="alert-box-stock"
    >
      <div
        v-if="app.productosStore.productosAgotados.length"
        class="alert-chip alert-out"
        @click="app.irAStock('agotados')"
      >
        <icon name="alert" :size="14" color="#fff"></icon>
        <b>{{ app.productosStore.productosAgotados.length }}</b> agotado(s)
      </div>
      <div
        v-if="app.productosStore.productosBajoStock.length"
        class="alert-chip alert-low"
        @click="app.irAStock('bajos')"
      >
        <icon name="alert" :size="14" color="#fff"></icon>
        <b>{{ app.productosStore.productosBajoStock.length }}</b> bajo(s)
      </div>
    </div>

    <div class="grid2">
      <div class="stat">
        <div class="lbl"><icon name="trend" :size="13" :color="app.mutColor"></icon> Ventas</div>
        <div class="val" style="color: var(--pri)">{{ app.fmt(app.ventasStore.ventasPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="dollar" :size="13" :color="app.mutColor"></icon> Ganancia</div>
        <div class="val pos">{{ app.fmt(app.cierresStore.gananciaNetaPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="bag" :size="13" :color="app.mutColor"></icon> Compras</div>
        <div class="val neg">{{ app.fmt(app.cierresStore.comprasPeriodo) }}</div>
      </div>
      <div class="stat">
        <div class="lbl"><icon name="chart" :size="13" :color="app.mutColor"></icon> Margen</div>
        <div class="val" style="color: var(--pri)">{{ app.cierresStore.margenPeriodo }}%</div>
      </div>
    </div>

    <!-- GRAFICO_CIRCULAR_V1 -->
    <div class="card" style="margin-top: 0.8rem">
      <div
        class="card-title"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem"
      >
        <span style="display: flex; align-items: center; gap: 0.55rem">
          <icon name="chart" :size="18" :color="app.sec === 'dashboard' ? '#2196F3' : app.mutColor"></icon>
          Ventas vs Ganancia
        </span>
        <span class="chart-toggle">
          <button :class="{ activo: app.cfg.graficoVista === 'dia' }" @click="app.setGraficoVista('dia')">Días</button>
          <button :class="{ activo: app.cfg.graficoVista === 'semana' }" @click="app.setGraficoVista('semana')">
            Semana
          </button>
          <button :class="{ activo: app.cfg.graficoVista === 'mes' }" @click="app.setGraficoVista('mes')">Mes</button>
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
          <icon name="package" :size="18" :color="app.sec === 'dashboard' ? '#2196F3' : app.mutColor"></icon>
          Top productos
        </span>
        <span class="chart-toggle">
          <button
            :class="{ activo: app.cfg.graficoProdPeriodo === 'semana' }"
            @click="app.setGraficoProdPeriodo('semana')"
          >
            Sem
          </button>
          <button :class="{ activo: app.cfg.graficoProdPeriodo === 'mes' }" @click="app.setGraficoProdPeriodo('mes')">
            Mes
          </button>
        </span>
      </div>
      <div
        class="chart-toggle"
        style="display: flex; justify-content: center; margin-bottom: 0.5rem; background: transparent"
      >
        <button :class="{ activo: app.cfg.graficoProdTipo === 'vendidos' }" @click="app.setGraficoProdTipo('vendidos')">
          Más vendidos
        </button>
        <button :class="{ activo: app.cfg.graficoProdTipo === 'margen' }" @click="app.setGraficoProdTipo('margen')">
          Más margen
        </button>
      </div>
      <div class="chart-wrap" v-if="app._topProductosGrafico().length > 0"><canvas id="chartProductos"></canvas></div>
      <div v-else class="empty" style="padding: 2rem 1rem">Sin ventas en este periodo</div>
    </div>

    <div class="card rec-card" v-if="app.recomendaciones.length">
      <div class="card-title">
        <icon name="zap" :size="18" :color="'#D97706'"></icon>
        Recomendaciones
        <span v-if="app.recomendacionesUrgentes > 0" class="badge out" style="margin-left: auto"
          >{{ app.recomendacionesUrgentes }} urgente(s)</span
        >
      </div>
      <div
        v-for="(rec, i) in app.recomendaciones"
        :key="i"
        class="rec-row"
        :class="'rec-' + rec.nivel"
        @click="app.ir(rec.sec, rec.refId)"
      >
        <div class="rec-icon">
          <icon :name="rec.icono" :size="16" :color="app.colorNivel(rec.nivel)"></icon>
        </div>
        <div class="rec-body">
          <div class="rec-title">{{ rec.titulo }}</div>
          <div class="rec-detail">{{ rec.detalle }}</div>
        </div>
        <button v-if="rec.clave" class="rec-x" @click.stop="app.descartarAnomalia(rec.clave)" aria-label="Descartar">
          <icon name="x" :size="12" :color="app.mutColor"></icon>
        </button>
      </div>
      <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap">
        <button
          v-if="app.cfg.anomaliasDescartadas && app.cfg.anomaliasDescartadas.length"
          class="link-btn"
          @click="app.restaurarAnomalias"
        >
          Restaurar {{ app.cfg.anomaliasDescartadas.length }} descartada(s)
        </button>
      </div>
    </div>
  </section>
</template>

<script>
import { useApp } from '../contexts/appContext.js';

export default {
  name: 'DashboardView',
  setup() {
    const app = useApp();
    return { app };
  },
};
</script>
