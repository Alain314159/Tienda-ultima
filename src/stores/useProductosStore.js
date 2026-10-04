/**
 * Store de Productos
 * Gestiona el catálogo de productos y el stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m } from '../db';
import { useLotesStore } from './useLotesStore';

export const useProductosStore = defineStore('productos', () => {
  // ===== ESTADO =====
  const productos = ref([]);
  const busqProd = ref('');
  const mostrarArchivados = ref(false);

  // ===== STORES DEPENDIENTES =====
  const lotesStore = useLotesStore();

  // ===== GETTERS =====
  
  /**
   * Productos activos (no archivados)
   */
  const prodsActivos = computed(() => {
    return productos.value.filter(p => !p.archivado);
  });

  /**
   * Productos filtrados por búsqueda
   */
  const productosFiltrados = computed(() => {
    const q = busqProd.value.toLowerCase().trim();
    const stockMap = lotesStore.stockMap;
    
    return productos.value.filter(p => {
      if (!mostrarArchivados.value && p.archivado) return false;
      if ((stockMap[p.id] || 0) <= 0 && !mostrarArchivados.value) return false;
      if (q && !(p.nombre.toLowerCase().includes(q) || (p.codigo?.toLowerCase().includes(q)))) return false;
      return true;
    });
  });

  /**
   * Productos con stock bajo
   */
  const productosBajoStock = computed(() => {
    const stockMap = lotesStore.stockMap;
    return prodsActivos.value.filter(p => {
      const s = stockMap[p.id] || 0;
      return s > 0 && s <= n(p.stockMinimo || 5);
    });
  });

  /**
   * Productos agotados
   */
  const productosAgotados = computed(() => {
    const stockMap = lotesStore.stockMap;
    return prodsActivos.value.filter(p => (stockMap[p.id] || 0) <= 0.001);
  });

  /**
   * Obtiene el stock de un producto
   */
  function stock(productoId) {
    return lotesStore.stock(productoId);
  }

  /**
   * Verifica si un producto tiene escalones de precio
   */
  function tieneEscalones(productoId) {
    const p = productos.value.find(p => p.id === productoId);
    return p && p.preciosEscalonados && p.preciosEscalonados.length > 0;
  }

  /**
   * Obtiene el precio para una cantidad específica
   */
  function precioParaCantidad(productoId, cantidad) {
    const p = productos.value.find(p => p.id === productoId);
    if (!p) return 0;
    
    if (!p.preciosEscalonados || p.preciosEscalonados.length === 0) {
      return n(p.precio);
    }
    
    // Buscar el escalón apropiado
    const cant = n(cantidad);
    const escalones = p.preciosEscalonados.sort((a, b) => n(b.min) - n(a.min));
    
    for (const e of escalones) {
      if (cant >= n(e.min)) {
        return n(e.precio);
      }
    }
    
    return n(p.precio);
  }

  // ===== ACCIONES =====
  
  /**
   * Carga los productos desde IndexedDB
   */
  async function cargarProductos() {
    try {
      productos.value = await db.productos.toArray();
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  }

  /**
   * Guarda un producto
   */
  async function guardarProducto(producto) {
    try {
      await P(db.productos, producto);
      await cargarProductos();
    } catch (e) {
      console.error('Error guardando producto:', e);
      throw e;
    }
  }

  /**
   * Elimina un producto (solo si no tiene lotes con ventas)
   */
  async function eliminarProducto(productoId) {
    try {
      const lotesConVentas = lotesStore.lotes.value.filter(
        l => l.productoId === productoId && n(l.cantidadVendida) > 0
      );
      
      if (lotesConVentas.length > 0) {
        throw new Error('No se puede eliminar: el producto tiene ventas registradas');
      }
      
      await db.productos.delete(productoId);
      await cargarProductos();
    } catch (e) {
      console.error('Error eliminando producto:', e);
      throw e;
    }
  }

  /**
   * Archiva/Desarchiva un producto
   */
  async function toggleArchivarProducto(productoId) {
    try {
      const p = productos.value.find(p => p.id === productoId);
      if (p) {
        await P(db.productos, { ...p, archivado: !p.archivado });
        await cargarProductos();
      }
    } catch (e) {
      console.error('Error archivando producto:', e);
      throw e;
    }
  }

  /**
   * Actualiza la búsqueda de productos
   */
  function setBusqProd(termino) {
    busqProd.value = termino;
  }

  /**
   * Toggle para mostrar/ocultar productos archivados
   */
  function toggleMostrarArchivados() {
    mostrarArchivados.value = !mostrarArchivados.value;
  }

  // ===== EXPORTS =====
  return {
    productos,
    prodsActivos,
    productosFiltrados,
    productosBajoStock,
    productosAgotados,
    busqProd,
    mostrarArchivados,
    stock,
    tieneEscalones,
    precioParaCantidad,
    cargarProductos,
    guardarProducto,
    eliminarProducto,
    toggleArchivarProducto,
    setBusqProd,
    toggleMostrarArchivados
  };
});

export default useProductosStore;
