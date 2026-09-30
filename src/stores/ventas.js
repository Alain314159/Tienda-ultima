import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, n, m, genId, clean, P } from '../db.js';

export const useVentasStore = defineStore('ventas', () => {
  const ventas = ref([]);
  const cargando = ref(false);

  const noAnuladas = computed(() => ventas.value.filter(v => !v.anulada));

  const delPeriodo = computed(() => {
    const cfg = JSON.parse(localStorage.getItem('cfg') || '{}');
    const ini = new Date(cfg.periodoInicio || 0);
    return ventas.value.filter(v => !v.anulada && new Date(v.fecha) >= ini);
  });

  const totalPeriodo = computed(() =>
    m(delPeriodo.value.reduce((s, v) => s + n(v.total), 0))
  );

  const gananciaPeriodo = computed(() =>
    m(delPeriodo.value.reduce((s, v) => s + n(v.ganancia), 0))
  );

  async function cargar() {
    cargando.value = true;
    try {
      ventas.value = await db.ventas.toArray();
    } finally {
      cargando.value = false;
    }
  }

  async function guardar(venta) {
    const nueva = {
      id: venta.id || genId('v'),
      fecha: venta.fecha || new Date().toISOString(),
      ...venta,
      anulada: false
    };
    await P(db.ventas, nueva);
    ventas.value.push(nueva);
    return nueva;
  }

  async function anular(id) {
    const v = ventas.value.find(x => x.id === id);
    if (!v) return null;
    const actualizada = { ...v, anulada: true, fechaAnulacion: new Date().toISOString() };
    await P(db.ventas, actualizada);
    const idx = ventas.value.findIndex(x => x.id === id);
    ventas.value[idx] = actualizada;
    return actualizada;
  }

  return {
    ventas, cargando,
    noAnuladas, delPeriodo, totalPeriodo, gananciaPeriodo,
    cargar, guardar, anular
  };
});
