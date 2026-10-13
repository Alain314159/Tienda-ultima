/**
 * Composable de gráficos (Chart.js).
 * Renderiza el gráfico de ventas/ganancia (barras) y el de top
 * productos (dona). Chart.js se carga dinámicamente (code-splitting).
 * Instanciado por DashboardView.
 */
import { nextTick } from 'vue';
import { n, m, fmt, fmtCant, fmtFecha } from '../db.js';
import { useConfigStore } from '../stores/useConfigStore.js';
import { useVentasStore } from '../stores/useVentasStore.js';

export function useGraficos() {
  const configStore = useConfigStore();
  const ventasStore = useVentasStore();

  let _chart = null;
  let _chartProd = null;

  function _destroys() {
    for (const c of [_chart, _chartProd]) {
      if (c) {
        try {
          c.destroy();
        } catch (e) {}
      }
    }
    _chart = null;
    _chartProd = null;
  }

  /** Repinta ambos gráficos en el próximo frame. */
  function repintar() {
    nextTick(() => requestAnimationFrame(() => renderChart()));
  }

  function repintarProductos() {
    nextTick(() => requestAnimationFrame(() => renderChartProductos()));
  }

  function setGraficoVista(vista) {
    if (configStore.cfg.graficoVista === vista) return;
    configStore.cfg.graficoVista = vista;
    configStore.guardarCfg();
    repintar();
  }

  function setGraficoProdTipo(t) {
    if (configStore.cfg.graficoProdTipo === t) return;
    configStore.cfg.graficoProdTipo = t;
    configStore.guardarCfg();
    repintarProductos();
  }

  function setGraficoProdPeriodo(p) {
    if (configStore.cfg.graficoProdPeriodo === p) return;
    configStore.cfg.graficoProdPeriodo = p;
    configStore.guardarCfg();
    repintarProductos();
  }

  function _topProductos() {
    const ahora = new Date();
    const periodo = configStore.cfg.graficoProdPeriodo || 'mes';
    let ini;
    if (periodo === 'semana') {
      ini = new Date(ahora);
      ini.setDate(ahora.getDate() - 6);
      ini.setHours(0, 0, 0, 0);
    } else {
      ini = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    }
    const tipo = configStore.cfg.graficoProdTipo || 'vendidos';
    const map = {};
    ventasStore.ventas
      .filter((v) => !v.anulada && new Date(v.fecha) >= ini)
      .forEach((v) => {
        v.items.forEach((it) => {
          if (!map[it.productoId]) {
            map[it.productoId] = { id: it.productoId, nombre: it.nombre, cantidad: 0, ganancia: 0, ingresos: 0 };
          }
          map[it.productoId].cantidad += n(it.cantidad);
          map[it.productoId].ganancia += n(it.ganancia);
          map[it.productoId].ingresos += n(it.precio) * n(it.cantidad);
        });
      });
    const lista = Object.values(map);
    if (tipo === 'margen') {
      lista.sort((a, b) => b.ganancia - a.ganancia);
    } else {
      lista.sort((a, b) => b.cantidad - a.cantidad);
    }
    return lista.slice(0, 6);
  }

  async function renderChartProductos() {
    try {
      const cv = document.getElementById('chartProductos');
      if (!cv) return;
      if (_chartProd) {
        try {
          _chartProd.destroy();
        } catch (e) {}
        _chartProd = null;
      }
      const items = _topProductos();
      if (items.length === 0) {
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        return;
      }
      const { default: Chart } = await import('chart.js/auto');
      const tipo = configStore.cfg.graficoProdTipo || 'vendidos';
      const valorDe = (it) => (tipo === 'margen' ? it.ganancia : it.cantidad);
      const formatDe = (it) => (tipo === 'margen' ? fmt(it.ganancia) : fmtCant(it.cantidad) + ' u');
      const colores = ['#3B82F6', '#16A34A', '#D97706', '#8B5CF6', '#EC4899', '#0891B2'];
      const dark = configStore.tema === 'dark';
      const txt = dark ? '#94a3b8' : '#6b7280';
      _chartProd = new Chart(cv.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: items.map((it) => it.nombre),
          datasets: [
            {
              data: items.map((it) => valorDe(it)),
              backgroundColor: colores,
              borderWidth: 2,
              borderColor: dark ? '#1e293b' : '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          animation: { duration: 500 },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: txt, boxWidth: 12, font: { size: 10 }, padding: 8 },
            },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const it = items[c.dataIndex];
                  return ' ' + it.nombre + ': ' + formatDe(it);
                },
              },
            },
          },
        },
      });
    } catch (e) {
      console.error('renderChartProductos', e);
    }
  }

  async function renderChart() {
    try {
      const cv = document.getElementById('chartVentas');
      if (!cv) return;
      if (_chart) {
        try {
          _chart.destroy();
        } catch (e) {}
        _chart = null;
      }
      const { default: Chart } = await import('chart.js/auto');

      const vista = configStore.cfg.graficoVista || 'mes';
      const data = [];
      const now = new Date();

      if (vista === 'dia') {
        // Ultimos 14 dias
        for (let i = 13; i >= 0; i--) {
          const ini = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
          const fin = new Date(ini);
          fin.setHours(23, 59, 59, 999);
          const label = ini.getDate() + '/' + (ini.getMonth() + 1);
          data.push({ ini, fin, label, v: 0, g: 0, tipo: 'dia' });
        }
      } else if (vista === 'semana') {
        for (let i = 7; i >= 0; i--) {
          const fin = new Date(now);
          fin.setDate(now.getDate() - i * 7);
          fin.setHours(23, 59, 59, 999);
          const ini = new Date(fin);
          ini.setDate(fin.getDate() - 6);
          ini.setHours(0, 0, 0, 0);
          const label = ini.getDate() + '/' + (ini.getMonth() + 1);
          data.push({ ini, fin, label, v: 0, g: 0, tipo: 'semana' });
        }
      } else {
        for (let i = 5; i >= 0; i--) {
          const ini = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
          const fin = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
          const label = ini.toLocaleDateString('es', { month: 'short' });
          data.push({ ini, fin, label, v: 0, g: 0, tipo: 'mes' });
        }
      }

      ventasStore.ventas
        .filter((x) => !x.anulada)
        .forEach((v) => {
          const f = new Date(v.fecha);
          const bucket = data.find((b) => f >= b.ini && f <= b.fin);
          if (bucket) {
            bucket.v += n(v.total);
            bucket.g += n(v.ganancia);
          }
        });

      const dark = configStore.tema === 'dark';
      const txt = dark ? '#94a3b8' : '#6b7280';
      const grid = dark ? '#334155' : '#e5e7eb';

      _chart = new Chart(cv.getContext('2d'), {
        type: 'bar',
        data: {
          labels: data.map((x) => x.label),
          datasets: [
            { label: 'Ventas', data: data.map((x) => m(x.v)), backgroundColor: '#2196F3', borderRadius: 4 },
            { label: 'Ganancia', data: data.map((x) => m(x.g)), backgroundColor: '#16a34a', borderRadius: 4 },
          ],
        },
        options: {
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
                label: (c) => ' ' + c.dataset.label + ': ' + fmt(c.raw),
              },
            },
          },
          scales: {
            x: { ticks: { color: txt, font: { size: 9 } }, grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: { color: txt, font: { size: 9 }, callback: (v) => '$' + v.toLocaleString() },
              grid: { color: grid },
            },
          },
        },
      });
    } catch (e) {
      console.error('renderChart', e);
    }
  }

  function destruir() {
    _destroys();
  }

  return {
    renderChart,
    renderChartProductos,
    repintar,
    repintarProductos,
    setGraficoVista,
    setGraficoProdTipo,
    setGraficoProdPeriodo,
    destruir,
  };
}
