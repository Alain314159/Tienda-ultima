import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, n, m, genId, P } from '../db.js';

export const useCajaStore = defineStore('caja', () => {
  const movCaja = ref([]);
  const capital = ref([]);
  const retiros = ref([]);
  const arqueos = ref([]);
  const cfg = ref({ capitalInicial: 0 });

  const saldoMovimientos = computed(() => {
    const ing = movCaja.value.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + n(m.monto), 0);
    const egr = movCaja.value.filter(m => m.tipo === 'egreso').reduce((s, m) => s + n(m.monto), 0);
    return m(ing - egr);
  });

  const aportes = computed(() =>
    m(capital.value.reduce((s, x) => s + n(x.monto), 0))
  );

  const totalRetiros = computed(() =>
    m(retiros.value.reduce((s, x) => s + n(x.monto), 0))
  );

  const capitalTotal = computed(() =>
    m(n(cfg.value.capitalInicial) + aportes.value)
  );

  async function cargar() {
    movCaja.value = await db.movCaja.toArray();
    capital.value = await db.capital.toArray();
    retiros.value = await db.retiros.toArray();
    arqueos.value = await db.arqueos.toArray();
  }

  async function registrarMovimiento(mov) {
    const nuevo = {
      id: mov.id || genId('mc'),
      fecha: mov.fecha || new Date().toISOString(),
      tipo: mov.tipo,
      monto: m(mov.monto),
      concepto: mov.concepto,
      nota: mov.nota || ''
    };
    await P(db.movCaja, nuevo);
    movCaja.value.push(nuevo);
    return nuevo;
  }

  async function registrarAporte(monto, nota = '') {
    const nuevo = { id: genId('k'), fecha: new Date().toISOString(), monto: m(monto), nota };
    await P(db.capital, nuevo);
    capital.value.push(nuevo);
    return nuevo;
  }

  async function registrarRetiro(monto, concepto) {
    const nuevo = { id: genId('r'), fecha: new Date().toISOString(), monto: m(monto), concepto };
    await P(db.retiros, nuevo);
    retiros.value.push(nuevo);
    return nuevo;
  }

  return {
    movCaja, capital, retiros, arqueos, cfg,
    saldoMovimientos, aportes, totalRetiros, capitalTotal,
    cargar, registrarMovimiento, registrarAporte, registrarRetiro
  };
});
