/**
 * Store de Ajustes de Inventario
 * Gestiona ajustes, mermas y correcciones de stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Ajuste } from '../types';
import { db } from '../db';
import { useLotesStore } from './useLotesStore';

export const useAjustesStore = defineStore('ajustes', () => {
  // ===== STORES DEPENDIENTES =====
  const lotesStore = useLotesStore();

  // ===== ESTADO =====
  const ajustes = ref<Ajuste[]>([]);

  // ===== GETTERS =====

  /**
   * Ajustes ordenados por fecha (más reciente primero)
   */
  const ajustesOrdenados = computed(() => {
    return ajustes.value.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  /**
   * Ajustes recientes (últimos 20)
   */
  const ajustesRecientes = computed(() => {
    return ajustesOrdenados.value.slice(0, 20);
  });

  // ===== ACCIONES =====

  /**
   * Carga los ajustes desde IndexedDB
   */
  async function cargarAjustes() {
    try {
      ajustes.value = await db.ajustes.toArray();
    } catch (e) {
      console.error('Error cargando ajustes:', e);
    }
  }

  /**
   * Recarga datos específicos
   */
  async function recargarStores(tables: string[]) {
    const reloadMap: Record<string, () => Promise<void>> = {
      ajustes: cargarAjustes,
      lotes: lotesStore.cargarLotes,
    };

    for (const table of tables) {
      if (reloadMap[table]) {
        await reloadMap[table]();
      }
    }
  }

  // ===== EXPORTS =====
  return {
    ajustes,
    ajustesOrdenados,
    ajustesRecientes,
    cargarAjustes,
    recargarStores,
  };
});

export default useAjustesStore;
