import { defineStore } from 'pinia';
import { db } from '../db';

export const useDbStore = defineStore('db', {
  state: () => ({
    productos: [],
    lotes: [],
    ventas: [],
    compras: [],
    movCaja: [],
    gastos: [],
    socios: [],
    asientos: [],
    pasivos: [],
    config: {},
    initialized: false,
  }),

  actions: {
    async init() {
      if (this.initialized) return;
      console.log('⏳ Cargando datos desde IndexedDB...');
      const [
        productos, lotes, ventas, compras, movCaja,
        gastos, socios, asientos, pasivos, config
      ] = await Promise.all([
        db.productos.toArray(),
        db.lotes.toArray(),
        db.ventas.toArray(),
        db.compras.toArray(),
        db.movCaja.toArray(),
        db.gastos.toArray(),
        db.socios.toArray(),
        db.asientos.toArray(),
        db.pasivos.toArray(),
        db.config.toArray()
      ]);
      this.productos = productos;
      this.lotes = lotes;
      this.ventas = ventas;
      this.compras = compras;
      this.movCaja = movCaja;
      this.gastos = gastos;
      this.socios = socios;
      this.asientos = asientos;
      this.pasivos = pasivos;
      this.config = config[0] || {};
      this.initialized = true;
      console.log('✅ Store cargado');
    }
  }
});
