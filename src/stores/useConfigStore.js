/**
 * Store de Configuración Global
 * Centraliza toda la configuración de la aplicación
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { db, P } from '../db';

export const useConfigStore = defineStore('config', () => {
  // ===== ESTADO =====
  const cfg = ref({
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
    safeMode: false
  });

  // ===== GETTERS =====
  const tema = computed(() => cfg.value.tema);
  const nombreTienda = computed(() => cfg.value.nombre);
  const pinActivo = computed(() => cfg.value.pinActivo);
  const capitalInicial = computed(() => cfg.value.capitalInicial);
  const periodoInicio = computed(() => cfg.value.periodoInicio);

  // ===== ACCIONES =====
  
  /**
   * Guarda la configuración en IndexedDB
   */
  async function guardarCfg() {
    try {
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
   * Carga la configuración desde IndexedDB
   */
  async function cargarCfg() {
    try {
      const configGuardada = await db.config.get('cfg');
      if (configGuardada) {
        cfg.value = { ...cfg.value, ...configGuardada.value };
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
    periodoInicio,
    guardarCfg,
    toggleTema,
    cambiarEscalaFont,
    actualizarCfg,
    cargarCfg
  };
});

export default useConfigStore;
