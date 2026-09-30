import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, n, m, genId, P } from '../db.js';

export const useGastosStore = defineStore('gastos', () => {
  const gastos = ref([]);

  const porCategoria = computed(() => {
    const map = {};
    for (const g of gastos.value) {
      const c = g.categoria || 'Sin categoria';
      map[c] = (map[c] || 0) + n(g.monto);
    }
    return Object.keys(map)
      .map(k => ({ cat: k, monto: m(map[k]) }))
      .sort((a, b) => b.monto - a.monto);
  });

  const total = computed(() =>
    m(gastos.value.reduce((s, g) => s + n(g.monto), 0))
  );

  async function cargar() {
    gastos.value = await db.gastos.toArray();
  }

  async function agregar(gasto) {
    const nuevo = {
      id: gasto.id || genId('g'),
      fecha: gasto.fecha || new Date().toISOString(),
      categoria: gasto.categoria,
      concepto: gasto.concepto,
      monto: m(gasto.monto),
      nota: gasto.nota || '',
      metodoPago: gasto.metodoPago || 'efectivo',
      saleDeCaja: gasto.saleDeCaja !== false,
      movId: gasto.movId || null
    };
    await P(db.gastos, nuevo);
    gastos.value.push(nuevo);
    return nuevo;
  }

  async function eliminar(id) {
    const g = gastos.value.find(x => x.id === id);
    if (!g) return;
    await db.gastos.delete(id);
    if (g.movId) await db.movCaja.delete(g.movId);
    gastos.value = gastos.value.filter(x => x.id !== id);
  }

  return {
    gastos, porCategoria, total,
    cargar, agregar, eliminar
  };
});
