import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, genId, clean, P, n, m } from '../db.js';

export const useVentasStore = defineStore('ventas', () => {
  // Estado
  const ventas = ref([]);
  const carrito = ref([]);
  const cargando = ref(false);

  // Getters
  const totalCarrito = computed(() => {
    return m(carrito.value.reduce((s, it) => s + (n(it.precio) * n(it.cant)), 0));
  });

  const cantidadItems = computed(() => carrito.value.length);

  // Acciones
  async function cargar() {
    cargando.value = true;
    try {
      ventas.value = await db.ventas.toArray();
    } finally {
      cargando.value = false;
    }
  }

  function agregarAlCarrito(producto, cantidad = 1) {
    const existente = carrito.value.find(it => it.productoId === producto.id);
    if (existente) {
      existente.cant = String(n(existente.cant) + cantidad);
    } else {
      carrito.value.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: String(producto.precio || 0),
        cant: String(cantidad)
      });
    }
  }

  function quitarDelCarrito(productoId) {
    const idx = carrito.value.findIndex(it => it.productoId === productoId);
    if (idx >= 0) carrito.value.splice(idx, 1);
  }

  function limpiarCarrito() {
    carrito.value = [];
  }

  async function guardarVenta(venta) {
    const nueva = {
      id: genId('v'),
      fecha: new Date().toISOString(),
      ...venta,
      anulada: false
    };
    await P(db.ventas, nueva);
    ventas.value.push(nueva);
    return nueva;
  }

  return {
    // Estado
    ventas, carrito, cargando,
    // Getters
    totalCarrito, cantidadItems,
    // Acciones
    cargar, agregarAlCarrito, quitarDelCarrito, limpiarCarrito, guardarVenta
  };
});
