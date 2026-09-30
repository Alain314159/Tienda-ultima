import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, P } from '../db.js';

export const useConfigStore = defineStore('config', () => {
  const cfg = ref({
    nombre: 'Tienda Pro',
    tema: 'light',
    capitalInicial: 0,
    periodoInicio: new Date().toISOString(),
    calcActiva: true,
    busquedaGlobalActiva: true,
    calcBilletesActiva: true,
    notifActivo: false
  });

  async function cargar() {
    try {
      const c = await db.config.get('cfg');
      if (c) cfg.value = { ...cfg.value, ...c.value };
    } catch (e) {}
  }

  async function guardar() {
    try {
      await P(db.config, { key: 'cfg', value: cfg.value });
    } catch (e) {
      console.error('guardarCfg', e);
    }
  }

  function actualizar(cambios) {
    cfg.value = { ...cfg.value, ...cambios };
    guardar();
  }

  return { cfg, cargar, guardar, actualizar };
});
