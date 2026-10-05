import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';
import { useCalculosStore } from './calculosStore.js';

export const useComprasStore = defineStore('compras', {
  state: () => ({
    compras: [],
  }),
  getters: {
    comprasPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.compras.reduce((acc, c) => acc + utils.n(c.total), 0));
    },
  },
  actions: {
    async cargar() {
      this.compras = await db.compras.toArray();
    },
    async guardar(compra) {
      await db.compras.put(compra);
      await this.cargar();
    },
    async eliminar(id) {
      await db.compras.delete(id);
      await this.cargar();
    },
  },
});
