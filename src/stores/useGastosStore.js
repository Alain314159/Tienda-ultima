/**
 * Store de Gastos Operativos
 * Gestiona gastos, categorías y reportes
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m, genId } from '../db';
import { useConfigStore } from './useConfigStore';
import { CATEGORIAS_GASTO, METODOS_PAGO } from '../constants';
import { Fechas } from '../services/fechas';

export const useGastosStore = defineStore('gastos', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const gastos = ref([]);
  const gastoForm = ref({
    editId: '',
    fecha: new Date().toISOString().split('T')[0],
    categoria: '',
    concepto: '',
    monto: '',
    nota: '',
    metodoPago: 'efectivo',
    saleDeCaja: true
  });

  // ===== GETTERS =====
  
  /**
   * Gastos ordenados por fecha (más reciente primero)
   */
  const gastosOrdenadas = computed(() => {
    return gastos.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  });

  const gastosOrdenados = computed(() => gastosOrdenadas.value);

  /**
   * Total de gastos acumulados
   */
  const gastosTotalAcumulado = computed(() => {
    return m(gastos.value.reduce((s, g) => s + n(g.monto), 0));
  });

  /**
   * Gastos del período actual
   */
  const gastosOpPeriodo = computed(() => {
    const ini = new Date(configStore.periodoInicio);
    return m(gastos.value
      .filter(g => new Date(g.fecha) >= ini)
      .reduce((s, g) => s + n(g.monto), 0));
  });

  /**
   * Gastos por categoría
   */
  const gastosPorCategoria = computed(() => {
    const map = {};
    gastos.value.forEach(g => {
      const c = g.categoria || 'Sin categoría';
      if (!map[c]) map[c] = 0;
      map[c] += n(g.monto);
    });
    return Object.keys(map)
      .map(k => ({ cat: k, monto: m(map[k]) }))
      .sort((a, b) => b.monto - a.monto);
  });

  // ===== ACCIONES =====
  
  /**
   * Carga los gastos desde IndexedDB
   */
  async function cargarGastos() {
    try {
      gastos.value = await db.gastos.toArray();
    } catch (e) {
      console.error('Error cargando gastos:', e);
    }
  }

  /**
   * Guarda un gasto
   */
  async function guardarGasto() {
    const gasto = {
      id: gastoForm.value.editId || genId('g'),
      fecha: gastoForm.value.fecha,
      categoria: gastoForm.value.categoria,
      concepto: gastoForm.value.concepto.trim(),
      monto: n(gastoForm.value.monto),
      nota: gastoForm.value.nota.trim(),
      metodoPago: gastoForm.value.metodoPago,
      saleDeCaja: gastoForm.value.saleDeCaja
    };
    
    // Validaciones
    if (!gasto.concepto) throw new Error('Concepto obligatorio');
    if (gasto.monto <= 0) throw new Error('Monto inválido');
    
    await P(db.gastos, gasto);
    await cargarGastos();
    
    gastoForm.value = {
      editId: '',
      fecha: new Date().toISOString().split('T')[0],
      categoria: '',
      concepto: '',
      monto: '',
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true
    };
    
    return gasto;
  }

  /**
   * Elimina un gasto
   */
  async function eliminarGasto(gastoId) {
    try {
      await db.gastos.delete(gastoId);
      await cargarGastos();
    } catch (e) {
      console.error('Error eliminando gasto:', e);
      throw e;
    }
  }

  /**
   * Prepara el formulario para editar un gasto
   */
  function editarGasto(gasto) {
    gastoForm.value = {
      editId: gasto.id,
      fecha: gasto.fecha.split('T')[0],
      categoria: gasto.categoria,
      concepto: gasto.concepto,
      monto: String(gasto.monto),
      nota: gasto.nota || '',
      metodoPago: gasto.metodoPago || 'efectivo',
      saleDeCaja: gasto.saleDeCaja !== false
    };
  }

  /**
   * Limpia el formulario de gasto
   */
  function limpiarGastoForm() {
    gastoForm.value = {
      editId: '',
      fecha: new Date().toISOString().split('T')[0],
      categoria: '',
      concepto: '',
      monto: '',
      nota: '',
      metodoPago: 'efectivo',
      saleDeCaja: true
    };
  }

  /**
   * Recarga datos específicos
   */
  async function recargarStores(tables) {
    const reloadMap = {
      gastos: cargarGastos,
      movCaja: () => {},
      asientos: () => {}
    };

    for (const table of tables) {
      if (reloadMap[table]) {
        await reloadMap[table]();
      }
    }
  }

  // ===== EXPORTS =====
  return {
    gastos,
    gastoForm,
    gastosOrdenadas,
    gastosOrdenados,
    gastosTotalAcumulado,
    gastosOpPeriodo,
    gastosPorCategoria,
    CATEGORIAS_GASTO,
    METODOS_PAGO,
    cargarGastos,
    guardarGasto,
    eliminarGasto,
    editarGasto,
    limpiarGastoForm,
    recargarStores
  };
});

export default useGastosStore;
