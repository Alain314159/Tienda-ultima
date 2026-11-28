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
 *
 * La sync de fondo también vive aquí (3.1): App.vue la arranca al iniciar
 * y corre cada 45 s con sesión activa y online, aunque el panel «Nube y
 * cuenta» esté cerrado. El panel sigue mostrando el estado y el botón
 * manual; ambos usan la misma vuelta (`sincronizarAhora`).
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, seguimiento } from '../db';
import { P } from '../utils/id';
import { Log } from '../services/logger';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import {
  clienteNubeDe,
  restaurarSesionNube,
  sincronizarNube,
  supabase,
} from '../sync/nube';
import type { ClienteNube } from '../sync/nube';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recargarTodoStores } from './recarga';

export type EstadoSync =
  | 'al-dia'
  | 'sincronizando'
  | 'error'
  | 'sin-sesion'
  | 'sin-sincronizar'
  | 'sesion-pendiente';

/**
 * Sin una sync correcta en este tiempo, el indicador marca "sin sincronizar".
 * Antes eran 10 minutos: con internet intermitente el chip pasaba el día en
 * rojo aunque no hubiera ningún problema (3.3). El rojo queda SOLO para un
 * error real de sync; «sin sincronizar» es un estado neutro. Con la sync de
 * fondo cada 45 s, un día sin sync correcta ya es señal de que algo lleva
 * tiempo sin poder subir, sin ser una alarma.
 */
export const UMBRAL_SIN_SYNC_MS = 24 * 60 * 60 * 1000;

/** Ritmo de la sync de fondo: entre 30 y 60 s (3.1). */
export const INTERVALO_FONDO_MS = 45 * 1000;

export const useNubeStore = defineStore('nube', () => {
  const sesionCorreo = ref<string | null>(null);
  /** La sesión no se pudo comprobar (sin red): no es «sin sesión», se reintenta. */
  const sesionPendiente = ref(false);
  const sincronizando = ref(false);
  const ultimaSync = ref<string | null>(null);
  const ultimoError = ref<string | null>(null);
  const ultimoResumen = ref('');

  const estado = computed<EstadoSync>(() => {
    if (sincronizando.value) return 'sincronizando';
    if (ultimoError.value) return 'error';
    if (sesionPendiente.value) return 'sesion-pendiente';
    if (!sesionCorreo.value) return 'sin-sesion';
    if (!ultimaSync.value) return 'sin-sincronizar';
    return Date.now() - new Date(ultimaSync.value).getTime() > UMBRAL_SIN_SYNC_MS ? 'sin-sincronizar' : 'al-dia';
  });

  /** Lee la última sync persistida (al arrancar, antes de la primera vuelta). */
  async function cargarUltimaSync() {
    try {
      const rec = await db.config.get('ultimaSyncNube');
      if (rec && typeof rec.value === 'string') ultimaSync.value = rec.value;
    } catch (e) {
      Log.warn('nube: no se pudo leer la última sync guardada', e);
    }
  }

  function setSesion(correo: string | null) {
    sesionCorreo.value = correo;
    if (correo) sesionPendiente.value = false;
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
    } catch (e) {
      Log.warn('nube: no se pudo persistir la última sync', e);
    }
  }

  function marcarError(msg: string) {
    ultimoError.value = msg;
    sincronizando.value = false;
  }

  /**
   * Restaura la sesión guardada al arrancar (o al reintentar en fondo).
   * Devuelve qué pasó: 'ok' (hay sesión), 'sin-sesion' (nunca se entró),
   * 'transitorio' (no se pudo comprobar: se reintenta, NO se cierra sesión)
   * o 'invalida' (Supabase dice que el refresh token no vale: hay que
   * volver a entrar con Google). Solo 'invalida' avisa al usuario.
   */
  async function restaurarSesion(
    clienteSupabase?: SupabaseClient
  ): Promise<'ok' | 'sin-sesion' | 'transitorio' | 'invalida'> {
    let resultado: Awaited<ReturnType<typeof restaurarSesionNube>>;
    try {
      resultado = await restaurarSesionNube(clienteSupabase, { intentos: 2, esperaBaseMs: 1000 });
    } catch (e) {
      Log.error('nube: restaurarSesion falló de forma inesperada', e);
      sesionPendiente.value = true;
      return 'transitorio';
    }
    if ('sesion' in resultado) {
      setSesion(resultado.sesion.correo);
      return 'ok';
    }
    if (resultado.error === 'invalida') {
      setSesion(null);
      sesionPendiente.value = false;
      toastMsg('Tu sesión de Google caducó. Vuelve a entrar desde «Nube y cuenta».', TOAST.WARN);
      return 'invalida';
    }
    if (resultado.error === 'transitorio') {
      sesionPendiente.value = true;
      return 'transitorio';
    }
    setSesion(null);
    return 'sin-sesion';
  }

  /**
   * Una vuelta de sincronización. La usan el botón manual del panel, el
   * temporizador de fondo y el regreso a primer plano: la misma vuelta,
   * el mismo estado. Devuelve true si la vuelta terminó bien.
   */
  async function sincronizarAhora(opciones: { origen?: 'fondo' | 'manual'; cliente?: ClienteNube } = {}): Promise<boolean> {
    const origen = opciones.origen ?? 'manual';
    if (sincronizando.value || !sesionCorreo.value) return false;
    marcarInicio();
    try {
      const cliente = opciones.cliente ?? clienteNubeDe(await supabase());
      const r = await sincronizarNube({ db, seg: seguimiento }, cliente);
      if (r.tablas.length) await recargarTodoStores();
      await marcarExito();
      ultimoResumen.value = `${r.enviado} enviados · ${r.aplicados} recibidos${r.descartes ? ` · ${r.descartes} guardados en versiones que perdieron` : ''}`;
      return true;
    } catch (e) {
      const msg = 'No se pudo sincronizar con la nube. Revisa la conexión a internet.';
      marcarError(msg);
      Log.error('nube: vuelta de sync fallida', e);
      // 3.2: si la vuelta de fondo falla, el aviso no puede quedarse solo
      // dentro del panel (que está cerrado): toast visible con reintento.
      if (origen === 'fondo') {
        toastMsg('No se pudo sincronizar con la nube. Se reintentará automáticamente.', TOAST.WARN, 'Sincronizar ahora', () => {
          void sincronizarAhora({ origen: 'manual' });
        });
      }
      return false;
    }
  }

  // ===== SYNC DE FONDO (3.1) =====
  let temporizador: ReturnType<typeof setInterval> | undefined;
  let clienteFondo: ClienteNube | undefined;
  let clienteSupabaseFondo: SupabaseClient | undefined;

  /** Una pasada de fondo: restaura la sesión si hace falta y sincroniza. */
  async function vueltaFondo(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!sesionCorreo.value) {
        const estadoSesion = await restaurarSesion(clienteSupabaseFondo);
        if (estadoSesion !== 'ok') return;
      }
      await sincronizarAhora({ origen: 'fondo', cliente: clienteFondo });
    } catch (e) {
      // La vuelta de fondo nunca debe tumbar la app: se deja constancia y
      // el próximo tick lo reintenta.
      Log.warn('nube: vuelta de fondo falló', e);
    }
  }

  /**
   * Arranca el temporizador de sync de fondo (solo con sesión activa y
   * online; cada pasada lo comprueba). Lo llama App.vue al arrancar.
   * `cliente` / `clienteSupabase` solo se usan en tests para no tocar
   * Supabase real; `intervaloMs` también (los relojes falsos congelan
   * IndexedDB, así que los tests usan relojes reales con intervalo corto).
   */
  function iniciarSyncFondo(
    opciones: { cliente?: ClienteNube; clienteSupabase?: SupabaseClient; intervaloMs?: number } = {}
  ): void {
    if (temporizador) return;
    clienteFondo = opciones.cliente;
    clienteSupabaseFondo = opciones.clienteSupabase;
    temporizador = setInterval(() => void vueltaFondo(), opciones.intervaloMs ?? INTERVALO_FONDO_MS);
    void vueltaFondo();
  }

  function detenerSyncFondo(): void {
    if (temporizador) clearInterval(temporizador);
    temporizador = undefined;
    clienteFondo = undefined;
    clienteSupabaseFondo = undefined;
  }

  return {
    sesionCorreo,
    sesionPendiente,
    sincronizando,
    ultimaSync,
    ultimoError,
    ultimoResumen,
    estado,
    cargarUltimaSync,
    setSesion,
    marcarInicio,
    marcarExito,
    marcarError,
    restaurarSesion,
    sincronizarAhora,
    iniciarSyncFondo,
    detenerSyncFondo,
    vueltaFondo,
  };
});
