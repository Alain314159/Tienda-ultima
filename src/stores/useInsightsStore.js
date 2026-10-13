/**
 * Store de Insights (Pinia).
 * Calcula las recomendaciones/anomalías de negocio a partir de los
 * stores de datos. Único responsable del análisis de recomendaciones.
 */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { generarRecomendaciones } from '../insights.js';
import { fmt, fmtCant } from '../db.js';
import { useConfigStore } from './useConfigStore.js';
import { useProductosStore } from './useProductosStore.js';
import { useLotesStore } from './useLotesStore.js';
import { useVentasStore } from './useVentasStore.js';
import { useComprasStore } from './useComprasStore.js';
import { useAjustesStore } from './useAjustesStore.js';
import { useGastosStore } from './useGastosStore.js';
import { useCajaStore } from './useCajaStore.js';
import { useCierresStore } from './useCierresStore.js';

export const useInsightsStore = defineStore('insights', () => {
  const configStore = useConfigStore();
  const productosStore = useProductosStore();
  const lotesStore = useLotesStore();
  const ventasStore = useVentasStore();
  const comprasStore = useComprasStore();
  const ajustesStore = useAjustesStore();
  const gastosStore = useGastosStore();
  const cajaStore = useCajaStore();
  const cierresStore = useCierresStore();

  const recomendaciones = computed(() => {
    try {
      const list = generarRecomendaciones({
        ventas: ventasStore.ventas,
        compras: comprasStore.compras,
        gastos: gastosStore.gastos,
        ajustes: ajustesStore.ajustes,
        productos: productosStore.productos,
        lotes: lotesStore.lotes,
        cierres: cierresStore.cierres,
        movCaja: cajaStore.movCaja,
        saldoCaja: cajaStore.saldoCaja,
        cfg: configStore.cfg,
        formatMoney: fmt,
        formatNum: fmtCant,
        stockDe: (pid) => productosStore.stock(pid),
      });
      const descartadas = configStore.cfg.anomaliasDescartadas || [];
      return list.filter((r) => !descartadas.includes(r.clave)).slice(0, 8);
    } catch (e) {
      console.error('recomendaciones', e);
      return [];
    }
  });

  const recomendacionesUrgentes = computed(() => recomendaciones.value.filter((r) => r.nivel === 'urgente').length);

  return { recomendaciones, recomendacionesUrgentes };
});
