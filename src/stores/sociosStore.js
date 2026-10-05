import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useSociosStore = defineStore('socios', {
  state: () => ({
    socios: [],
    distribuciones: [],
    capital: [],
  }),
  getters: {
    activos: (state) => state.socios.filter((s) => s.activo !== false),
    totalDistribuido: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.distribuciones.reduce((acc, d) => acc + utils.n(d.monto), 0));
    },
    sumaPorcentajes: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.socios.reduce((acc, s) => acc + utils.n(s.porcentaje), 0));
    },
    gananciaDisponible: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.capital.reduce((acc, m) => acc + (m.tipo === 'aporte' ? utils.n(m.monto) : -utils.n(m.monto)), 0));
    },
  },
  actions: {
    async cargar() {
      this.socios = await db.socios.toArray();
      this.distribuciones = await db.distribuciones.toArray();
      this.capital = await db.capital.toArray();
    },
    async guardarSocio(socio) {
      await db.socios.put(socio);
      await this.cargar();
    },
    async repartir(monto, concepto) {
      await db.distribuciones.put({
        id: 'dist_' + Date.now(),
        fecha: new Date().toISOString(),
        concepto,
        monto,
      });
      await this.cargar();
    },
  },
});
