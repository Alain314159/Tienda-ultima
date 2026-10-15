/**
 * Store de Productos
 * Gestiona el catálogo de productos y el stock
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Producto, Escalon, Empaque } from '../types';
import { n } from '../utils/numero';
import { fmtCant } from '../utils/formato';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { useLotesStore } from './useLotesStore';
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
      if (q && !(p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q))) return false;
      if (filtroStock.value === 'agotados' && (stockMap[p.id] || 0) > 0.001) return false;
      if (filtroStock.value === 'bajos') {
        const s = stockMap[p.id] || 0;
        if (!(s > 0 && s <= n(p.stockMinimo || 5))) return false;
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
      return s > 0 && s <= n(p.stockMinimo || 5);
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
   * Verifica si un producto tiene escalones de precio
   */
  function tieneEscalones(productoId: string) {
    const prod = productos.value.find((p) => p.id === productoId);
    return prod && prod.preciosEscalonados && prod.preciosEscalonados.length > 0;
  }

  /**
   * Obtiene el precio para una cantidad específica
   */
  function precioParaCantidad(productoId: string, cantidad: number | string) {
    const prod = productos.value.find((p) => p.id === productoId);
    if (!prod) return 0;

    if (!prod.preciosEscalonados || prod.preciosEscalonados.length === 0) {
      return n(prod.precio);
    }

    // Buscar el escalón apropiado. Copia ANTES de ordenar: sort() muta el
    // array reactivo del store in situ (efecto colateral en cada llamada) y
    // se descartan escalones corruptos (precio ≤ 0 o no finito: un respaldo
    // editado a mano o una versión vieja podían colar precios negativos que
    // aquí se traducían en ventas con total negativo)
    const cant = n(cantidad);
    const escalones = prod.preciosEscalonados
      .filter((e) => e && isFinite(n(e.min)) && isFinite(n(e.precio)) && n(e.precio) > 0 && n(e.min) >= 1)
      .sort((a, b) => n(b.min) - n(a.min));

    for (const e of escalones) {
      if (cant >= n(e.min)) {
        return n(e.precio);
      }
    }

    return n(prod.precio);
  }

  /**
   * Formatea el stock usando empaques (ej: "2 cajas + 5 und + 0.5").
   */
  function formatStock(prodId: string, cant: number | string) {
    const p = productos.value.find((x) => x.id === prodId);
    const total = n(cant);
    // Sin empaques: mostrar la cantidad tal cual (respeta fracciones)
    if (!p || !p.empaques || !p.empaques.length) return fmtCant(total);

    const emps = p.empaques.slice().sort((a, b) => n(b.unidades) - n(a.unidades));
    let rest = Math.floor(Math.abs(total));
    const partes: string[] = [];
    for (const e of emps) {
      const u = Math.floor(n(e.unidades));
      if (u <= 0) continue;
      const cantEmp = Math.floor(rest / u);
      if (cantEmp > 0) {
        partes.push(cantEmp + ' ' + e.nombre + (cantEmp > 1 ? 's' : ''));
        rest -= cantEmp * u;
      }
    }
    // Residual: entero suelto + fraccion (kg, litros, etc.)
    const fraccion = Math.abs(total) - Math.floor(Math.abs(total));
    if (rest > 0) partes.push(rest + ' ' + (p.unidad || 'und'));
    if (fraccion > 0.0001) partes.push(fmtCant(fraccion));
    if (partes.length === 0) return fmtCant(total);
    return partes.join(' + ');
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
  async function guardarProducto(producto: {
    editId?: string;
    nombre: string;
    precio: string | number;
    stockMin?: string | number;
    unidad?: string;
    preciosEscalonados?: Escalon[];
    empaques?: Empaque[];
    nota?: string;
  }) {
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
          unidad: v.data.unidad || original.unidad,
          preciosEscalonados: v.data.preciosEscalonados,
          empaques: v.data.empaques,
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
          preciosEscalonados: v.data.preciosEscalonados,
          empaques: v.data.empaques,
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
   * Archiva/Desarchiva un producto
   */
  async function toggleArchivarProducto(productoId: string) {
    try {
      const prod = productos.value.find((p) => p.id === productoId);
      if (prod) {
        await P(db.productos, { ...prod, archivado: !prod.archivado });
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
    tieneEscalones,
    precioParaCantidad,
    formatStock,
    badgeStock,
    txtBadge,
    cargarProductos,
    guardarProducto,
    toggleArchivarProducto,
    setBusqProd,
    toggleMostrarArchivados,
  };
});

export default useProductosStore;
