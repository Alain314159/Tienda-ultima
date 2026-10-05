import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useCapitalStore = defineStore('capital', {
  state: () => ({
    capital: [],
    retiros: [],
  }),
  getters: {
    capitalTotal: (state) => {
      const utils = useUtilitiesStore();
      return utils.sumar(
        ...state.capital
          .filter((m) => m.tipo === 'aporte')
          .map((m) => utils.n(m.monto))
      );
    },
    retirosTotales: (state) => {
      const utils = useUtilitiesStore();
      return utils.sumar(...state.retiros.map((r) => utils.n(r.monto)));
    },
    gananciaDisponible: (state) => {
      const utils = useUtilitiesStore();
      const aportes = utils.sumar(
        ...state.capital
          .filter((m) => m.tipo === 'aporte')
          .map((m) => utils.n(m.monto))
      );
      const retirado = utils.sumar(...state.retiros.map((r) => utils.n(r.monto)));
      return utils.redondear(aportes - retirado);
    },
  },
  actions: {
    async cargar() {
      this.capital = await db.capital.toArray();
      this.retiros = await db.retiros.toArray();
    },
    async registrarAporte(monto, nota = '') {
      const aporte = {
        id: 'cap_' + Date.now(),
        tipo: 'aporte',
        monto: monto,
        fecha: new Date().toISOString(),
        nota,
      };
      await db.capital.put(aporte);
      await this.cargar();
    },
    async registrarRetiro(monto, nota = '') {
      const retiro = {
        id: 'ret_' + Date.now(),
        monto: monto,
        fecha: new Date().toISOString(),
        nota,
      };
      await db.retiros.put(retiro);
      await this.cargar();
    },
  },
});
