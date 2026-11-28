/**
 * Store de Gastos Operativos
 * Gestiona gastos, categorías y reportes
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Gasto } from '../types';
import { n, m } from '../utils/numero';
import { db } from '../db';
import { crearEnPeriodo } from '../utils/fecha';
import { useConfigStore } from './useConfigStore';
import { crearCargaPerezosa } from './cargaPerezosa';

export const useGastosStore = defineStore('gastos', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const gastos = ref<Gasto[]>([]);

  // ===== GETTERS =====

  /**
   * Gastos ordenados por fecha (más reciente primero).
   * Antes había dos computed con el mismo contenido (gastosOrdenadas /
   * gastosOrdenados): solo se usaba gastosOrdenados (GastosView + tests),
   * así que queda uno solo con el nombre que usan los consumidores.
   */
  const gastosOrdenados = computed(() => {
    return gastos.value.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  /**
   * Total de gastos acumulados
   */
  const gastosTotalAcumulado = computed(() => {
    return m(gastos.value.reduce((s, g) => s + n(g.monto), 0));
  });

  /**
   * Gastos del período actual
   */
  const gastosOpPeriodo = computed(() => {
    const enPeriodoActual = crearEnPeriodo(configStore.periodoInicio);
    return m(gastos.value.filter((g) => enPeriodoActual(g.fecha)).reduce((s, g) => s + n(g.monto), 0));
  });

  /**
   * Gastos por categoría
   */
  const gastosPorCategoria = computed(() => {
    const map: Record<string, number> = {};
    gastos.value.forEach((g) => {
      const c = g.categoria || 'Sin categoría';
      if (!map[c]) map[c] = 0;
      map[c] += n(g.monto);
    });
    return Object.keys(map)
      .map((k) => ({ cat: k, monto: m(map[k]) }))
      .sort((a, b) => b.monto - a.monto);
  });

  // ===== ACCIONES =====

  // Carga perezosa (4.8): la vista asegura la tabla al entrar; el arranque
  // solo la carga si forma parte del conjunto de inicio (ver recarga.ts).
  const cargaGastos = crearCargaPerezosa(cargarGastos);

  /**
   * Carga los gastos desde IndexedDB
   */
  async function cargarGastos() {
    try {
      gastos.value = await db.gastos.toArray();
      cargaGastos.marcarCargado();
    } catch (e) {
      console.error('Error cargando gastos:', e);
    }
  }

  /**
   * Elimina un gasto
   */
  async function eliminarGasto(gastoId: string) {
    try {
      const gasto = gastos.value.find((x) => x.id === gastoId);
      // El espejo en movCaja debe morir con el gasto: si sobrevive, saldoCaja
      // lo sigue restando mientras el libro diario lo excluye (movIdsDeGastos
      // solo contiene gastos vivos) → descuadre permanente libro vs sistema.
      await db.transaction('rw', db.gastos, db.movCaja, async () => {
        await db.gastos.delete(gastoId);
        if (gasto?.movId) await db.movCaja.delete(gasto.movId);
      });
      await cargarGastos();
    } catch (e) {
      console.error('Error eliminando gasto:', e);
      throw e;
    }
  }

  // ===== EXPORTS =====
  // (guardarGasto/editarGasto/gastoForm del store eliminados: eran código
  // muerto — GastosView tiene su propia implementación con el espejo contable
  // en movCaja, que la versión del store ni siquiera creía. Un duplicado que
  // no sincroniza es peor que no tenerlo.)
  return {
    gastos,
    gastosOrdenados,
    gastosTotalAcumulado,
    gastosOpPeriodo,
    gastosPorCategoria,
    cargarGastos,
    cargado: cargaGastos.cargado,
    asegurarGastos: cargaGastos.asegurar,
    eliminarGasto,
  };
});

export default useGastosStore;
