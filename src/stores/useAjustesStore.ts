/**
 * Store de Ajustes de Inventario
 * Gestiona ajustes, mermas y correcciones de stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Ajuste } from '../types';
import { n, m } from '../utils/numero';
import { db } from '../db';
import { crearEnPeriodo } from '../utils/fecha';
import { useConfigStore } from './useConfigStore';
import { crearCargaPerezosa } from './cargaPerezosa';

export const useAjustesStore = defineStore('ajustes', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();

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

  /**
   * Mermas del período actual: ajustes de salida (cantidad < 0)
   * desde periodoInicio, valoradas a costoPerdida.
   */
  const mermasPeriodo = computed(() => {
    const enPeriodoActual = crearEnPeriodo(configStore.periodoInicio);
    return m(
      ajustes.value
        .filter((a) => n(a.cantidad) < 0 && enPeriodoActual(a.fecha))
        .reduce((s, a) => s + n(a.costoPerdida), 0)
    );
  });

  // ===== ACCIONES =====

  // Carga perezosa (4.8): la vista asegura la tabla al entrar; el arranque
  // solo la carga si forma parte del conjunto de inicio (ver recarga.ts).
  const cargaAjustes = crearCargaPerezosa(cargarAjustes);

  /**
   * Carga los ajustes desde IndexedDB
   */
  async function cargarAjustes() {
    try {
      ajustes.value = await db.ajustes.toArray();
      cargaAjustes.marcarCargado();
    } catch (e) {
      console.error('Error cargando ajustes:', e);
    }
  }

  // ===== EXPORTS =====
  return {
    ajustes,
    ajustesOrdenados,
    ajustesRecientes,
    mermasPeriodo,
    cargarAjustes,
    cargado: cargaAjustes.cargado,
    asegurarAjustes: cargaAjustes.asegurar,
  };
});

export default useAjustesStore;
