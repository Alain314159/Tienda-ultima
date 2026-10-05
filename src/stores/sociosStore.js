import { defineStore } from 'pinia';
import { db } from '../db.js';
import { useUtilitiesStore } from './utilitiesStore.js';

export const useCajaStore = defineStore('caja', {
  state: () => ({
    movCaja: [],
    arqueos: [],
  }),
  getters: {
    saldoCaja: (state) => {
      const utils = useUtilitiesStore();
      return utils.m(state.movCaja.reduce((acc, mov) => {
        const delta = mov.tipo === 'ingreso' ? 1 : -1;
        return acc + (utils.n(mov.monto) * delta);
      }, 0));
    },
  },
  actions: {
    async cargar() {
      this.movCaja = await db.movCaja.toArray();
      this.arqueos = await db.arqueos.toArray();
    },
    async registrarMovimiento(movimiento) {
      await db.movCaja.put(movimiento);
      await this.cargar();
    },
  },
});
