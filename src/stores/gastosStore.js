import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useGastosStore = defineStore('gastos', {
  state: () => ({
    gastos: [],
  }),
  getters: {
    gastosOpPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.gastos.reduce((acc, g) => acc + utils.n(g.monto), 0));
    },
    gastosTotalAcumulado: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.gastos.reduce((acc, g) => acc + utils.n(g.monto), 0));
    },
  },
  actions: {
    async cargar() {
      this.gastos = await db.gastos.toArray();
    },
    async guardar(gasto) {
      await db.gastos.put(gasto);
      await this.cargar();
    },
    async eliminar(id) {
      await db.gastos.delete(id);
      await this.cargar();
    },
  },
});
