<template>
  <Doughnut v-if="canvasOk && items.length > 0" id="chartProductos" :data="chartData" :options="chartOptions" />
  <div v-else-if="canvasOk" class="empty" style="padding: 2rem 1rem">Sin ventas en este periodo</div>
</template>

<script setup lang="ts">
/**
 * Gráfico de dona Top Productos (vue-chartjs declarativo).
 * Gestiona su propio estado vacío; se actualiza solo por reactividad
 * cuando cambian ventas o la configuración de período/tipo.
 */
import { computed, ref, onMounted } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js';
import { useConfigStore } from '../../stores/useConfigStore';
import { fmt, fmtCant } from '../../utils/formato';
import { useGraficos } from '../../composables/useGraficos';

ChartJS.register(ArcElement, Tooltip, Legend);

defineOptions({ name: 'ChartProductos' });

const props = defineProps<{ dark: boolean }>();

const configStore = useConfigStore();
const { topProductos } = useGraficos();

// Entornos sin canvas 2D (tests DOM, WebViews restringidas): no renderizar
const canvasOk = ref(false);
onMounted(() => {
  canvasOk.value = !!document.createElement('canvas').getContext('2d');
});

const items = computed(() => topProductos());

const chartData = computed<ChartData<'doughnut'>>(() => {
  const tipo = configStore.cfg.graficoProdTipo || 'vendidos';
  const valorDe = (it: (typeof items.value)[number]) => (tipo === 'margen' ? it.ganancia : it.cantidad);
  const colores = ['#3B82F6', '#16A34A', '#D97706', '#8B5CF6', '#EC4899', '#0891B2'];
  return {
    labels: items.value.map((it) => it.nombre),
    datasets: [
      {
        data: items.value.map((it) => valorDe(it)),
        backgroundColor: colores,
        borderWidth: 2,
        borderColor: props.dark ? '#1e293b' : '#ffffff',
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<'doughnut'>>(() => {
  const txt = props.dark ? '#94a3b8' : '#6b7280';
  const tipo = configStore.cfg.graficoProdTipo || 'vendidos';
  const formatDe = (it: (typeof items.value)[number]) =>
    tipo === 'margen' ? fmt(it.ganancia) : fmtCant(it.cantidad) + ' u';
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%',
    animation: { duration: 500 },
    plugins: {
      legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 10 }, padding: 8 } },
      tooltip: {
        callbacks: {
          label: (c) => {
            const it = items.value[c.dataIndex];
            return it ? ' ' + it.nombre + ': ' + formatDe(it) : '';
          },
        },
      },
    },
  };
});
</script>
