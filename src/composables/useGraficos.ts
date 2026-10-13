/**
 * Composable de datos para los gráficos del dashboard.
 *
 * Puro: sin DOM ni instancias de Chart.js. La presentación vive en
 * `components/charts/ChartVentas.vue` y `ChartProductos.vue` (vue-chartjs
 * declarativo) y se actualiza sola por reactividad cuando cambian las
 * ventas o la configuración.
 */
import { useConfigStore } from '../stores/useConfigStore';
import { useVentasStore } from '../stores/useVentasStore';
import { n } from '../utils/numero';

export interface BucketVentas {
  ini: Date;
  fin: Date;
  label: string;
  v: number;
  g: number;
  tipo: 'dia' | 'semana' | 'mes';
}

export interface ProductoTop {
  id: string;
  nombre: string;
  cantidad: number;
  ganancia: number;
  ingresos: number;
}

export function useGraficos() {
  const configStore = useConfigStore();
  const ventasStore = useVentasStore();

  /** Buckets de ventas/ganancia según vista (dia = 14 días, semana = 8, mes = 6). */
  function datosVentas(): BucketVentas[] {
    const vista = configStore.cfg.graficoVista || 'mes';
    const data: BucketVentas[] = [];
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
    return data;
  }

  /** Top 6 productos del periodo (semana/mes) por cantidad o margen. */
  function topProductos(): ProductoTop[] {
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
    const map: Record<string, ProductoTop> = {};
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

  function setGraficoVista(vista: 'dia' | 'semana' | 'mes') {
    if (configStore.cfg.graficoVista === vista) return;
    configStore.cfg.graficoVista = vista;
    configStore.guardarCfg();
  }

  function setGraficoProdTipo(t: 'vendidos' | 'margen') {
    if (configStore.cfg.graficoProdTipo === t) return;
    configStore.cfg.graficoProdTipo = t;
    configStore.guardarCfg();
  }

  function setGraficoProdPeriodo(p: 'semana' | 'mes') {
    if (configStore.cfg.graficoProdPeriodo === p) return;
    configStore.cfg.graficoProdPeriodo = p;
    configStore.guardarCfg();
  }

  return {
    datosVentas,
    topProductos,
    setGraficoVista,
    setGraficoProdTipo,
    setGraficoProdPeriodo,
  };
}
