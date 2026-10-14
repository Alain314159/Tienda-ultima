/**
 * Store de Cierres de Período
 * Gestiona cierres contables y cálculos de período
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Cierre } from '../types';
import { n, m } from '../utils/numero';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { useVentasStore } from './useVentasStore';
import { useGastosStore } from './useGastosStore';
import { useLotesStore } from './useLotesStore';
import { useConfigStore } from './useConfigStore';
import { useComprasStore } from './useComprasStore';
import { useAjustesStore } from './useAjustesStore';
import { useCajaStore } from './useCajaStore';
import { diasEntre, formatoDisplay } from '../utils/formato';

export const useCierresStore = defineStore('cierres', () => {
  // ===== STORES DEPENDIENTES =====
  const ventasStore = useVentasStore();
  const gastosStore = useGastosStore();
  const lotesStore = useLotesStore();
  const configStore = useConfigStore();
  const comprasStore = useComprasStore();
  const ajustesStore = useAjustesStore();
  // NOTA: useCajaStore NO se instancia a nivel de setup: capital → cierres →
  // caja → capital crearía un ciclo de inicialización. Se usa lazy dentro de
  // cerrarPeriodo(), cuando todos los stores ya están creados.

  // ===== ESTADO =====
  const cierres = ref<Cierre[]>([]);
  const _cerrando = ref(false);

  // ===== GETTERS =====

  /**
   * Ganancia neta del período actual
   * Fórmula alineada con el cuadre: bruta - gastos - mermas.
   * Los retiros de ganancia NO se restan aquí: son distribuciones del
   * beneficio (no gastos) y ya los descuenta gananciaDisponible en
   * useCapitalStore; restarlos aquí sería doble conteo.
   */
  const gananciaNetaPeriodo = computed(() => {
    // Ganancia bruta de ventas del período
    const bruta = ventasStore.gananciaBrutaPeriodo;

    // Gastos del período
    const gastos = gastosStore.gastosOpPeriodo;

    // Mérmas del período (ajustes de salida valorados a costo)
    const mermas = ajustesStore.mermasPeriodo;

    return m(bruta - gastos - mermas);
  });

  /**
   * Ventas del período actual
   */
  const ventasPeriodo = computed(() => {
    return ventasStore.ventasPeriodo;
  });

  /**
   * Compras del período actual (no anuladas)
   */
  const comprasPeriodo = computed(() => {
    return comprasStore.comprasPeriodo;
  });

  /**
   * Margen del período
   */
  const margenPeriodo = computed(() => {
    return ventasPeriodo.value > 0 ? ((gananciaNetaPeriodo.value / ventasPeriodo.value) * 100).toFixed(2) : '0.00';
  });

  /**
   * Cierres ordenados por fecha
   */
  const cierresOrdenados = computed(() => {
    return cierres.value
      .slice()
      .sort(
        (a, b) =>
          new Date(b.fecha || b.fechaCierre || '').getTime() - new Date(a.fecha || a.fechaCierre || '').getTime()
      );
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
    return diasEntre(ultimoCierre.value.fecha, new Date().toISOString());
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
      const ventasRango = ventasStore.ventas.filter(
        (v) => !v.anulada && new Date(v.fecha) >= ini && new Date(v.fecha) <= f
      );
      const comprasRango = comprasStore.compras.filter(
        (c) => !c.anulada && new Date(c.fecha) >= ini && new Date(c.fecha) <= f
      );
      const gastosRango = gastosStore.gastos.filter((g) => new Date(g.fecha) >= ini && new Date(g.fecha) <= f);
      const mermasRango = ajustesStore.ajustes.filter(
        (a) => a.cantidad < 0 && new Date(a.fecha) >= ini && new Date(a.fecha) <= f
      );

      // Calcular totales
      const totVentas = m(ventasRango.reduce((s, v) => s + n(v.total), 0));
      // it.costo es el costo TOTAL de la línea (así lo guarda useCobro y lo
      // lee useCuadre): no se multiplica por cantidad otra vez
      const cogs = m(ventasRango.reduce((s, v) => s + v.items.reduce((ss, it) => ss + n(it.costo), 0), 0));
      const bruta = m(totVentas - cogs);
      const totGastos = m(gastosRango.reduce((s, g) => s + n(g.monto), 0));
      const totMermas = m(mermasRango.reduce((s, a) => s + n(a.costoPerdida), 0));
      const gananciaNeta = m(bruta - totGastos - totMermas);

      const totCompras = m(comprasRango.reduce((s, c) => s + n(c.total), 0));
      // Lazy para evitar el ciclo de stores (ver nota arriba)
      const cajaFinal = useCajaStore().saldoCaja;

      const cierre = {
        id: genId('c'),
        periodo: `Período ${formatoDisplay(ini)} al ${formatoDisplay(f)}`,
        periodoInicio: ini.toISOString(),
        periodoFin: f.toISOString(),
        fecha: f.toISOString(),
        ventas: totVentas,
        numVentas: ventasRango.length,
        compras: totCompras,
        cogs,
        gananciaBruta: bruta,
        gastos: totGastos,
        mermas: totMermas,
        ganancia: gananciaNeta,
        valorInventario: lotesStore.valorInventario,
        cajaFinal,
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
    cargarTodo,
  };
});

export default useCierresStore;
