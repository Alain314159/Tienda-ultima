import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { n, m } from '../db.js';

export const useCarritoStore = defineStore('carrito', () => {
  const items = ref([]);

  const total = computed(() =>
    m(items.value.reduce((s, it) => s + (n(it.precio) * n(it.cant)), 0))
  );

  const cantidadTotal = computed(() =>
    items.value.reduce((s, it) => s + n(it.cant), 0)
  );

  const vacio = computed(() => items.value.length === 0);

  function agregar(producto, cantidad = 1) {
    const ex = items.value.find(it => it.productoId === producto.id);
    if (ex) {
      ex.cant = String(n(ex.cant) + cantidad);
    } else {
      items.value.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: String(producto.precio || 0),
        cant: String(cantidad),
        unidad: producto.unidad || ''
      });
    }
  }

  function quitar(productoId) {
    const idx = items.value.findIndex(it => it.productoId === productoId);
    if (idx >= 0) items.value.splice(idx, 1);
  }

  function cambiarCantidad(productoId, cant) {
    const it = items.value.find(x => x.productoId === productoId);
    if (it) it.cant = String(cant);
  }

  function limpiar() {
    items.value = [];
  }

  function cargarDesdeLocalStorage() {
    try {
      const raw = localStorage.getItem('carritoPro');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items.value = parsed;
    } catch (e) {}
  }

  // Autoguardado con debounce
  let timer = null;
  watch(items, (val) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem('carritoPro', JSON.stringify(val));
      } catch (e) {}
    }, 300);
  }, { deep: true });

  return {
    items, total, cantidadTotal, vacio,
    agregar, quitar, cambiarCantidad, limpiar, cargarDesdeLocalStorage
  };
});
