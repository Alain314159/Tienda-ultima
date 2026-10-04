/**
 * Store de Caja
 * Gestiona el saldo de caja, arqueos y movimientos
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P, n, m } from '../db';
import { useVentasStore } from './useVentasStore';
import { useCapitalStore } from './useCapitalStore';
import { useGastosStore } from './useGastosStore';
import { useConfigStore } from './useConfigStore';
import { Fechas } from '../services/fechas';

export const useCajaStore = defineStore('caja', () => {
  // ===== STORES DEPENDIENTES =====
  const ventasStore = useVentasStore();
  const capitalStore = useCapitalStore();
  const gastosStore = useGastosStore();
  const configStore = useConfigStore();

  // ===== ESTADO =====
  const movCaja = ref([]);
  const arqueos = ref([]);

  // ===== GETTERS =====
  
  /**
   * Saldo actual de caja
   * Fórmula: ini + aportes + ventas - compras - retiros + arqueos
   */
  const saldoCaja = computed(() => {
    const ini = n(configStore.capitalInicial);
    const aportes = capitalStore.capitalTotal;
    const retiros = capitalStore.retirosTotal;
    const compras = 0; // TODO: Conectar con comprasStore
    const arq = calcularSaldoArqueos();
    
    return m(ini + aportes + ventasStore.ventasPeriodo - compras - retiros + arq);
  });

  /**
   * Calcula el saldo de arqueos (ingresos - egresos)
   */
  function calcularSaldoArqueos() {
    const ingresos = movCaja.value
      .filter(m => m.tipo === 'ingreso')
      .reduce((s, m) => s + n(m.monto), 0);
    
    const egresos = movCaja.value
      .filter(m => m.tipo === 'egreso')
      .reduce((s, m) => s + n(m.monto), 0);
    
    return m(ingresos - egresos);
  }

  /**
   * Movimientos de caja ordenados por fecha
   */
  const movimientosOrdenados = computed(() => {
    return movCaja.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  });

  /**
   * Arqueos ordenados por fecha
   */
  const arqueosOrdenados = computed(() => {
    return arqueos.value
      .slice()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  });

  /**
   * Verifica si la caja está negativa
   */
  const cajaNegativa = computed(() => {
    return n(saldoCaja.value) < 0;
  });

  // ===== ACCIONES =====
  
  /**
   * Carga los movimientos de caja desde IndexedDB
   */
  async function cargarMovCaja() {
    try {
      movCaja.value = await db.movCaja.toArray();
    } catch (e) {
      console.error('Error cargando movimientos de caja:', e);
    }
  }

  /**
   * Carga los arqueos desde IndexedDB
   */
  async function cargarArqueos() {
    try {
      arqueos.value = await db.arqueos.toArray();
    } catch (e) {
      console.error('Error cargando arqueos:', e);
    }
  }

  /**
   * Registra un movimiento de caja
   */
  async function registrarMovimiento(tipo, monto, concepto = '', metodoPago = 'efectivo') {
    try {
      await P(db.movCaja, {
        id: genId('mc'),
        fecha: new Date().toISOString(),
        tipo,
        monto: n(monto),
        concepto,
        metodoPago
      });
      
      await cargarMovCaja();
    } catch (e) {
      console.error('Error registrando movimiento de caja:', e);
      throw e;
    }
  }

  /**
   * Realiza un arqueo de caja
   */
  async function hacerArqueo(cajaFisica, faltanteSobrante, nota = '') {
    try {
      const arqueo = {
        id: genId('arq'),
        fecha: new Date().toISOString(),
        cajaSistema: n(saldoCaja.value),
        cajaFisica: n(cajaFisica),
        faltanteSobrante: n(faltanteSobrante),
        nota
      };
      
      await P(db.arqueos, arqueo);
      
      // Registrar movimiento de caja si hay diferencia
      if (Math.abs(n(faltanteSobrante)) > 0.01) {
        const tipo = faltanteSobrante > 0 ? 'ingreso' : 'egreso';
        await registrarMovimiento(
          tipo,
          Math.abs(n(faltanteSobrante)),
          `Ajuste por arqueo: ${nota || 'Diferencia de caja'}`
        );
      }
      
      await cargarArqueos();
      await cargarMovCaja();
      
      return arqueo;
    } catch (e) {
      console.error('Error haciendo arqueo:', e);
      throw e;
    }
  }

  /**
   * Carga todos los datos de caja
   */
  async function cargarTodo() {
    await Promise.all([
      cargarMovCaja(),
      cargarArqueos()
    ]);
  }

  // ===== EXPORTS =====
  return {
    movCaja,
    arqueos,
    saldoCaja,
    movimientosOrdenados,
    arqueosOrdenados,
    cajaNegativa,
    cargarMovCaja,
    cargarArqueos,
    registrarMovimiento,
    hacerArqueo,
    cargarTodo
  };
});

// Importar genId desde db
import { genId } from '../db';

export default useCajaStore;
