/**
 * Store de Ajustes de Inventario
 * Gestiona ajustes, mermas y correcciones de stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, q, genId } from '../db';
import { useLotesStore } from './useLotesStore';
import { useConfigStore } from './useConfigStore';

export const useAjustesStore = defineStore('ajustes', () => {
  // ===== STORES DEPENDIENTES =====
  const lotesStore = useLotesStore();
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const ajustes = ref([]);
  const ajustesAbierto = ref(false);
  const ajusteForm = ref({
    editId: '',
    productoId: '',
    tipo: 'merma', // merma, ajuste, entrada
    cantidad: '',
    costo: '',
    nota: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  // ===== GETTERS =====

  /**
   * Ajustes ordenados por fecha (más reciente primero)
   */
  const ajustesOrdenados = computed(() => {
    return ajustes.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
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
   * Guarda un ajuste
   */
  async function guardarAjuste() {
    const a = ajusteForm.value;
    const cantidad = n(a.cantidad);
    const costo = n(a.costo) || 0;

    if (cantidad === 0) return { error: 'Cantidad debe ser diferente de cero' };
    if (!a.productoId) return { error: 'Selecciona un producto' };

    try {
      const ajuste = {
        id: a.editId || genId('a'),
        productoId: a.productoId,
        tipo: a.tipo,
        cantidad: cantidad,
        costo: costo,
        costoPerdida: a.tipo === 'merma' ? Math.abs(cantidad) * costo : 0,
        nota: a.nota?.trim() || '',
        fecha: a.fecha,
        anulada: false
      };

      await db.transaction('rw', db.ajustes, db.lotes, async () => {
        await P(db.ajustes, ajuste);

        // Actualizar lotes según el tipo de ajuste
        if (a.tipo === 'merma') {
          // Reducir stock de los lotes más antiguos (FIFO)
          const lotes = lotesStore.lotes
            .filter(l => l.productoId === a.productoId && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

          let restante = Math.abs(cantidad);
          for (const lote of lotes) {
            if (restante <= 0) break;
            const disponible = n(lote.cantidadInicial) - n(lote.cantidadVendida);
            const aAjustar = Math.min(disponible, restante);
            lote.cantidadVendida = q(n(lote.cantidadVendida) + aAjustar);
            restante -= aAjustar;
            await P(db.lotes, lote);
          }
        } else if (a.tipo === 'entrada') {
          // Aumentar stock
          const lotes = lotesStore.lotes
            .filter(l => l.productoId === a.productoId)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

          if (lotes.length > 0) {
            // Añadir al lote más reciente
            const lote = lotes[0];
            lote.cantidadInicial = q(n(lote.cantidadInicial) + cantidad);
            await P(db.lotes, lote);
          }
        }
      });

      await cargarAjustes();
      await lotesStore.cargarLotes();

      return { ajuste, success: true };
    } catch (e) {
      console.error('Error guardando ajuste:', e);
      return { error: 'Error guardando ajuste' };
    }
  }

  /**
   * Anula un ajuste
   */
  async function anularAjuste(id) {
    const a = ajustes.value.find(x => x.id === id);
    if (!a || a.anulada) return { error: 'Ajuste no encontrado o ya anulado' };

    try {
      await db.transaction('rw', db.ajustes, db.lotes, async () => {
        await P(db.ajustes, { ...a, anulada: true, fechaAnulacion: new Date().toISOString() });

        // Revertir el ajuste en lotes
        if (a.tipo === 'merma') {
          // Devolver stock
          const lotes = lotesStore.lotes
            .filter(l => l.productoId === a.productoId)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

          if (lotes.length > 0) {
            const lote = lotes[0];
            lote.cantidadVendida = Math.max(0, q(n(lote.cantidadVendida) - Math.abs(a.cantidad)));
            await P(db.lotes, lote);
          }
        } else if (a.tipo === 'entrada') {
          // Reducir stock
          const lotes = lotesStore.lotes
            .filter(l => l.productoId === a.productoId && (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

          let restante = cantidad;
          for (const lote of lotes) {
            if (restante <= 0) break;
            const disponible = n(lote.cantidadInicial) - n(lote.cantidadVendida);
            const aAjustar = Math.min(disponible, restante);
            lote.cantidadInicial = q(n(lote.cantidadInicial) - aAjustar);
            restante -= aAjustar;
            await P(db.lotes, lote);
          }
        }
      });

      await cargarAjustes();
      await lotesStore.cargarLotes();

      return { success: true };
    } catch (e) {
      console.error('Error anulantdo ajuste:', e);
      return { error: 'Error anulantdo ajuste' };
    }
  }

  /**
   * Recarga datos específicos
   */
  async function recargarStores(tables) {
    const reloadMap = {
      ajustes: cargarAjustes,
      lotes: lotesStore.cargarLotes
    };

    for (const table of tables) {
      if (reloadMap[table]) {
        await reloadMap[table]();
      }
    }
  }

  /**
   * Abre/Cierra el panel de ajustes
   */
  function toggleAjustes() {
    ajustesAbierto.value = !ajustesAbierto.value;
  }

  /**
   * Resetea el formulario de ajuste
   */
  function resetAjuste() {
    ajusteForm.value = {
      editId: '',
      productoId: '',
      tipo: 'merma',
      cantidad: '',
      costo: '',
      nota: '',
      fecha: new Date().toISOString().split('T')[0]
    };
  }

  // ===== EXPORTS =====
  return {
    ajustes,
    ajustesAbierto,
    ajusteForm,
    ajustesOrdenados,
    ajustesRecientes,
    cargarAjustes,
    guardarAjuste,
    anularAjuste,
    recargarStores,
    toggleAjustes,
    resetAjuste
  };
});

export default useAjustesStore;
