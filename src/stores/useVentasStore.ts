/**
 * Store de Ventas y Carrito
 * Gestiona ventas, carrito y cálculos de ganancia
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Venta, ItemCarrito, Producto } from '../types';
import { n, m, q } from '../utils/numero';
import { P, clean } from '../utils/id';
import { db } from '../db';
import { regenerarAsientos } from '../services/libroDiario';
import { useLotesStore } from './useLotesStore';
import { useProductosStore } from './useProductosStore';
import { useConfigStore } from './useConfigStore';

export const useVentasStore = defineStore('ventas', () => {
  // ===== ESTORES DEPENDIENTES =====
  const lotesStore = useLotesStore();
  const productosStore = useProductosStore();
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const ventas = ref<Venta[]>([]);
  const carrito = ref<ItemCarrito[]>([]);
  const busqVenta = ref('');
  const focusVenta = ref(false);
  const ventaExpandida = ref<string | null>(null);

  // ===== GETTERS =====

  /**
   * Lista de productos para venta (con stock)
   */
  const listaVenta = computed(() => {
    const busq = busqVenta.value.toLowerCase().trim();
    const stockMap = lotesStore.stockMap;

    return productosStore.prodsActivos.filter((p) => {
      if ((stockMap[p.id] || 0) <= 0) return false;
      if (busq && !(p.nombre.toLowerCase().includes(busq) || p.codigo?.toLowerCase().includes(busq))) return false;
      return true;
    });
  });

  /**
   * Total del carrito
   */
  const totalCarrito = computed(() => {
    return m(carrito.value.reduce((s, it) => s + n(it.precio) * n(it.cant), 0));
  });

  /**
   * Ganancia por item del carrito
   */
  function gananciaItem(it: ItemCarrito) {
    const f = lotesStore.calcFIFO(it.productoId, n(it.cant));
    if (f.error) return 0;
    return m(n(it.precio) * n(it.cant) - f.costoTotal);
  }

  /**
   * Ganancia total del carrito
   */
  const gananciaCarrito = computed(() => {
    return m(carrito.value.reduce((s, it) => s + gananciaItem(it), 0));
  });

  /**
   * Subtotal de un item del carrito
   */
  function subTotalItem(it: ItemCarrito) {
    return m(n(it.precio) * n(it.cant));
  }

  /**
   * Ventas del período actual
   */
  const ventasPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(ventas.value.filter((v) => !v.anulada && new Date(v.fecha) >= ini).reduce((s, v) => s + n(v.total), 0));
  });

  /**
   * Ventas históricas totales (no anuladas).
   * Base del saldo de caja: la caja es un saldo ACUMULATIVO que no se
   * reinicia con los cierres de período (el efectivo físico sigue ahí).
   */
  const ventasTotal = computed(() => {
    return m(ventas.value.filter((v) => !v.anulada).reduce((s, v) => s + n(v.total), 0));
  });

  /**
   * Ganancia bruta del período
   */
  const gananciaBrutaPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(ventas.value.filter((v) => !v.anulada && new Date(v.fecha) >= ini).reduce((s, v) => s + n(v.ganancia), 0));
  });

  /**
   * Ventas filtradas por búsqueda
   */
  const ventasFiltradas = computed(() => {
    let list = ventas.value.slice().sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const busq = busqVenta.value.toLowerCase().trim();
    if (busq) list = list.filter((v) => v.items.some((i) => i.nombre.toLowerCase().includes(busq)));
    return list;
  });

  // ===== ACCIONES DE CARRITO =====

  /**
   * Agrega un producto al carrito
   */
  function agregarCarrito(p: Producto) {
    const s = productosStore.stock(p.id);
    if (s <= 0) {
      throw new Error('Sin stock');
    }

    const ex = carrito.value.find((i) => i.productoId === p.id);
    if (ex) {
      if (n(ex.cant) < s) {
        ex.cant = String(n(ex.cant) + 1);
      } else {
        throw new Error('Stock máximo');
      }
    } else {
      const precioInicial = productosStore.precioParaCantidad(p.id, 1);
      carrito.value.push({
        productoId: p.id,
        nombre: p.nombre,
        precio: String(precioInicial),
        cant: '1',
      });
    }

    busqVenta.value = '';
    focusVenta.value = false;
  }

  /**
   * Cambia la cantidad de un item en el carrito
   */
  function cambiarCant(it: ItemCarrito, dir: number) {
    let val = n(it.cant) + dir;
    if (val < 1) val = 1;

    const stock = productosStore.stock(it.productoId);
    if (val > stock) {
      val = stock;
    }

    it.cant = String(val);
  }

  /**
   * Actualiza la cantidad desde input
   */
  function actualizarCantidadInput(it: ItemCarrito, value: string) {
    it.cant = value;
  }

  /**
   * Valida la cantidad de un item
   */
  function validarCant(it: ItemCarrito) {
    let val = n(it.cant);
    if (isNaN(val) || val < 1) {
      it.cant = '1';
      val = 1;
    }

    const stock = productosStore.stock(it.productoId);
    if (val > stock) {
      it.cant = String(stock);
    }
  }

  /**
   * Valida el precio de un item
   */
  function validarPrecio(it: ItemCarrito) {
    const val = n(it.precio);
    if (isNaN(val) || val <= 0) {
      it.precio = String(productosStore.precioParaCantidad(it.productoId, n(it.cant)));
    }
  }

  /**
   * Verifica si un precio es escalonado
   */
  function esPrecioEscalon(it: ItemCarrito) {
    return (
      productosStore.tieneEscalones(it.productoId) &&
      productosStore.precioParaCantidad(it.productoId, n(it.cant)) !== n(it.precio)
    );
  }

  /**
   * Limpia el carrito
   */
  function limpiarCarrito() {
    carrito.value = [];
  }

  // ===== ACCIONES DE VENTAS =====

  /**
   * Carga las ventas desde IndexedDB
   */
  async function cargarVentas() {
    try {
      ventas.value = await db.ventas.toArray();
    } catch (e) {
      console.error('Error cargando ventas:', e);
    }
  }

  /**
   * Anula una venta completa
   */
  async function anularVenta(id: string) {
    const v = ventas.value.find((x) => x.id === id);
    if (!v || v.anulada) return;

    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        await P(db.ventas, { ...v, anulada: true, fechaAnulacion: new Date().toISOString() });

        const lotesActualizados: import('../types').Lote[] = [];
        for (const it of v.items) {
          if (!it.lotesUsados) continue;
          for (const u of it.lotesUsados) {
            const l = lotesStore.lotes.find((x) => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = Math.max(0, q(n(l.cantidadVendida) - u.cantidad));
              lotesActualizados.push(clean(l));
            }
          }
        }

        if (lotesActualizados.length > 0) {
          await db.lotes.bulkPut(lotesActualizados);
        }
      });

      await cargarVentas();
      await lotesStore.cargarLotes();
      // El libro diario excluye ventas anuladas: regenerarlo en background
      regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));
    } catch (e) {
      console.error('Error anulantdo venta:', e);
      throw e;
    }
  }

  /**
   * Anula un producto individual en una venta
   */
  async function anularProductoEnVenta(ventaId: string, itemIndex: number) {
    const v = ventas.value.find((x) => x.id === ventaId);
    if (!v || v.anulada) return;
    const item = v.items[itemIndex];
    if (!item) return;

    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        const itemsActualizados = v.items.map((it, idx) => (idx === itemIndex ? { ...it, anulado: true } : it));

        const nuevoTotal = itemsActualizados.reduce((s, it) => s + (it.anulado ? 0 : n(it.precio) * n(it.cantidad)), 0);
        const nuevaGanancia = itemsActualizados.reduce((s, it) => s + (it.anulado ? 0 : n(it.ganancia)), 0);

        await P(db.ventas, {
          ...v,
          items: itemsActualizados,
          total: m(nuevoTotal),
          ganancia: m(nuevaGanancia),
        });

        const lotesActualizados: import('../types').Lote[] = [];
        if (item.lotesUsados) {
          for (const u of item.lotesUsados) {
            const l = lotesStore.lotes.find((x) => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = Math.max(0, q(n(l.cantidadVendida) - u.cantidad));
              lotesActualizados.push(clean(l));
            }
          }
        }

        if (lotesActualizados.length > 0) {
          await db.lotes.bulkPut(lotesActualizados);
        }
      });

      await cargarVentas();
      await lotesStore.cargarLotes();
      // La anulación parcial cambia totales y COGS: regenerar libro
      regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));
    } catch (e) {
      console.error('Error anulantdo producto:', e);
      throw e;
    }
  }

  /**
   * Toggle para expandir/colapsar una venta
   */
  function toggleExpandirVenta(id: string) {
    ventaExpandida.value = ventaExpandida.value === id ? null : id;
  }

  /**
   * Actualiza la búsqueda de productos para venta
   */
  function setBusqVenta(termino: string) {
    busqVenta.value = termino;
  }

  // ===== EXPORTS =====
  return {
    ventas,
    carrito,
    busqVenta,
    focusVenta,
    ventaExpandida,
    listaVenta,
    ventasFiltradas,
    totalCarrito,
    gananciaCarrito,
    gananciaItem,
    subTotalItem,
    ventasPeriodo,
    ventasTotal,
    gananciaBrutaPeriodo,
    agregarCarrito,
    cambiarCant,
    actualizarCantidadInput,
    validarCant,
    validarPrecio,
    esPrecioEscalon,
    limpiarCarrito,
    cargarVentas,
    anularVenta,
    anularProductoEnVenta,
    toggleExpandirVenta,
    setBusqVenta,
  };
});

export default useVentasStore;
