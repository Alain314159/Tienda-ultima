import { defineStore } from 'pinia';

export const useConfigStore = defineStore('config', {
  state: () => ({
    nombreTienda: 'Tienda Pro',
    tema: 'dark',
    periodoInicio: new Date().toISOString(),
    busquedaGlobalActiva: true,
    calcActiva: true,
    graficoVista: 'mes',
    graficoProdPeriodo: 'mes',
    graficoProdTipo: 'vendidos',
    anomaliasDescartadas: [],
    umbralDiasCierre: 30,
    umbralMermasSemana: 3,
    umbralFaltantesMes: 2,
    umbralBackupDias: 7,
    umbralSinMovimientoDias: 60,
  }),
  actions: {
    setTema(tema) {
      this.tema = tema;
    },
    setPeriodoInicio(fecha) {
      this.periodoInicio = fecha;
    },
    setNombre(nombre) {
      this.nombreTienda = nombre || 'Tienda Pro';
    },
    toggleTema() {
      this.tema = this.tema === 'dark' ? 'light' : 'dark';
    },
  },
});
