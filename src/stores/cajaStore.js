import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useVentasStore = defineStore('ventas', {
  state: () => ({
    ventas: [],
    carrito: [],
    busqVenta: '',
    busqHist: '',
  }),
  getters: {
    ventasPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.ventas.filter((v) => !v.anulada).reduce((acc, v) => acc + utils.n(v.total), 0));
    },
    gananciaCarrito: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.carrito.reduce((acc, item) => {
        const precioTotal = utils.n(item.precio) * utils.n(item.cant);
        const costo = utils.n(item.costoUnitario) * utils.n(item.cant);
        return acc + (precioTotal - costo);
      }, 0));
    },
    listaVenta: (state) => {
      const productos = db.productos ? db.productos.toArray() : [];
      if (!Array.isArray(productos)) return [];
      return productos.filter((p) => !p.archivado && (p.nombre || '').toLowerCase().includes((state.busqVenta || '').toLowerCase()));
    },
  },
  actions: {
    async cargar() {
      this.ventas = await db.ventas.toArray();
    },
    agregarCarrito(producto) {
      const item = {
        id: producto.id,
        nombre: producto.nombre,
        productoId: producto.id,
        cant: 1,
        precio: producto.precio || 0,
        costoUnitario: producto.costoUnitario || 0,
      };
      const index = this.carrito.findIndex((x) => x.productoId === producto.id);
      if (index >= 0) {
        this.carrito[index].cant += 1;
      } else {
        this.carrito.push(item);
      }
    },
    cambiarCant(item, delta) {
      const index = this.carrito.findIndex((x) => x.productoId === item.productoId);
      if (index < 0) return;
      const next = this.carrito[index].cant + delta;
      this.carrito[index].cant = next > 0 ? next : 0;
      if (this.carrito[index].cant === 0) this.carrito.splice(index, 1);
    },
    actualizarCantidadInput(item, value) {
      const next = Number.parseFloat(value);
      if (Number.isFinite(next) && next >= 0) {
        item.cant = next;
      }
    },
    setBusqVenta(valor) {
      this.busqVenta = valor || '';
    },
    setBusqHist(valor) {
      this.busqHist = valor || '';
    },
    subTotalItem(item) {
      const utils = useUtilitiesStore();
      return utils.m(utils.n(item.precio) * utils.n(item.cant));
    },
    async registrarVenta(venta) {
      await db.ventas.put(venta);
      await this.cargar();
    },
  },
});
