<template>
  <Bar v-if="canvasOk" id="chartVentas" :data="chartData" :options="chartOptions" />
</template>

<script setup lang="ts">
/**
 * Gráfico de barras Ventas vs Ganancia (vue-chartjs declarativo).
 * Los datos llegan de useGraficos(); el chart se actualiza solo por
 * reactividad (sin getElementById ni destroy/re-create manual).
 */
import { computed, ref, onMounted } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { m } from '../../utils/numero';
import { fmt, fmtFecha } from '../../utils/formato';
import { useGraficos } from '../../composables/useGraficos';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

defineOptions({ name: 'ChartVentas' });

const props = defineProps<{ dark: boolean }>();

const { datosVentas } = useGraficos();

// Entornos sin canvas 2D (tests DOM, WebViews restringidas): no renderizar
const canvasOk = ref(false);
onMounted(() => {
  canvasOk.value = !!document.createElement('canvas').getContext('2d');
});

const buckets = computed(() => datosVentas());

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: buckets.value.map((x) => x.label),
  datasets: [
    { label: 'Ventas', data: buckets.value.map((x) => m(x.v)), backgroundColor: '#2196F3', borderRadius: 4 },
    { label: 'Ganancia', data: buckets.value.map((x) => m(x.g)), backgroundColor: '#16a34a', borderRadius: 4 },
  ],
}));

const chartOptions = computed<ChartOptions<'bar'>>(() => {
  const txt = props.dark ? '#94a3b8' : '#6b7280';
  const grid = props.dark ? '#334155' : '#e5e7eb';
  const data = buckets.value;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { position: 'bottom', labels: { color: txt, boxWidth: 12, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          title: (items) => {
            const b = data[items[0].dataIndex];
            if (!b) return '';
            if (b.tipo === 'dia') return fmtFecha(b.ini.toISOString());
            if (b.tipo === 'semana') return fmtFecha(b.ini.toISOString()) + ' - ' + fmtFecha(b.fin.toISOString());
            return b.ini.toLocaleDateString('es', { month: 'long', year: 'numeric' });
          },
          label: (c) => ' ' + c.dataset.label + ': ' + fmt(c.raw as number),
        },
      },
    },
    scales: {
      x: { ticks: { color: txt, font: { size: 9 } }, grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { color: txt, font: { size: 9 }, callback: (v) => '$' + Number(v).toLocaleString() },
        grid: { color: grid },
      },
    },
  };
});
</script>
