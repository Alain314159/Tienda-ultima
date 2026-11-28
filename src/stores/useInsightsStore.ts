/**
 * Store de Insights (Pinia).
 * Calcula las recomendaciones/anomalías de negocio a partir de los
 * stores de datos. Único responsable del análisis de recomendaciones.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { watchDebounced } from '@vueuse/core';
import { generarRecomendaciones } from '../insights';
import type { Recomendacion } from '../types';
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

/**
 * Debounce del recálculo de avisos (4.3).
 * Antes `recomendaciones` era un `computed` síncrono que dependía de 9
 * stores: cada venta, gasto o lote que cambiaba lo invalidaba y el
 * siguiente render (el punto rojo de la barra lo lee siempre, no solo
 * en el Dashboard) pagaba un `generarRecomendaciones()` entero. En una
 * ráfaga — una venta con varios ítems, una sync que inserta decenas de
 * registros, una importación — eso eran N recálculos completos seguidos.
 * Ahora el cálculo vive en un `ref` que se refresca con debounce:
 * los cambios que llegan dentro de la ventana se coalescen en UN solo
 * recálculo, y `maxWait` garantiza que en una ráfaga continua el punto
 * rojo no quede desactualizado más de 1 s. Valores iguales a los del
 * libro diario (4.4: 250 ms) y al carrito (300 ms): un retraso que el
 * usuario no percibe al registrar una venta.
 * El primer cálculo es síncrono al crear el store, como antes: el
 * primer render ya ve los avisos, el debounce solo retrasa los
 * siguientes. Las reglas NO cambian: el recálculo ejecuta exactamente
 * el mismo `generarRecomendaciones()` + filtro de descartadas + corte
 * a 8; solo cambia CUÁNDO corre, nunca QUÉ avisos salen.
 * No se trocea el motor en tandas: partir `generarRecomendaciones()`
 * en secciones con pausas obligaría a rehacer su ordenación (las
 * urgentes se cuentan DESPUÉS del corte a 8) y el coste de una sola
 * pasada ya está acotado con los Map/índices de la primera mitad
 * del 4.3; el problema que quedaba era la repetición, no la pasada.
 */
export const INSIGHTS_DEBOUNCE_MS = 250;
export const INSIGHTS_MAX_WAIT_MS = 1000;

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

  // El cálculo puro, sin cambios: mismo motor, mismo filtro de
  // descartadas y mismo corte a 8 que tenía el computed.
  function calcularRecomendaciones(): Recomendacion[] {
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
  }

  // Primer cálculo síncrono: el primer render ve los avisos igual que
  // con el computed. Los siguientes llegan por el watch con debounce.
  const recomendaciones = ref<Recomendacion[]>(calcularRecomendaciones());

  // `deep: true` es necesario: no solo importan los reemplazos de
  // array (carga/sync) y los push (nueva venta), también las ediciones
  // en el sitio (anular una venta, cambiar el precio de un producto,
  // descartar una anomalía en cfg). El recorrido profundo solo lee
  // propiedades — sin parsear fechas ni ordenar — y el cálculo caro
  // corre una sola vez por ventana, en el callback.
  watchDebounced(
    () => [
      ventasStore.ventas,
      comprasStore.compras,
      gastosStore.gastos,
      ajustesStore.ajustes,
      productosStore.productos,
      lotesStore.lotes,
      cierresStore.cierres,
      cajaStore.movCaja,
      cajaStore.saldoCaja,
      configStore.cfg,
    ],
    () => {
      recomendaciones.value = calcularRecomendaciones();
    },
    { deep: true, debounce: INSIGHTS_DEBOUNCE_MS, maxWait: INSIGHTS_MAX_WAIT_MS }
  );

  const recomendacionesUrgentes = computed(() => recomendaciones.value.filter((r) => r.nivel === 'urgente').length);

  return { recomendaciones, recomendacionesUrgentes };
});
