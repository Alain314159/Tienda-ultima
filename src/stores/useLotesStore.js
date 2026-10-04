/**
 * Store de Lotes
 * Gestiona el inventario por lotes y el cálculo FIFO
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, q } from '../db';
import { calcFIFO } from '../services/fifo';

export const useLotesStore = defineStore('lotes', () => {
  // ===== ESTADO =====
  const lotes = ref([]);

  // ===== GETTERS =====
  
  /**
   * Lotes activos (con stock disponible)
   */
  const lotesActivos = computed(() => {
    return lotes.value.filter(l => (n(l.cantidadInicial) - n(l.cantidadVendida)) > 0);
  });

  /**
   * Lotes por producto (agrupados)
   */
  const lotesPorProducto = computed(() => {
    const map = {};
    for (const l of lotes.value) {
      const pid = l.productoId;
      if (!map[pid]) map[pid] = [];
      map[pid].push(l);
    }
    
    // Ordenar por fecha (FIFO)
    for (const pid in map) {
      map[pid].sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
    }
    
    return map;
  });

  /**
   * Mapa de stock por producto
   */
  const stockMap = computed(() => {
    const map = {};
    
    // Inicializar con 0 para todos los productos
    // (se actualizará cuando se carguen los productos)
    for (const l of lotes.value) {
      if (map[l.productoId] === undefined) {
        map[l.productoId] = 0;
      }
      map[l.productoId] += (n(l.cantidadInicial) - n(l.cantidadVendida));
    }
    
    return map;
  });

  /**
   * Valor total del inventario
   */
  const valorInventario = computed(() => {
    return m(lotes.value.reduce((sum, l) => {
      const stock = q(n(l.cantidadInicial) - n(l.cantidadVendida));
      return sum + (stock * n(l.costo));
    }, 0));
  });

  /**
   * Obtiene el stock de un producto específico
   */
  function stock(productoId) {
    const lotesDelProducto = lotes.value.filter(l => l.productoId === productoId);
    return m(lotesDelProducto.reduce((sum, l) => {
      return sum + q(n(l.cantidadInicial) - n(l.cantidadVendida));
    }, 0));
  }

  /**
   * Verifica si un lote tiene ventas registradas
   */
  function loteSinVentas(loteId) {
    const lote = lotes.value.find(l => l.id === loteId);
    return lote && n(lote.cantidadVendida) <= 0;
  }

  /**
   * Calcula el costo FIFO para una cantidad de producto
   */
  function calcFIFO(productoId, cantidad) {
    return calcFIFO(productoId, cantidad, lotes.value);
  }

  // ===== ACCIONES =====
  
  /**
   * Carga los lotes desde IndexedDB
   */
  async function cargarLotes() {
    try {
      lotes.value = await db.lotes.toArray();
    } catch (e) {
      console.error('Error cargando lotes:', e);
    }
  }

  /**
   * Guarda un lote
   */
  async function guardarLote(lote) {
    try {
      await P(db.lotes, lote);
      await cargarLotes();
    } catch (e) {
      console.error('Error guardando lote:', e);
      throw e;
    }
  }

  /**
   * Elimina un lote (solo si no tiene ventas)
   */
  async function eliminarLote(loteId) {
    try {
      if (!loteSinVentas(loteId)) {
        throw new Error('No se puede eliminar: el lote tiene ventas registradas');
      }
      
      await db.lotes.delete(loteId);
      await cargarLotes();
    } catch (e) {
      console.error('Error eliminando lote:', e);
      throw e;
    }
  }

  /**
   * Actualiza lotes en batch
   */
  async function actualizarLotesBatch(lotesActualizados) {
    try {
      await db.lotes.bulkPut(lotesActualizados);
      await cargarLotes();
    } catch (e) {
      console.error('Error actualizando lotes:', e);
      throw e;
    }
  }

  // ===== EXPORTS =====
  return {
    lotes,
    lotesActivos,
    lotesPorProducto,
    stockMap,
    valorInventario,
    stock,
    loteSinVentas,
    calcFIFO,
    cargarLotes,
    guardarLote,
    eliminarLote,
    actualizarLotesBatch
  };
});

export default useLotesStore;
