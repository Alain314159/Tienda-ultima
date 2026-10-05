import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useCierresStore = defineStore('cierres', {
  state: () => ({
    cierres: [],
    asientos: [],
  }),
  getters: {
    gananciaNetaPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.cierres.reduce((acc, cierre) => acc + utils.n(cierre.ganancia), 0));
    },
    comprasPeriodo: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.cierres.reduce((acc, cierre) => acc + utils.n(cierre.totalCompras || 0), 0));
    },
    margenPeriodo: (state) => {
      const utils = useUtilitiesStore();
      const ingresos = state.cierres.reduce((acc, cierre) => acc + utils.n(cierre.totalVentas || 0), 0);
      const ganancia = state.cierres.reduce((acc, cierre) => acc + utils.n(cierre.ganancia), 0);
      if (ingresos === 0) return 0;
      return utils.m((ganancia / ingresos) * 100);
    },
  },
  actions: {
    async cargar() {
      this.cierres = await db.cierres.toArray();
      this.asientos = await db.asientos.toArray();
    },
    async cerrarPeriodo(periodo) {
      await db.cierres.put(periodo);
      await this.cargar();
    },
  },
});
