import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useProductosStore = defineStore('productos', {
  state: () => ({
    productos: [],
  }),
  getters: {
    activos: (state) => state.productos.filter((p) => !p.archivado),
    productosBajoStock: (state) => {
      const utils = useUtilitiesStore();
      return state.productos.filter((p) => !p.archivado && utils.n(p.stockMin) > 0);
    },
    productosAgotados: (state) => {
      return state.productos.filter((p) => !p.archivado);
    },
  },
  actions: {
    async cargar() {
      this.productos = await db.productos.toArray();
    },
    stock(productoId) {
      const utils = useUtilitiesStore();
      const lotes = db.lotes.filter((l) => l.productoId === productoId).toArray();
      if (lotes instanceof Promise || !Array.isArray(lotes)) return 0;
      return utils.redondear(
        lotes.reduce((acc, lote) => acc + utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida), 0)
      );
    },
    async guardar(producto) {
      await db.productos.put(producto);
      await this.cargar();
    },
  },
});
