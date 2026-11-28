/**
 * Store de Productos
 * Gestiona el catálogo de productos y el stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Producto } from '../types';
import { n, stockMinEfectivo } from '../utils/numero';
import { fmtCant } from '../utils/formato';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { useLotesStore } from './useLotesStore';
import { crearCargaPerezosa } from './cargaPerezosa';
import { productoSchema, validar } from '../schemas/index';

export const useProductosStore = defineStore('productos', () => {
  // ===== ESTADO =====
  const productos = ref<Producto[]>([]);
  const busqProd = ref('');
  const mostrarArchivados = ref(false);
  // Filtro de stock compartido entre vistas (dashboard lo activa)
  const filtroStock = ref<'agotados' | 'bajos' | null>(null);

  // ===== STORES DEPENDIENTES =====
  const lotesStore = useLotesStore();

  // ===== GETTERS =====

  /**
   * Productos activos (no archivados)
   */
  const prodsActivos = computed(() => {
    return productos.value.filter((p) => !p.archivado);
  });

  /**
   * Productos filtrados por búsqueda y filtro de stock (agotados/bajos).
   */
  const productosFiltrados = computed(() => {
    const q = busqProd.value.toLowerCase().trim();
    const stockMap = lotesStore.stockMap;

    return productos.value.filter((p) => {
      if (!mostrarArchivados.value && p.archivado) return false;
      // NO ocultar productos con stock 0: un producto recién creado (antes de
      // su primera compra) parecía "alta fallida" y llevaba a re-agregarlo y
      // duplicarlo. El filtro explícito 'agotados' existe para ese uso.
      if (
        q &&
        !(
          (p.nombre || '').toLowerCase().includes(q) ||
          String(p.codigo ?? '')
            .toLowerCase()
            .includes(q)
        )
      )
        return false;
      if (filtroStock.value === 'agotados' && (stockMap[p.id] || 0) > 0.001) return false;
      if (filtroStock.value === 'bajos') {
        const s = stockMap[p.id] || 0;
        if (!(s > 0 && s <= stockMinEfectivo(p.stockMinimo))) return false;
      }
      return true;
    });
  });

  /**
   * Productos con stock bajo
   */
  const productosBajoStock = computed(() => {
    const stockMap = lotesStore.stockMap;
    return prodsActivos.value.filter((p) => {
      const s = stockMap[p.id] || 0;
      return s > 0 && s <= stockMinEfectivo(p.stockMinimo);
    });
  });

  /**
   * Productos agotados
   */
  const productosAgotados = computed(() => {
    const stockMap = lotesStore.stockMap;
    return prodsActivos.value.filter((p) => (stockMap[p.id] || 0) <= 0.001);
  });

  /**
   * Obtiene el stock de un producto
   */
  function stock(productoId: string) {
    return lotesStore.stock(productoId);
  }

  /**
   * Formatea el stock de un producto: la cantidad tal cual (respeta
   * fracciones). Los empaques heredados de datos viejos se ignoran: el
   * stock se muestra siempre en unidades base.
   */
  function formatStock(_prodId: string, cant: number | string) {
    return fmtCant(n(cant));
  }

  /**
   * Badge de estado de stock para un producto: 'arch' | 'out' | 'low' | 'ok'
   */
  function badgeStock(p: Producto) {
    const s = stock(p.id);
    if (p.archivado) return 'arch';
    if (s === 0) return 'out';
    if (s <= n(p.stockMinimo)) return 'low';
    return 'ok';
  }

  /** Texto del badge de estado de stock. */
  function txtBadge(p: Producto) {
    const s = stock(p.id);
    if (p.archivado) return 'ARCHIVADO';
    if (s === 0) return 'AGOTADO';
    if (s <= n(p.stockMinimo)) return 'BAJO';
    return 'OK';
  }

  // ===== ACCIONES =====

  // Carga perezosa (4.8): la vista asegura la tabla al entrar; el arranque
  // solo la carga si forma parte del conjunto de inicio (ver recarga.ts).
  const cargaProductos = crearCargaPerezosa(cargarProductos);

  /**
   * Carga los productos desde IndexedDB
   */
  async function cargarProductos() {
    try {
      productos.value = await db.productos.toArray();
      cargaProductos.marcarCargado();
    } catch (e) {
      console.error('Error cargando productos:', e);
    }
  }

  /**
   * Guarda un producto
   */
  async function guardarProducto(producto: {
    editId?: string;
    nombre: string;
    precio: string | number;
    stockMin?: string | number;
    unidad?: string;
    nota?: string;
  }) {
    // El precio es único por producto: los campos heredados
    // preciosEscalonados/empaques que traiga un respaldo viejo se ignoran
    // (el schema los descarta) y nunca se vuelven a escribir en un alta.
    const v = validar(productoSchema, producto);
    if (!v.ok) throw new Error(v.error);
    try {
      // Anti-duplicados (comportamiento del monolito original)
      const nombre = v.data.nombre.trim().toLowerCase();
      const dup = productos.value.find(
        (x) => x.nombre.toLowerCase() === nombre && x.id !== producto.editId && !x.archivado
      );
      if (dup) throw new Error('Ya existe un producto con ese nombre');

      if (producto.editId) {
        // Edicion: preserva id y campos que el form no edita (codigo, fechaCreacion)
        const original = productos.value.find((x) => x.id === producto.editId);
        if (!original) throw new Error('Producto no encontrado');
        await P(db.productos, {
          ...original,
          nombre: v.data.nombre,
          precio: v.data.precio,
          stockMinimo: v.data.stockMin,
          // unidad SE SOBRESCRIBE (vaciarla debe borrarla: el "|| original.unidad"
          // hacia imposible quitarla una vez puesta)
          unidad: v.data.unidad,
          nota: v.data.nota,
        });
      } else {
        // Alta: genera id (la tabla no usa autoincrement)
        await P(db.productos, {
          id: genId('p'),
          nombre: v.data.nombre,
          precio: v.data.precio,
          stockMinimo: v.data.stockMin,
          unidad: v.data.unidad,
          nota: v.data.nota,
          archivado: false,
        });
      }
      await cargarProductos();
    } catch (e) {
      console.error('Error guardando producto:', e);
      throw e;
    }
  }

  /**
   * Actualiza la búsqueda de productos
   */
  function setBusqProd(termino: string) {
    busqProd.value = termino;
  }

  /** Activa el filtro de stock ('agotados' | 'bajos' | null). */
  function setFiltroStock(filtro: string) {
    filtroStock.value = (filtro || null) as 'agotados' | 'bajos' | null;
  }

  /** Limpia el filtro de stock. */
  function limpiarFiltroStock() {
    filtroStock.value = null;
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
    filtroStock,
    setFiltroStock,
    limpiarFiltroStock,
    stock,
    formatStock,
    badgeStock,
    txtBadge,
    cargarProductos,
    cargado: cargaProductos.cargado,
    asegurarProductos: cargaProductos.asegurar,
    guardarProducto,
    setBusqProd,
    toggleMostrarArchivados,
  };
});

export default useProductosStore;
