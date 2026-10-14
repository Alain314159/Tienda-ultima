/**
 * Store de Compras
 * Gestiona compras, proveedores y lógica relacionada.
 *
 * NOTA: la escritura de compras (alta/edición/borrado con su lote FIFO)
 * vive en ComprasView, que enlaza lote↔compra vía `compraId`. Las viejas
 * acciones guardarCompra/anularCompra de este store se eliminaron: eran
 * código muerto (la vista nunca las llamó) y su reversión de lote era
 * ambigua (matched por cantidad+costo en vez de por enlace).
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Compra } from '../types';
import { n, m } from '../utils/numero';
import { db } from '../db';
import { useConfigStore } from './useConfigStore';

export const useComprasStore = defineStore('compras', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const compras = ref<Compra[]>([]);

  // ===== GETTERS =====

  /**
   * Compras ordenadas por fecha (más reciente primero)
   */
  const comprasOrdenadas = computed(() => {
    return compras.value.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  /**
   * Compras del período actual
   */
  const comprasPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(compras.value.filter((c) => !c.anulada && new Date(c.fecha) >= ini).reduce((s, c) => s + n(c.total), 0));
  });

  /**
   * Total de compras (todas)
   */
  const comprasTotal = computed(() => {
    return m(compras.value.filter((c) => !c.anulada).reduce((s, c) => s + n(c.total), 0));
  });

  // ===== ACCIONES =====

  /**
   * Carga las compras desde IndexedDB
   */
  async function cargarCompras() {
    try {
      compras.value = await db.compras.toArray();
    } catch (e) {
      console.error('Error cargando compras:', e);
    }
  }

  // ===== EXPORTS =====
  return {
    compras,
    comprasOrdenadas,
    comprasPeriodo,
    comprasTotal,
    cargarCompras,
  };
});

export default useComprasStore;
