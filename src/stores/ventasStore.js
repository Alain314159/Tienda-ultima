import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';
import { useCalculosStore } from './calculosStore.js';

export const useVentasStore = defineStore('ventas', {
  state: () => ({
    ventas: [],
    carrito: [],
    busqVenta: '',
  }),
  getters: {
    ventasPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.ventas.filter((v) => !v.anulada).reduce((acc, v) => acc + utils.n(v.total), 0));
    },
    gananciaCarrito: (state) => {
      const utils = useUtilitiesStore();
      const calculos = useCalculosStore();
      return utils.m(state.carrito.reduce((acc, item) => acc + calculos.gananciaItem(item), 0));
    },
    totalCarrito: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.carrito.reduce((acc, item) => acc + utils.n(item.precio) * utils.n(item.cant), 0));
    },
  },
  actions: {
    async cargar() {
      this.ventas = await db.ventas.toArray();
    },
    agregarCarrito(producto) {
      const utils = useUtilitiesStore();
      const calculos = useCalculosStore();
      const costoUnitario = calculos.costoUnitarioPromedio(producto.id);
      const item = {
        id: producto.id,
        nombre: producto.nombre,
        productoId: producto.id,
        cant: 1,
        precio: utils.n(producto.precio),
        costoUnitario: costoUnitario,
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
    subTotalItem(item) {
      const utils = useUtilitiesStore();
      return utils.m(utils.n(item.precio) * utils.n(item.cant));
    },
    async registrarVenta(venta) {
      await db.ventas.put(venta);
      this.carrito = [];
      await this.cargar();
    },
  },
});
