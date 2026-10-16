/**
 * Store de Ventas y Carrito
 * Gestiona ventas, carrito y cálculos de ganancia
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Venta, ItemCarrito, Producto } from '../types';
import { n, m } from '../utils/numero';
import { P } from '../utils/id';
import { db } from '../db';
import { regenerarAsientos } from '../services/libroDiario';
import { aplicarLotesEnBD } from '../services/fifo';
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
      // Render defensivo: nombre/codigo corruptos (inyeccion BD) no deben
      // matar la vista — se comparan como cadena vacia
      if (
        busq &&
        !(
          (p.nombre || '').toLowerCase().includes(busq) ||
          String(p.codigo ?? '')
            .toLowerCase()
            .includes(busq)
        )
      )
        return false;
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
    if (busq) list = list.filter((v) => v.items.some((i) => (i.nombre || '').toLowerCase().includes(busq)));
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
    recalcularPrecio(it);
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
    // "1e999" parsea a Infinity: no es NaN ni < 1 y colaba el check
    // (el clamp por stock lo detenía, pero mejor ser explícito)
    if (isNaN(val) || !isFinite(val) || val < 1) {
      it.cant = '1';
      val = 1;
    }

    const stock = productosStore.stock(it.productoId);
    if (val > stock) {
      it.cant = String(stock);
    }
    recalcularPrecio(it);
  }
  function validarPrecio(it: ItemCarrito) {
    const val = n(it.precio);
    // Infinity pasaba los dos checks (no es NaN, no es ≤ 0) y la venta se
    // guardaba con precio ∞ crudo + total $0 (m() satura a 0): mercancía
    // saliendo sin registrar el dinero
    if (isNaN(val) || !isFinite(val) || val <= 0) {
      it.precio = String(productosStore.precioParaCantidad(it.productoId, n(it.cant)));
    }
  }

  /**
   * Verifica si un precio es escalonado
   */
  function esPrecioEscalon(it: ItemCarrito) {
    const p = productosStore.productos.find((x) => x.id === it.productoId);
    if (!p || !p.preciosEscalonados || !p.preciosEscalonados.length) return false;
    // Semántica del monolito: el precio en efecto difiere del BASE
    // (escalón mayorista aplicado por recalcularPrecio). Comparar contra
    // el escalón dejaba la etiqueta invertida y además mentía: sin
    // recalcularPrecio el escalón JAMÁS se aplicaba al cambiar cantidad.
    return Math.abs(n(it.precio) - n(p.precio)) > 0.001;
  }

  /**
   * Recalcula el precio del item según los escalones para su cantidad.
   * (Perdido en la migración a Pinia: sin esto, los precios por cantidad
   * NUNCA se aplicaban — el cajero subía a 6 unidades y seguía cobrando
   * el precio base.)
   */
  function recalcularPrecio(it: ItemCarrito) {
    const prod = productosStore.productos.find((x) => x.id === it.productoId);
    if (!prod || !prod.preciosEscalonados || !prod.preciosEscalonados.length) return;
    const nuevo = productosStore.precioParaCantidad(it.productoId, n(it.cant));
    if (n(it.precio) !== nuevo) {
      it.precio = String(nuevo);
    }
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

    // Guard anti doble-tap: se marca ANTES de la transacción para que una
    // segunda llamada (dedo rápido en Android lento, antes de que cargueVentas
    // refresque la UI) salga por el check de arriba. Si la transacción falla,
    // el catch recarga desde la BD y el flag optimista se revierte.
    v.anulada = true;

    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        // Lectura FRESCA de la BD: la venta pudo cambiar en otra pestaña
        // (ítem anulado, anulación total) y escribir el objeto obsoleto
        // pisaba esos cambios (last-writer-wins)
        const vDB = await db.ventas.get(id);
        if (!vDB || vDB.anulada) throw new Error('La venta ya está anulada');
        // Solo restauran los ítems ACTIVOS: los anulados por ítem ya tienen
        // su stock restituido en su momento — restaurarlos otra vez inflaba
        // el inventario en silencio (doble restauración)
        const usos = vDB.items.flatMap((it) => (it.anulado || !it.lotesUsados ? [] : it.lotesUsados));
        await P(db.ventas, { ...vDB, anulada: true, fechaAnulacion: new Date().toISOString() });
        await aplicarLotesEnBD(usos, -1);
      });

      await cargarVentas();
      await lotesStore.cargarLotes();
      // El libro diario excluye ventas anuladas: regenerarlo en background
      regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));
    } catch (e) {
      // La transacción revirtió la BD, pero el flag optimista del guard
      // anti doble-tap quedó puesto: resincronizar desde la BD
      await Promise.allSettled([cargarVentas(), lotesStore.cargarLotes()]);
      console.error('Error anulando venta:', e);
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
    // Guard anti doble-tap (ídem anularVenta): sin esto, dos toques seguidos
    // restaban cantidadVendida DOS veces → stock fantasma
    if (item.anulado) return;
    item.anulado = true;

    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        // Lectura FRESCA: el objeto reactivo pudo quedar obsoleto (otra
        // pestaña anuló el ítem o la venta completa) y escribirlo tal cual
        // reviviría ítems ya anulados → stock restaurado dos veces
        const vDB = await db.ventas.get(ventaId);
        if (!vDB || vDB.anulada) throw new Error('La venta está anulada');
        const itemDB = vDB.items[itemIndex];
        if (!itemDB) throw new Error('El ítem ya no existe en la venta');
        if (itemDB.anulado) throw new Error('El ítem ya está anulado');

        const itemsActualizados = vDB.items.map((it, idx) => (idx === itemIndex ? { ...it, anulado: true } : it));

        const nuevoTotal = itemsActualizados.reduce((s, it) => s + (it.anulado ? 0 : n(it.precio) * n(it.cantidad)), 0);
        const nuevaGanancia = itemsActualizados.reduce((s, it) => s + (it.anulado ? 0 : n(it.ganancia)), 0);

        await P(db.ventas, {
          ...vDB,
          items: itemsActualizados,
          total: m(nuevoTotal),
          ganancia: m(nuevaGanancia),
        });

        if (itemDB.lotesUsados) {
          await aplicarLotesEnBD(itemDB.lotesUsados, -1);
        }
      });

      await cargarVentas();
      await lotesStore.cargarLotes();
      // La anulación parcial cambia totales y COGS: regenerar libro
      regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));
    } catch (e) {
      // Ídem anularVenta: resync si la transacción revirtió
      await Promise.allSettled([cargarVentas(), lotesStore.cargarLotes()]);
      console.error('Error anulando producto:', e);
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
