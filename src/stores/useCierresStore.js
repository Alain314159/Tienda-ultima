/**
 * Store de Cierres de Período
 * Gestiona cierres contables y cálculos de período
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, genId } from '../db';
import { useVentasStore } from './useVentasStore';
import { useGastosStore } from './useGastosStore';
import { useLotesStore } from './useLotesStore';
import { useConfigStore } from './useConfigStore';
import { Fechas } from '../services/fechas';

export const useCierresStore = defineStore('cierres', () => {
  // ===== STORES DEPENDIENTES =====
  const ventasStore = useVentasStore();
  const gastosStore = useGastosStore();
  const lotesStore = useLotesStore();
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const cierres = ref([]);
  const _cerrando = ref(false);

  // ===== GETTERS =====
  
  /**
   * Ganancia neta del período actual
   * Incluye retiros de ganancia del período
   */
  const gananciaNetaPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    
    // Ganancia bruta de ventas del período
    const bruta = ventasStore.gananciaBrutaPeriodo;
    
    // Gastos del período
    const gastos = gastosStore.gastosOpPeriodo;
    
    // Mérmas del período
    const mermas = 0; // TODO: Conectar con ajustesStore
    
    // Retiros de ganancia del período
    const retirosPeriodo = 0; // TODO: Conectar con capitalStore
    
    return m(bruta - gastos - mermas - retirosPeriodo);
  });

  /**
   * Ventas del período actual
   */
  const ventasPeriodo = computed(() => {
    return ventasStore.ventasPeriodo;
  });

  /**
   * Compras del período actual
   */
  const comprasPeriodo = computed(() => {
    // TODO: Conectar con comprasStore
    return 0;
  });

  /**
   * Margen del período
   */
  const margenPeriodo = computed(() => {
    return ventasPeriodo.value > 0 
      ? ((gananciaNetaPeriodo.value / ventasPeriodo.value) * 100).toFixed(2) 
      : '0.00';
  });

  /**
   * Cierres ordenados por fecha
   */
  const cierresOrdenados = computed(() => {
    return cierres.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  });

  /**
   * Último cierre
   */
  const ultimoCierre = computed(() => {
    return cierresOrdenados.value[0] || null;
  });

  /**
   * Días desde el último cierre
   */
  const diasDesdeUltimoCierre = computed(() => {
    if (!ultimoCierre.value) return 0;
    return Fechas.diasEntre(ultimoCierre.value.fecha, new Date().toISOString());
  });

  // ===== ACCIONES =====
  
  /**
   * Carga los cierres desde IndexedDB
   */
  async function cargarCierres() {
    try {
      cierres.value = await db.cierres.toArray();
    } catch (e) {
      console.error('Error cargando cierres:', e);
    }
  }

  /**
   * Cierra el período actual
   */
  async function cerrarPeriodo() {
    if (_cerrando.value) return;
    
    _cerrando.value = true;
    
    try {
      const ini = new Date(configStore.periodoInicio);
      const f = new Date();
      
      // Filtrar datos del período
      const ventasRango = ventasStore.ventas.value.filter(
        v => !v.anulada && new Date(v.fecha) >= ini && new Date(v.fecha) <= f
      );
      const comprasRango = []; // TODO: Filtrar compras
      const gastosRango = gastosStore.gastos.value.filter(
        g => new Date(g.fecha) >= ini && new Date(g.fecha) <= f
      );
      const mermasRango = []; // TODO: Filtrar ajustes
      
      // Calcular totales
      const totVentas = m(ventasRango.reduce((s, v) => s + n(v.total), 0));
      const cogs = m(ventasRango.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo) * n(it.cantidad), 0), 0));
      const bruta = m(totVentas - cogs);
      const totGastos = m(gastosRango.reduce((s, g) => s + n(g.monto), 0));
      const totMermas = m(mermasRango.reduce((s, a) => s + n(a.costoPerdida || 0), 0));
      const gananciaNeta = m(bruta - totGastos - totMermas);
      
      const totCompras = m(comprasRango.reduce((s, c) => s + n(c.total), 0));
      
      const cierre = {
        id: genId('c'),
        periodo: `Período ${Fechas.formatoDisplay(ini)} al ${Fechas.formatoDisplay(f)}`,
        periodoInicio: ini.toISOString(),
        periodoFin: f.toISOString(),
        fecha: f.toISOString(),
        ventas: totVentas,
        compras: totCompras,
        cogs,
        gananciaBruta: bruta,
        gastos: totGastos,
        mermas: totMermas,
        ganancia: gananciaNeta,
        valorInventario: lotesStore.valorInventario,
        cajaFinal: 0 // TODO: Calcular saldo de caja al cierre
      };
      
      await P(db.cierres, cierre);
      await cargarCierres();
      
      // Actualizar período inicio
      configStore.actualizarCfg({ periodoInicio: f.toISOString() });
      await configStore.guardarCfg();
      
      _cerrando.value = false;
      
      return cierre;
      
    } catch (e) {
      _cerrando.value = false;
      console.error('Error cerrando período:', e);
      throw e;
    }
  }

  /**
   * Carga todos los datos de cierres
   */
  async function cargarTodo() {
    await cargarCierres();
  }

  // ===== EXPORTS =====
  return {
    cierres,
    _cerrando,
    gananciaNetaPeriodo,
    ventasPeriodo,
    comprasPeriodo,
    margenPeriodo,
    cierresOrdenados,
    ultimoCierre,
    diasDesdeUltimoCierre,
    cargarCierres,
    cerrarPeriodo,
    cargarTodo
  };
});

export default useCierresStore;
