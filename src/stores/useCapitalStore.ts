/**
 * Store de Capital y Patrimonio
 * Gestiona capital inicial, aportes, retiros y socios
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MovCapital, Retiro, Socio, Distribucion } from '../types';
import { n, m } from '../utils/numero';
import { P, genId } from '../utils/id';
import { db } from '../db';
import { regenerarAsientos } from '../services/libroDiario';
import { useConfigStore } from './useConfigStore';
import { useCierresStore } from './useCierresStore';

export const useCapitalStore = defineStore('capital', () => {
  // ===== STORES DEPENDIENTES =====
  const configStore = useConfigStore();
  const cierresStore = useCierresStore();

  // ===== ESTADO =====
  const capital = ref<MovCapital[]>([]);
  const retiros = ref<Retiro[]>([]);
  const socios = ref<Socio[]>([]);
  const distribuciones = ref<Distribucion[]>([]);

  // Formularios
  const retiroForm = ref({ monto: '', concepto: '', tipo: 'ganancia' });
  const aporteForm = ref({ monto: '', nota: '', socioId: '' });
  const socioForm = ref({ editId: '', nombre: '', porcentaje: '', aporte: '' });

  // ===== GETTERS =====

  /**
   * Total de aportes
   */
  const aportesTotal = computed(() => {
    return m(capital.value.reduce((s, x) => s + n(x.monto), 0));
  });

  /**
   * Total de capital (inicial + aportes)
   */
  const capitalTotal = computed(() => {
    return m(n(configStore.capitalInicial) + aportesTotal.value);
  });

  /**
   * Total de retiros de capital
   */
  const retirosCapitalTotal = computed(() => {
    return m(retiros.value.filter((r) => r.tipoRetiro === 'capital').reduce((s, x) => s + n(x.monto), 0));
  });

  /**
   * Total de retiros de ganancia
   */
  const retirosGananciaTotal = computed(() => {
    return m(
      retiros.value.filter((r) => (r.tipoRetiro || 'ganancia') === 'ganancia').reduce((s, x) => s + n(x.monto), 0)
    );
  });

  /**
   * Total de todos los retiros
   */
  const retirosTotal = computed(() => {
    return m(retiros.value.reduce((s, x) => s + n(x.monto), 0));
  });

  /**
   * Capital disponible (para retiros)
   */
  const capitalDisponible = computed(() => {
    return m(capitalTotal.value - retirosCapitalTotal.value);
  });

  /**
   * Ganancias acumuladas (de cierres + período actual)
   */
  const gananciasAcumuladas = computed(() => {
    return m(cierresStore.cierres.reduce((s, c) => s + n(c.ganancia), 0) + cierresStore.gananciaNetaPeriodo);
  });

  /**
   * Ganancia disponible (para retiros)
   */
  const gananciaDisponible = computed(() => {
    return m(gananciasAcumuladas.value - retirosGananciaTotal.value);
  });

  /**
   * Socios ordenados por nombre
   */
  const sociosOrdenados = computed(() => {
    return socios.value.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  /** Socios activos. */
  const sociosActivos = computed(() => socios.value.filter((s) => s.activo !== false));

  /** Suma de porcentajes de participación de socios activos. */
  const sumaPorcentajes = computed(() => m(sociosActivos.value.reduce((acc, s) => acc + n(s.porcentaje), 0)));

  /** Total distribuido entre socios. */
  const totalDistribuido = computed(() => m(distribuciones.value.reduce((acc, d) => acc + n(d.monto), 0)));

  /**
   * Movimientos de patrimonio (aportes + retiros)
   */
  const movPatrimonio = computed(() => {
    const movs = [
      ...capital.value.map((x) => ({
        id: x.id,
        tipo: 'Aporte',
        fecha: x.fecha,
        monto: x.monto,
        nota: x.nota,
      })),
      ...retiros.value.map((x) => ({
        id: x.id,
        tipo: x.tipoRetiro === 'capital' ? 'Retiro (capital)' : 'Retiro (ganancia)',
        fecha: x.fecha,
        monto: x.monto,
        nota: x.concepto,
      })),
    ];

    return movs.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  });

  // ===== ACCIONES =====

  /**
   * Carga el capital desde IndexedDB
   */
  async function cargarCapital() {
    try {
      capital.value = await db.capital.toArray();
    } catch (e) {
      console.error('Error cargando capital:', e);
    }
  }

  /**
   * Carga los retiros desde IndexedDB
   */
  async function cargarRetiros() {
    try {
      retiros.value = await db.retiros.toArray();
    } catch (e) {
      console.error('Error cargando retiros:', e);
    }
  }

  /**
   * Carga los socios desde IndexedDB
   */
  async function cargarSocios() {
    try {
      socios.value = await db.socios.toArray();
    } catch (e) {
      console.error('Error cargando socios:', e);
    }
  }

  /**
   * Carga las distribuciones desde IndexedDB
   */
  async function cargarDistribuciones() {
    try {
      distribuciones.value = await db.distribuciones.toArray();
    } catch (e) {
      console.error('Error cargando distribuciones:', e);
    }
  }

  /**
   * Registra un retiro
   */
  async function registrarRetiro() {
    const monto = n(retiroForm.value.monto);
    const concepto = (retiroForm.value.concepto || '').trim();
    const tipo = retiroForm.value.tipo || 'ganancia';

    if (monto <= 0) throw new Error('Monto inválido');
    if (!concepto) throw new Error('Concepto obligatorio');

    const max = tipo === 'capital' ? capitalDisponible.value : gananciaDisponible.value;
    if (monto > max + 0.01) throw new Error(`Máximo ${m(max)}`);

    await P(db.retiros, {
      id: genId('r'),
      fecha: new Date().toISOString(),
      monto,
      concepto,
      tipoRetiro: tipo,
    });

    await cargarRetiros();
    // Los retiros entran al libro diario
    regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));

    retiroForm.value = { monto: '', concepto: '', tipo: 'ganancia' };

    return { exito: true, tipo };
  }

  /**
   * Registra un aporte
   */
  async function registrarAporte() {
    const monto = n(aporteForm.value.monto);
    if (monto <= 0) throw new Error('Monto inválido');

    await P(db.capital, {
      id: genId('k'),
      fecha: new Date().toISOString(),
      monto,
      nota: aporteForm.value.nota || '',
      socioId: aporteForm.value.socioId || null,
    });

    await cargarCapital();
    // Los aportes entran al libro diario
    regenerarAsientos().catch((e) => console.warn('regenerar asientos', e));

    aporteForm.value = { monto: '', nota: '', socioId: '' };

    return true;
  }

  /**
   * Registra un socio
   */
  async function registrarSocio() {
    const nombre = (socioForm.value.nombre || '').trim();
    const porcentaje = n(socioForm.value.porcentaje);
    const aporte = n(socioForm.value.aporte);

    if (!nombre) throw new Error('Nombre obligatorio');
    if (porcentaje <= 0 || porcentaje > 100) throw new Error('Porcentaje inválido (1-100)');

    const socio = {
      id: socioForm.value.editId || genId('s'),
      nombre,
      porcentaje,
      aporte,
      fecha: socioForm.value.editId ? null : new Date().toISOString(),
    };

    await P(db.socios, socio);
    await cargarSocios();

    socioForm.value = { editId: '', nombre: '', porcentaje: '', aporte: '' };

    return socio;
  }

  /**
   * Reparte ganancia entre socios
   */
  async function repartirGanancia(monto: number, concepto = '') {
    if (n(monto) <= 0) throw new Error('Monto inválido');
    if (socios.value.length === 0) throw new Error('No hay socios configurados');

    const totalPorcentaje = socios.value.reduce((acc, so) => acc + n(so.porcentaje), 0);
    if (totalPorcentaje <= 0) throw new Error('Porcentajes de socios inválidos');

    const distribucion: Distribucion = {
      id: genId('d'),
      fecha: new Date().toISOString(),
      montoTotal: n(monto),
      monto: n(monto),
      concepto,
      detalles: socios.value.map((s) => ({
        socioId: s.id,
        socioNombre: s.nombre,
        porcentaje: s.porcentaje,
        monto: m((n(s.porcentaje) / totalPorcentaje) * n(monto)),
      })),
    };

    await P(db.distribuciones, distribucion);
    await cargarDistribuciones();

    return distribucion;
  }

  /**
   * Carga todos los datos de capital
   */
  async function cargarTodo() {
    await Promise.all([cargarCapital(), cargarRetiros(), cargarSocios(), cargarDistribuciones()]);
  }

  // ===== EXPORTS =====
  return {
    capital,
    retiros,
    socios,
    distribuciones,
    retiroForm,
    aporteForm,
    socioForm,
    capitalTotal,
    aportesTotal,
    retirosCapitalTotal,
    retirosGananciaTotal,
    retirosTotal,
    capitalDisponible,
    gananciasAcumuladas,
    gananciaDisponible,
    sociosOrdenados,
    sociosActivos,
    sumaPorcentajes,
    totalDistribuido,
    movPatrimonio,
    cargarCapital,
    cargarRetiros,
    cargarSocios,
    cargarDistribuciones,
    registrarRetiro,
    registrarAporte,
    registrarSocio,
    repartirGanancia,
    cargarTodo,
  };
});

export default useCapitalStore;
