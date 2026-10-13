/**
 * Store de Insights (Pinia).
 * Calcula las recomendaciones/anomalías de negocio a partir de los
 * stores de datos. Único responsable del análisis de recomendaciones.
 */
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { generarRecomendaciones } from '../insights';
import { fmt, fmtCant } from '../utils/formato';
import { useConfigStore } from './useConfigStore';
import { useProductosStore } from './useProductosStore';
import { useLotesStore } from './useLotesStore';
import { useVentasStore } from './useVentasStore';
import { useComprasStore } from './useComprasStore';
import { useAjustesStore } from './useAjustesStore';
import { useGastosStore } from './useGastosStore';
import { useCajaStore } from './useCajaStore';
import { useCierresStore } from './useCierresStore';

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
