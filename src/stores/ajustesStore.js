import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useAjustesStore = defineStore('ajustes', {
  state: () => ({
    ajustes: [],
  }),
  getters: {
    mermasPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.ajustes.reduce((acc, a) => acc + (a.cantidad < 0 ? utils.n(a.costoPerdida) : 0), 0));
    },
  },
  actions: {
    async cargar() {
      this.ajustes = await db.ajustes.toArray();
    },
    async guardar(ajuste) {
      await db.ajustes.put(ajuste);
      await this.cargar();
    },
  },
});
