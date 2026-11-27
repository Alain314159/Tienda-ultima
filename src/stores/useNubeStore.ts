/**
 * Estado compartido de la sincronización en la nube.
 *
 * Antes este estado vivía solo dentro de CuentaNube.vue (última sync,
 * vuelta en curso, sesión): el header no podía mostrarlo sin duplicar
 * la lógica. CuentaNube escribe aquí y el indicador del header lee.
 *
 * La fecha de la última sync correcta se persiste en db.config
 * (clave 'ultimaSyncNube') para que sobreviva a recargas y para que el
 * recordatorio de backups sepa cuándo se sincronizó por última vez.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db } from '../db';
import { P } from '../utils/id';

export type EstadoSync = 'al-dia' | 'sincronizando' | 'error' | 'sin-sesion' | 'sin-sincronizar';

/** Sin una sync correcta en este tiempo, el indicador marca "sin sincronizar". */
export const UMBRAL_SIN_SYNC_MS = 10 * 60 * 1000;

export const useNubeStore = defineStore('nube', () => {
  const sesionCorreo = ref<string | null>(null);
  const sincronizando = ref(false);
  const ultimaSync = ref<string | null>(null);
  const ultimoError = ref<string | null>(null);

  const estado = computed<EstadoSync>(() => {
    if (!sesionCorreo.value) return 'sin-sesion';
    if (sincronizando.value) return 'sincronizando';
    if (ultimoError.value) return 'error';
    if (!ultimaSync.value) return 'sin-sincronizar';
    return Date.now() - new Date(ultimaSync.value).getTime() > UMBRAL_SIN_SYNC_MS ? 'sin-sincronizar' : 'al-dia';
  });

  /** Lee la última sync persistida (al arrancar, antes de la primera vuelta). */
  async function cargarUltimaSync() {
    try {
      const rec = await db.config.get('ultimaSyncNube');
      if (rec && typeof rec.value === 'string') ultimaSync.value = rec.value;
    } catch {}
  }

  function setSesion(correo: string | null) {
    sesionCorreo.value = correo;
  }

  function marcarInicio() {
    sincronizando.value = true;
  }

  async function marcarExito() {
    const ahora = new Date().toISOString();
    ultimaSync.value = ahora;
    ultimoError.value = null;
    sincronizando.value = false;
    try {
      await P(db.config, { key: 'ultimaSyncNube', value: ahora });
    } catch {}
  }

  function marcarError(msg: string) {
    ultimoError.value = msg;
    sincronizando.value = false;
  }

  return {
    sesionCorreo,
    sincronizando,
    ultimaSync,
    ultimoError,
    estado,
    cargarUltimaSync,
    setSesion,
    marcarInicio,
    marcarExito,
    marcarError,
  };
});
