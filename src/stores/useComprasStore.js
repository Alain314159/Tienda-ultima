/**
 * Store de Compras
 * Gestiona compras, proveedores y lógica relacionada
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, genId } from '../db';
import { useConfigStore } from './useConfigStore';
import { useLotesStore } from './useLotesStore';
import { useProductosStore } from './useProductosStore';

export const useComprasStore = defineStore('compras', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();
  const lotesStore = useLotesStore();
  const productosStore = useProductosStore();

  // ===== ESTADO =====
  const compras = ref([]);
  const compraForm = ref({
    editId: '',
    productoId: '',
    fecha: new Date().toISOString().split('T')[0],
    cantidad: '',
    costo: '',
    nota: '',
    proveedor: '',
    empaqueId: '',
    precioEmpaque: '',
    cantidadEmpaque: '',
    usarEmpaque: false
  });
  const busqCompra = ref('');

  // ===== GETTERS =====

  /**
   * Compras ordenadas por fecha (más reciente primero)
   */
  const comprasOrdenadas = computed(() => {
    return compras.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  });

  /**
   * Compras del período actual
   */
  const comprasPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(compras.value
      .filter(c => !c.anulada && new Date(c.fecha) >= ini)
      .reduce((s, c) => s + n(c.total), 0));
  });

  /**
   * Total de compras (todas)
   */
  const comprasTotal = computed(() => {
    return m(compras.value
      .filter(c => !c.anulada)
      .reduce((s, c) => s + n(c.total), 0));
  });

  /**
   * Margen del período
   */
  const margenPeriodo = computed(() => {
    const ventasPeriodo = 0; // Se obtendrá de ventasStore
    const gananciaNetaPeriodo = 0; // Se obtendrá de cierresStore
    return ventasPeriodo > 0 
      ? ((gananciaNetaPeriodo / ventasPeriodo) * 100).toFixed(2) 
      : '0.00';
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

  /**
   * Guarda una compra
   */
  async function guardarCompra() {
    const c = compraForm.value;
    const cantidad = n(c.cantidad);
    const costo = n(c.costo);
    const total = cantidad * costo;

    if (cantidad <= 0) return { error: 'Cantidad inválida' };
    if (costo <= 0) return { error: 'Costo inválido' };
    if (!c.productoId) return { error: 'Selecciona un producto' };

    const producto = productosStore.productos.find(p => p.id === c.productoId);
    if (!producto) return { error: 'Producto no encontrado' };

    try {
      const compra = {
        id: c.editId || genId('c'),
        fecha: c.fecha,
        productoId: c.productoId,
        productoNombre: producto.nombre,
        cantidad: cantidad,
        costo: costo,
        total: m(total),
        nota: c.nota?.trim() || '',
        proveedor: c.proveedor?.trim() || '',
        empaqueId: c.usarEmpaque ? c.empaqueId : null,
        precioEmpaque: c.usarEmpaque ? n(c.precioEmpaque) : null,
        cantidadEmpaque: c.usarEmpaque ? n(c.cantidadEmpaque) : null,
        anulada: false
      };

      await db.transaction('rw', db.compras, db.lotes, async () => {
        await P(db.compras, compra);

        // Crear lote automáticamente
        const lote = {
          id: genId('l'),
          productoId: c.productoId,
          fecha: c.fecha,
          cantidadInicial: cantidad,
          cantidadVendida: 0,
          costo: costo,
          nota: `Compra ${compra.id}`
        };
        await P(db.lotes, lote);
      });

      await cargarCompras();
      await lotesStore.cargarLotes();

      return { compra, success: true };
    } catch (e) {
      console.error('Error guardando compra:', e);
      return { error: 'Error guardando compra' };
    }
  }

  /**
   * Anula una compra
   */
  async function anularCompra(id) {
    const c = compras.value.find(x => x.id === id);
    if (!c || c.anulada) return { error: 'Compra no encontrada o ya anulada' };

    try {
      await db.transaction('rw', db.compras, db.lotes, async () => {
        await P(db.compras, { ...c, anulada: true, fechaAnulacion: new Date().toISOString() });

        // Revertir lote si es el único o el más reciente
        const lotes = lotesStore.lotes.filter(l => l.productoId === c.productoId);
        const loteCompra = lotes.find(l => l.cantidadInicial === c.cantidad && l.costo === c.costo);
        if (loteCompra) {
          await db.lotes.delete(loteCompra.id);
        }
      });

      await cargarCompras();
      await lotesStore.cargarLotes();

      return { success: true };
    } catch (e) {
      console.error('Error anulantdo compra:', e);
      return { error: 'Error anulantdo compra' };
    }
  }

  /**
   * Recarga datos específicos
   */
  async function recargarStores(tables) {
    const reloadMap = {
      compras: cargarCompras,
      lotes: lotesStore.cargarLotes,
      asientos: () => {}
    };

    for (const table of tables) {
      if (reloadMap[table]) {
        await reloadMap[table]();
      }
    }
  }

  /**
   * Resetea el formulario de compra
   */
  function resetCompra() {
    compraForm.value = {
      editId: '',
      productoId: '',
      fecha: new Date().toISOString().split('T')[0],
      cantidad: '',
      costo: '',
      nota: '',
      proveedor: '',
      empaqueId: '',
      precioEmpaque: '',
      cantidadEmpaque: '',
      usarEmpaque: false
    };
  }

  // ===== EXPORTS =====
  return {
    compras,
    compraForm,
    busqCompra,
    comprasOrdenadas,
    comprasPeriodo,
    comprasTotal,
    margenPeriodo,
    cargarCompras,
    guardarCompra,
    anularCompra,
    recargarStores,
    resetCompra
  };
});

export default useComprasStore;
