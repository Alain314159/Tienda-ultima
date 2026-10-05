import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useLotesStore = defineStore('lotes', {
  state: () => ({
    lotes: [],
  }),
  getters: {
    lotesActivos: (state) => state.lotes.filter((l) => (l.cantidadInicial || 0) - (l.cantidadVendida || 0) > 0),
    valorInventario: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.lotes.reduce((acc, lote) => {
        const disponible = utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida);
        return acc + disponible * utils.n(lote.costo);
      }, 0));
    },
  },
  actions: {
    async cargar() {
      this.lotes = await db.lotes.toArray();
    },
    porProducto(productoId) {
      return this.lotes.filter((l) => l.productoId === productoId);
    },
    valorProducto(productoId) {
      const utils = useUtilitiesStore();
      return utils.m(this.porProducto(productoId).reduce((acc, lote) => {
        const disponible = utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida);
        return acc + disponible * utils.n(lote.costo);
      }, 0));
    },
    stockProducto(productoId) {
      const utils = useUtilitiesStore();
      return utils.m(this.porProducto(productoId).reduce((acc, lote) => acc + (utils.n(lote.cantidadInicial) - utils.n(lote.cantidadVendida)), 0));
    },
  },
});
