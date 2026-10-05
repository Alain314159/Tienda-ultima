import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useProductosStore = defineStore('productos', {
  state: () => ({
    productos: [],
    filtroStock: null,
  }),
  getters: {
    prodsActivos: (state) => state.productos.filter((p) => !p.archivado),
    productosBajoStock: (state) => {
      const utils = useUtilitiesStore();
      return state.productos.filter((p) => !p.archivado && utils.n(p.stockMin) > 0 && (p.stock || 0) <= utils.n(p.stockMin));
    },
    productosAgotados: (state) => state.productos.filter((p) => !p.archivado && (p.stock || 0) <= 0),
  },
  actions: {
    async cargar() {
      this.productos = await db.productos.toArray();
      this.productos = this.productos.map((p) => ({
        ...p,
        stock: this.stock(p.id),
      }));
    },
    stock(productoId) {
      const utils = useUtilitiesStore();
      const lotes = db.lotes ? db.lotes.filter((l) => l.productoId === productoId).toArray() : [];
      const total = lotes instanceof Promise ? 0 : lotes.reduce((acc, lote) => acc + utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida), 0);
      return utils.m(total);
    },
    async guardar(producto) {
      await db.productos.put(producto);
      await this.cargar();
    },
    async archivar(productoId) {
      const item = this.productos.find((p) => p.id === productoId);
      if (!item) return;
      await db.productos.update(productoId, { archivado: true });
      await this.cargar();
    },
    async restaurar(productoId) {
      await db.productos.update(productoId, { archivado: false });
      await this.cargar();
    },
    getById(productoId) {
      return this.productos.find((p) => p.id === productoId) || null;
    },
  },
});
