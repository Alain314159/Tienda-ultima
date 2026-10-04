/**
 * Store de Ventas y Carrito
 * Gestiona ventas, carrito y cálculos de ganancia
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, q, genId, clean } from '../db';
import { useLotesStore } from './useLotesStore';
import { useProductosStore } from './useProductosStore';
import { useConfigStore } from './useConfigStore';
import { Fechas } from '../services/fechas';

export const useVentasStore = defineStore('ventas', () => {
  // ===== ESTORES DEPENDIENTES =====
  const lotesStore = useLotesStore();
  const productosStore = useProductosStore();
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const ventas = ref([]);
  const carrito = ref([]);
  const busqVenta = ref('');
  const focusVenta = ref(false);
  const ventaExpandida = ref(null);
  const procesandoVenta = ref(false);

  // ===== GETTERS =====
  
  /**
   * Lista de productos para venta (con stock)
   */
  const listaVenta = computed(() => {
    const q = busqVenta.value.toLowerCase().trim();
    const stockMap = lotesStore.stockMap;
    
    return productosStore.prodsActivos.filter(p => {
      if ((stockMap[p.id] || 0) <= 0) return false;
      if (q && !(p.nombre.toLowerCase().includes(q) || (p.codigo?.toLowerCase().includes(q)))) return false;
      return true;
    });
  });

  /**
   * Total del carrito
   */
  const totalCarrito = computed(() => {
    return m(carrito.value.reduce((s, it) => s + (n(it.precio) * n(it.cant)), 0));
  });

  /**
   * Ganancia por item del carrito
   */
  function gananciaItem(it) {
    const f = lotesStore.calcFIFO(it.productoId, n(it.cant));
    if (f.error) return 0;
    return m((n(it.precio) * n(it.cant)) - f.costoTotal);
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
  function subTotalItem(it) {
    return m(n(it.precio) * n(it.cant));
  }

  /**
   * Ventas del período actual
   */
  const ventasPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(ventas.value.filter(v => !v.anulada && new Date(v.fecha) >= ini)
      .reduce((s, v) => s + n(v.total), 0));
  });

  /**
   * Ganancia bruta del período
   */
  const gananciaBrutaPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(ventas.value.filter(v => !v.anulada && new Date(v.fecha) >= ini)
      .reduce((s, v) => s + n(v.ganancia), 0));
  });

  /**
   * Ventas filtradas por búsqueda
   */
  const ventasFiltradas = computed(() => {
    let list = ventas.value.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const q = busqVenta.value.toLowerCase().trim();
    if (q) list = list.filter(v => v.items.some(i => i.nombre.toLowerCase().includes(q)));
    return list;
  });

  // ===== ACCIONES DE CARRITO =====
  
  /**
   * Agrega un producto al carrito
   */
  function agregarCarrito(p) {
    const s = productosStore.stock(p.id);
    if (s <= 0) {
      throw new Error('Sin stock');
    }
    
    const ex = carrito.value.find(i => i.productoId === p.id);
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
        cant: '1' 
      });
    }
    
    busqVenta.value = '';
    focusVenta.value = false;
  }

  /**
   * Cambia la cantidad de un item en el carrito
   */
  function cambiarCant(it, dir) {
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
  function actualizarCantidadInput(it, value) {
    it.cant = value;
  }

  /**
   * Valida la cantidad de un item
   */
  function validarCant(it) {
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
  function validarPrecio(it) {
    const val = n(it.precio);
    if (isNaN(val) || val <= 0) {
      it.precio = String(productosStore.precioParaCantidad(it.productoId, n(it.cant)));
    }
  }

  /**
   * Verifica si un precio es escalonado
   */
  function esPrecioEscalon(it) {
    return productosStore.tieneEscalones(it.productoId) && 
           productosStore.precioParaCantidad(it.productoId, n(it.cant)) !== n(it.precio);
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
   * Registra una venta
   */
  async function registrarVenta(cobroData) {
    if (procesandoVenta.value) return;
    
    procesandoVenta.value = true;
    
    try {
      const items = carrito.value.map(it => {
        const cant = n(it.cant);
        const precio = n(it.precio);
        const f = lotesStore.calcFIFO(it.productoId, cant);
        
        return {
          id: genId('vi'),
          nombre: it.nombre,
          productoId: it.productoId,
          cantidad: cant,
          precio: precio,
          costo: f.costoTotal / cant,
          ganancia: (precio - (f.costoTotal / cant)) * cant,
          lotesUsados: f.lotesUsados
        };
      });
      
      const tot = totalCarrito.value;
      const gan = gananciaCarrito.value;
      
      const venta = {
        id: genId('v'),
        fecha: new Date().toISOString(),
        items,
        total: tot,
        ganancia: gan,
        metodoPago: cobroData.metodoPago || 'efectivo',
        vuelto: cobroData.vuelto || 0,
        billetes: cobroData.billetes || {},
        anulada: false
      };
      
      // Transacción: guardar venta + actualizar lotes
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        await P(db.ventas, venta);
        
        const lotesActualizados = [];
        for (const it of carrito.value) {
          const f = lotesStore.calcFIFO(it.productoId, n(it.cant));
          for (const u of f.lotesUsados) {
            const l = lotesStore.lotes.find(x => x.id === u.loteId);
            if (l) {
              l.cantidadVendida = q(n(l.cantidadVendida) + u.cantidad);
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
      
      limpiarCarrito();
      
      return { venta, items, tot, gan };
      
    } catch (e) {
      console.error('Error registrando venta:', e);
      throw e;
    } finally {
      procesandoVenta.value = false;
    }
  }

  /**
   * Anula una venta completa
   */
  async function anularVenta(id) {
    const v = ventas.value.find(x => x.id === id);
    if (!v || v.anulada) return;
    
    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        await P(db.ventas, { ...v, anulada: true, fechaAnulacion: new Date().toISOString() });
        
        const lotesActualizados = [];
        for (const it of v.items) {
          if (!it.lotesUsados) continue;
          for (const u of it.lotesUsados) {
            const l = lotesStore.lotes.find(x => x.id === u.loteId);
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
      
    } catch (e) {
      console.error('Error anulantdo venta:', e);
      throw e;
    }
  }

  /**
   * Anula un producto individual en una venta
   */
  async function anularProductoEnVenta(ventaId, itemIndex) {
    const v = ventas.value.find(x => x.id === ventaId);
    if (!v || v.anulada) return;
    const item = v.items[itemIndex];
    if (!item) return;
    
    try {
      await db.transaction('rw', db.ventas, db.lotes, async () => {
        const itemsActualizados = v.items.map((it, idx) => 
          idx === itemIndex ? { ...it, anulado: true } : it
        );
        
        const nuevoTotal = itemsActualizados.reduce((s, it) => 
          s + (it.anulado ? 0 : n(it.precio) * n(it.cantidad)), 0);
        const nuevaGanancia = itemsActualizados.reduce((s, it) => 
          s + (it.anulado ? 0 : n(it.ganancia)), 0);
        
        await P(db.ventas, { 
          ...v, 
          items: itemsActualizados,
          total: m(nuevoTotal),
          ganancia: m(nuevaGanancia)
        });
        
        const lotesActualizados = [];
        if (item.lotesUsados) {
          for (const u of item.lotesUsados) {
            const l = lotesStore.lotes.find(x => x.id === u.loteId);
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
      
    } catch (e) {
      console.error('Error anulantdo producto:', e);
      throw e;
    }
  }

  /**
   * Toggle para expandir/colapsar una venta
   */
  function toggleExpandirVenta(id) {
    ventaExpandida.value = ventaExpandida.value === id ? null : id;
  }

  /**
   * Actualiza la búsqueda de productos para venta
   */
  function setBusqVenta(termino) {
    busqVenta.value = termino;
  }

  // ===== EXPORTS =====
  return {
    ventas,
    carrito,
    busqVenta,
    focusVenta,
    ventaExpandida,
    procesandoVenta,
    listaVenta,
    totalCarrito,
    gananciaCarrito,
    gananciaItem,
    subTotalItem,
    ventasPeriodo,
    gananciaBrutaPeriodo,
    agregarCarrito,
    cambiarCant,
    actualizarCantidadInput,
    validarCant,
    validarPrecio,
    esPrecioEscalon,
    limpiarCarrito,
    cargarVentas,
    registrarVenta,
    anularVenta,
    anularProductoEnVenta,
    toggleExpandirVenta,
    setBusqVenta
  };
});

export default useVentasStore;
