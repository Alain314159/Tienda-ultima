/**
 * Store de Configuración Global
 * Centraliza toda la configuración de la aplicación
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Config } from '../types';
import { P } from '../utils/id';
import { db } from '../db';
import { esPinHasheado, hashPin } from '../services/pin';

export const useConfigStore = defineStore('config', () => {
  // ===== ESTADO =====
  const cfg = ref<Config>({
    // Personalización
    nombre: 'Tienda Pro',
    tema: 'light',
    fontScale: 1,

    // Seguridad
    pin: '',
    pinActivo: false,

    // Finanzas
    capitalInicial: 0,
    periodoInicio: new Date().toISOString(),

    // Comportamiento
    calcActiva: true,
    busquedaGlobalActiva: true,
    calcBilletesActiva: false,

    // Notificaciones
    notifActivo: false,
    horaArqueo: '',

    // Umbrales
    umbralDiasCierre: 30,
    umbralMermasSemana: 3,
    umbralFaltantesMes: 2,
    umbralSobrantesMes: 2,
    umbralBackupDias: 7,
    umbralSinMovimientoDias: 60,
    umbralDescuentoPct: 20,
    stockMinDefault: 5,

    // Estado
    anomaliasDescartadas: [],
    productosAvisados: [],

    // Backup
    tgAutoBackup: false,
    tgUltimoBackup: null,
    tgUltimoHash: '',
    tgFallosConsecutivos: 0,
    tgMantenerN: 10,

    // Telegram
    tgToken: '',
    tgChatId: '',
    nombreTienda: '',
    tiendaConfigurada: false,
    tgNombre: '',

    // UI
    avisoTiendaDescartado: false,
    tutorialVisto: false,
    mostrarSplash: true,

    // Gráficos
    graficoVista: 'mes',
    graficoProdPeriodo: 'mes',
    graficoProdTipo: 'vendidos',

    // Modo seguro
    safeMode: false,
  });

  // ===== GETTERS =====
  const tema = computed(() => cfg.value.tema);
  const nombreTienda = computed(() => cfg.value.nombre);
  const pinActivo = computed(() => cfg.value.pinActivo);
  const capitalInicial = computed(() => cfg.value.capitalInicial);
  const calcActiva = computed(() => cfg.value.calcActiva !== false);
  const busquedaGlobalActiva = computed(() => cfg.value.busquedaGlobalActiva !== false);
  const periodoInicio = computed(() => cfg.value.periodoInicio);

  // ===== ACCIONES =====

  /**
   * Guarda la configuración en IndexedDB.
   * El PIN (si existe y no está hasheado) se guarda como hash PBKDF2:
   * nunca persiste en claro.
   */
  async function guardarCfg() {
    try {
      if (cfg.value.pin && !esPinHasheado(cfg.value.pin)) {
        cfg.value.pin = await hashPin(cfg.value.pin);
      }
      await P(db.config, { key: 'cfg', value: cfg.value });
    } catch (e) {
      console.error('Error guardando configuración:', e);
    }
  }

  /**
   * Cambia el tema (claro/oscuro)
   */
  function toggleTema() {
    cfg.value.tema = cfg.value.tema === 'dark' ? 'light' : 'dark';
    guardarCfg();
  }

  /**
   * Cambia la escala de fuente
   */
  function cambiarEscalaFont(delta) {
    const nuevaEscala = Math.max(1, Math.min(2, cfg.value.fontScale + delta));
    if (nuevaEscala !== cfg.value.fontScale) {
      cfg.value.fontScale = nuevaEscala;
      guardarCfg();
    }
  }

  /**
   * Actualiza la configuración
   */
  function actualizarCfg(nuevosValores) {
    Object.assign(cfg.value, nuevosValores);
    guardarCfg();
  }

  /**
   * Carga la configuración desde IndexedDB. Migra en segundo plano
   * los PIN legacy en claro a hash PBKDF2.
   */
  async function cargarCfg() {
    try {
      const configGuardada = await db.config.get('cfg');
      if (configGuardada) {
        cfg.value = { ...cfg.value, ...(configGuardada.value as object) };
        // Migración one-shot: PIN en claro -> hash (no bloquea el arranque)
        if (cfg.value.pin && cfg.value.pinActivo && !esPinHasheado(cfg.value.pin)) {
          void guardarCfg();
        }
      }
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }

  // ===== EXPORTS =====
  return {
    cfg,
    tema,
    nombreTienda,
    pinActivo,
    capitalInicial,
    calcActiva,
    busquedaGlobalActiva,
    periodoInicio,
    guardarCfg,
    toggleTema,
    cambiarEscalaFont,
    actualizarCfg,
    cargarCfg,
  };
});

export default useConfigStore;
