import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, n, m, q, genId, clean, P } from '../db.js';

export const useProductosStore = defineStore('productos', () => {
  const productos = ref([]);
  const lotes = ref([]);
  const cargando = ref(false);

  const activos = computed(() =>
    productos.value.filter(p => !p.archivado)
  );

  const stockMap = computed(() => {
    const map = {};
    for (const p of productos.value) map[p.id] = 0;
    for (const l of lotes.value) {
      if (map[l.productoId] !== undefined) {
        map[l.productoId] += (n(l.cantidadInicial) - n(l.cantidadVendida));
      }
    }
    return map;
  });

  const valorInventario = computed(() => {
    let total = 0;
    const pidsCaja2 = new Set(productos.value.filter(p => p.caja2).map(p => p.id));
    for (const l of lotes.value) {
      if (pidsCaja2.has(l.productoId)) continue;
      const pend = n(l.cantidadInicial) - n(l.cantidadVendida);
      total += pend * n(l.costo);
    }
    return m(total);
  });

  function stock(pid) { return stockMap.value[pid] || 0; }

  function lotesDe(pid) {
    return lotes.value
      .filter(l => l.productoId === pid)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.id < b.id ? -1 : 1));
  }

  async function cargar() {
    cargando.value = true;
    try {
      productos.value = await db.productos.toArray();
      lotes.value = await db.lotes.toArray();
    } finally {
      cargando.value = false;
    }
  }

  async function agregar(prod) {
    const nuevo = {
      id: prod.id || genId('p'),
      nombre: prod.nombre,
      precio: n(prod.precio),
      stockMinimo: n(prod.stockMinimo),
      archivado: false,
      caja2: !!prod.caja2,
      ...prod
    };
    await P(db.productos, nuevo);
    productos.value.push(nuevo);
    return nuevo;
  }

  async function actualizar(id, cambios) {
    const idx = productos.value.findIndex(p => p.id === id);
    if (idx < 0) return null;
    const actualizado = { ...productos.value[idx], ...cambios };
    await P(db.productos, actualizado);
    productos.value[idx] = actualizado;
    return actualizado;
  }

  async function archivar(id) {
    return actualizar(id, { archivado: true });
  }

  return {
    productos, lotes, cargando,
    activos, stockMap, valorInventario,
    stock, lotesDe,
    cargar, agregar, actualizar, archivar
  };
});
