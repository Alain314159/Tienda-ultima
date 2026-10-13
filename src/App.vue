<template>
  <div v-cloak :data-theme="cfg.tema">
    <!-- MULTI-TAB WARNING -->
    <div v-if="otraPestana" class="multi-tab-warn no-print">
      <div style="flex: 1">
        <b>⚠ App abierta en otra pestaña</b><br />
        <span style="font-size: 0.72rem">Tenerla abierta en dos lugares puede causar problemas. Cierra la otra.</span>
      </div>
      <button
        class="btn ghost"
        style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
        @click="otraPestana = false"
      >
        OK
      </button>
    </div>

    <!-- ALERTA DE PERDIDA DE DATOS -->
    <div
      v-if="alertaPerdidaDatos"
      class="multi-tab-warn no-print"
      style="background: rgb(239 68 68 / 15%); border: 1px solid var(--bad)"
    >
      <div style="flex: 1">
        <b style="color: var(--bad)">⚠ Tus datos parecen haberse perdido</b><br />
        <span style="font-size: 0.72rem"
          >La app esta configurada pero la base de datos esta vacia. Restaura desde un backup.</span
        >
        <div style="display: flex; gap: 0.4rem; margin-top: 0.5rem; flex-wrap: wrap">
          <button
            v-if="backup.ultimoBackup"
            class="btn ok"
            style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
            @click="backup.restaurarBackupAuto"
          >
            Restaurar backup local
          </button>
          <button
            class="btn ghost"
            style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
            @click="alertaPerdidaDatos = false"
          >
            Descartar
          </button>
        </div>
      </div>
    </div>

    <!-- SAFE MODE BANNER -->
    <div v-if="safeMode" class="safe-mode-banner no-print">
      <div style="flex: 1">
        <b>Modo seguro activado</b><br />
        <span style="font-size: 0.72rem"
          >La app fallo al iniciar varias veces. Algunas funciones estan deshabilitadas.</span
        >
      </div>
      <button
        class="btn ghost"
        style="width: auto; margin: 0; padding: 0.4rem 0.7rem; font-size: 0.72rem"
        @click="salirSafeMode"
      >
        Reintentar
      </button>
    </div>

    <!-- SPLASH -->
    <div v-if="splashVisible" class="splash-screen">
      <div class="splash-logo">
        <icon name="store" :size="48" color="#fff"></icon>
      </div>
      <div class="splash-title">{{ configStore.nombreTienda || 'Tienda Pro' }}</div>
      <div class="splash-spinner"></div>
    </div>

    <!-- PULL TO REFRESH INDICATOR -->
    <div
      v-if="pullDist > 0 || refrescando"
      class="pull-indicator"
      :style="{ transform: 'translateY(' + Math.min(pullDist, 70) + 'px)' }"
    >
      <div class="pull-spinner" :class="{ spin: refrescando || pullDist >= 70 }"></div>
      <span>{{
        refrescando ? 'Actualizando...' : pullDist >= 70 ? 'Suelta para actualizar' : 'Desliza para actualizar'
      }}</span>
    </div>

    <!-- BANNERS -->
    <div v-if="!online" class="banner off no-print">
      <icon name="alert" :size="14" color="#fff"></icon>
      Sin conexion — los datos se guardan localmente
    </div>
    <div v-if="hayUpdate" class="banner upd no-print" @click="aplicarUpdate">
      Nueva versión disponible — tocar para actualizar
    </div>

    <!-- HEADER -->
    <header class="header no-print">
      <h1><icon name="store" :size="20" color="#fff"></icon> {{ configStore.nombreTienda || 'Tienda Pro' }}</h1>
      <div class="hacts">
        <button
          v-if="configStore.busquedaGlobalActiva !== false"
          class="h-btn"
          @click="ui.busquedaGlobalAbierta = true"
          aria-label="Buscar"
        >
          <icon name="search" :size="18" color="#fff"></icon>
        </button>
        <button
          v-if="configStore.calcActiva !== false"
          class="h-btn"
          @click="ui.calcAbierto = true"
          aria-label="Calculadora"
        >
          <icon name="calculator" :size="18" color="#fff"></icon>
        </button>
        <button class="h-btn" @click="toggleTema()" aria-label="Cambiar tema">
          <icon :name="configStore.tema === 'dark' ? 'sun' : 'moon'" :size="18" color="#fff"></icon>
          <span>{{ configStore.tema === 'dark' ? 'Claro' : 'Oscuro' }}</span>
        </button>
        <button class="h-btn" @click="ui.ajustesAbierto = true" aria-label="Ajustes">
          <icon name="settings" :size="18" color="#fff"></icon>
          <span>Ajustes</span>
        </button>
      </div>
    </header>

    <main @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="onTouchEnd">
      <router-view />
    </main>

    <!-- ==================== BOTTOM NAV ==================== -->
    <BottomNav
      :sec="sec"
      :mas-activo="ui.masAbierto"
      :anomalias-criticas="anomaliasCriticas"
      @ir="ir"
      @toggle-mas="ui.masAbierto = !ui.masAbierto"
    />

    <!-- MORE MENU SHEET -->
    <SheetMas
      :abierto="ui.masAbierto"
      :sec="sec"
      @cerrar="ui.masAbierto = false"
      @ir="ir"
      @abrir-ajustes="
        ui.masAbierto = false;
        ui.ajustesAbierto = true;
      "
    />

    <!-- AVISO DE CONFIGURACION -->
    <div v-if="mostrarAvisoTienda" class="modal no-print" @click.self="recordarAvisoTienda">
      <div class="modal-box aviso-tienda" @click.stop>
        <div class="aviso-icono">
          <icon name="upload" :size="26" color="#fff"></icon>
        </div>
        <div class="aviso-titulo">Configura tu respaldo</div>
        <div class="aviso-texto">
          Asignale un <b>nombre unico</b> a tu tienda para activar el backup automatico en Telegram. Asi no pierdes tus
          datos si se rompe o cambias el telefono.
        </div>
        <div class="aviso-pasos">
          <div class="aviso-paso"><span class="aviso-num">1</span> Abre Telegram y busca <b>@mibot_backup_bot</b></div>
          <div class="aviso-paso"><span class="aviso-num">2</span> Enviale <b>/start</b></div>
          <div class="aviso-paso">
            <span class="aviso-num">3</span> Aqui en Ajustes elige un nombre y una contrasena
          </div>
        </div>
        <button class="btn pri" @click="abrirAjustesDesdeAviso">
          <icon name="settings" :size="16" color="#fff"></icon> Configurar ahora
        </button>
        <button class="btn ghost" @click="recordarAvisoTienda">Recordarme despues</button>
        <button class="btn ghost" style="font-size: 0.78rem; opacity: 0.7" @click="cerrarAvisoTienda">
          No volver a mostrar
        </button>
      </div>
    </div>

    <!-- ==================== SETTINGS MODAL ==================== -->
    <AjustesModal :otra-pestana="otraPestana" />

    <!-- CONFIRM MODAL -->
    <ModalConfirm
      :activo="ui.confirm.activo"
      :titulo="ui.confirm.titulo"
      :msg="ui.confirm.msg"
      @ok="ui.okConfirm"
      @cancelar="ui.confirm.activo = false"
    />

    <!-- PROMPT MODAL -->
    <ModalPrompt
      :activo="ui.prompt.activo"
      :titulo="ui.prompt.titulo"
      :msg="ui.prompt.msg"
      :placeholder="ui.prompt.placeholder"
      :type="ui.prompt.type"
      :value="ui.prompt.value"
      @update:value="ui.prompt.value = $event"
      @ok="ui.okPrompt"
      @cancelar="ui.cancelPrompt"
    />

    <!-- GLOBAL SEARCH -->
    <GlobalSearch
      :abierto="ui.busquedaGlobalAbierta"
      :state="{
        productos: productosStore.productos,
        ventas: ventasStore.ventas,
        socios: capitalStore.socios,
        gastos: gastosStore.gastos,
        stockDe: (pid) => productosStore.stock(pid),
        formatMoney: fmt,
      }"
      @cerrar="ui.busquedaGlobalAbierta = false"
      @ir="
        (secDestino, refId) => {
          ui.busquedaGlobalAbierta = false;
          ir(secDestino, refId);
        }
      "
    />

    <!-- TOAST -->
    <Toaster position="top-center" :duration="3000" :visible-toasts="3" rich-colors close-button />
    <Calculator :visible="ui.calcAbierto" @close="ui.calcAbierto = false" />
    <BackupPanel
      v-if="ui.backupPanelAbierto"
      @close="ui.backupPanelAbierto = false"
      @restore="backup.onRestoreBackup"
    />
    <StatusPanel v-if="ui.statusPanelAbierto" @close="ui.statusPanelAbierto = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useOnline, watchDebounced } from '@vueuse/core';
import { Toaster } from 'vue-sonner';
import 'vue-sonner/style.css';

import { n } from './utils/numero';
import { fmt, fmtFH } from './utils/formato';
import { P, genId, clean } from './utils/id';
import { db } from './db';
import BottomNav from './components/BottomNav.vue';
import SheetMas from './components/SheetMas.vue';
import ModalConfirm from './components/ModalConfirm.vue';
import ModalPrompt from './components/ModalPrompt.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import Calculator from './components/Calculator.vue';
import BackupPanel from './components/BackupPanel.vue';
import StatusPanel from './components/StatusPanel.vue';
import AjustesModal from './components/AjustesModal.vue';

import { useConfigStore } from './stores/useConfigStore';
import { useProductosStore } from './stores/useProductosStore';
import { useVentasStore } from './stores/useVentasStore';
import { useComprasStore } from './stores/useComprasStore';
import { useCajaStore } from './stores/useCajaStore';
import { useCapitalStore } from './stores/useCapitalStore';
import { useGastosStore } from './stores/useGastosStore';
import { useUIStore } from './stores/useUIStore';
import { useInsightsStore } from './stores/useInsightsStore';
import { useTelegramStore } from './stores/useTelegramStore';
import { useBackupStore } from './stores/useBackupStore';
import { useNotificacionesStore } from './stores/useNotificacionesStore';
import { datosDeStores } from './stores/exportar';
import { recargarStores, recargarTodoStores } from './stores/recarga';
import { cargarCarpetaHandle } from './services/backup';
import { useGestos } from './composables/useGestos';
import { ir as irA } from './utils/navegacion';
import { TOAST } from './constants';
import { toastMsg } from './utils/toast';

defineOptions({ name: 'App' });

const router = useRouter();
const online = useOnline();

const configStore = useConfigStore();
const ui = useUIStore();
const productosStore = useProductosStore();
const ventasStore = useVentasStore();
const comprasStore = useComprasStore();
const cajaStore = useCajaStore();
const capitalStore = useCapitalStore();
const gastosStore = useGastosStore();
const insights = useInsightsStore();
const telegram = useTelegramStore();
const backup = useBackupStore();
const notificaciones = useNotificacionesStore();

const cfg = configStore.cfg;
const sec = computed(() => String(router.currentRoute.value.name || 'dashboard'));
const anomaliasCriticas = computed(() => insights.recomendacionesUrgentes);

// ===== ESTADO DEL SHELL =====
const cargando = ref(true);
const splashVisible = ref(true);
const otraPestana = ref(false);
const alertaPerdidaDatos = ref(false);
const safeMode = ref(false);
const hayUpdate = ref(false);
const mostrarAvisoTienda = ref(false);

let _tabId: string | null = null;
let _bc: BroadcastChannel | null = null;

// ===== GESTOS (swipe + pull-to-refresh) =====
const { pullDist, refrescando, onTouchStart, onTouchMove, onTouchEnd } = useGestos(router, () => sec.value);

// ===== NAVEGACIÓN =====
function ir(s: string, refId?: string) {
  ui.masAbierto = false;
  irA(router, s, refId);
}

// ===== TEMA =====
function toggleTema() {
  cfg.tema = configStore.tema === 'dark' ? 'light' : 'dark';
  try {
    document.documentElement.setAttribute('data-theme', cfg.tema);
  } catch (e) {}
  configStore.guardarCfg();
}

// ===== SAFE MODE =====
async function salirSafeMode() {
  ui.confirmar({
    titulo: 'Salir de modo seguro',
    msg: 'Se reintentara arrancar normalmente. Si falla de nuevo, vuelve a modo seguro.',
    onOk: async () => {
      try {
        await P(db.config, { key: 'safeModeCounter', value: 0 });
      } catch (e) {}
      location.reload();
    },
  });
}

// ===== AVISO DE CONFIGURACION INICIAL =====
function abrirAjustesDesdeAviso() {
  mostrarAvisoTienda.value = false;
  ui.ajustesAbierto = true;
}

function cerrarAvisoTienda() {
  mostrarAvisoTienda.value = false;
  cfg.avisoTiendaDescartado = true;
  configStore.guardarCfg();
}

function recordarAvisoTienda() {
  mostrarAvisoTienda.value = false;
}

// ===== PWA UPDATE =====
function aplicarUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => location.reload(), 500);
      })
      .catch(() => location.reload());
  } else {
    location.reload();
  }
}

// ===== WATCHERS GLOBALES =====
watch(
  () => cfg.tema,
  (t) => {
    try {
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  }
);

watch(
  () => cfg.fontScale,
  (v) => {
    try {
      document.documentElement.style.setProperty('--font-scale', String(Number(v) || 1));
    } catch (e) {}
  }
);

watch(
  () => cfg.calcActiva,
  (v) => {
    if (v === false) ui.calcAbierto = false;
  }
);

watch(
  () => cfg.busquedaGlobalActiva,
  (v) => {
    if (v === false) ui.busquedaGlobalAbierta = false;
  }
);

// Persistencia del carrito (debounce 300ms)
watchDebounced(
  () => ventasStore.carrito,
  (val) => {
    try {
      localStorage.setItem('carritoPro', JSON.stringify(val));
    } catch (e) {}
  },
  { deep: true, debounce: 300 }
);

// ===== FLUSH AL CERRAR (antes de que el SO mate la pestaña) =====
function _flushPendientes() {
  try {
    localStorage.setItem('carritoPro', JSON.stringify(ventasStore.carrito));
  } catch (e) {
    console.warn('flush carrito', e);
  }
  backup.backupAuto().catch((e) => console.warn('flush backup', e));
}

// ===== B13: MIGRAR GASTOS VIEJOS DE movCaja A LA TABLA gastos =====
async function migrarGastosViejos() {
  try {
    const movsGasto = cajaStore.movCaja.filter(
      (mv) =>
        mv.tipo === 'egreso' &&
        mv.concepto &&
        /gasto/i.test(mv.concepto) &&
        !mv.concepto.startsWith('Pago deuda:') &&
        !mv.concepto.startsWith('Gasto:')
    );
    const gastosConMov = new Set(gastosStore.gastos.filter((g) => g.movId).map((g) => g.movId));
    const aMigrar = movsGasto.filter((mv) => !gastosConMov.has(mv.id));
    if (aMigrar.length > 0) {
      const nuevosGastos = aMigrar.map((mv) => {
        const cat = /luz/i.test(mv.concepto)
          ? 'Luz'
          : /agua/i.test(mv.concepto)
            ? 'Agua'
            : /alquiler|renta/i.test(mv.concepto)
              ? 'Alquiler'
              : /internet|wifi/i.test(mv.concepto)
                ? 'Internet'
                : /transport/i.test(mv.concepto)
                  ? 'Transporte'
                  : /publicid|anuncio/i.test(mv.concepto)
                    ? 'Publicidad'
                    : /mantenim|reparac/i.test(mv.concepto)
                      ? 'Mantenimiento'
                      : /limpiez/i.test(mv.concepto)
                        ? 'Limpieza'
                        : 'Otros';
        return {
          id: genId('g'),
          fecha: mv.fecha,
          categoria: cat,
          concepto: mv.concepto,
          monto: n(mv.monto),
          nota: mv.nota || '',
          metodoPago: 'efectivo',
          saleDeCaja: true,
          movId: mv.id,
          migrado: true,
        };
      });
      await db.gastos.bulkPut(nuevosGastos.map((x) => clean(x)));
      gastosStore.gastos = await db.gastos.toArray();
      toastMsg('Migrados ' + aMigrar.length + ' gasto(s) antiguos');
    }
  } catch (e) {
    console.error('migrar gastos', e);
  }
}

// ===== INICIALIZACIÓN =====
async function inicializar() {
  const t0 = performance.now();
  // Deteccion multi-pestana
  try {
    _tabId = genId('tab');
    if (typeof BroadcastChannel !== 'undefined') {
      _bc = new BroadcastChannel('tienda-pro');
      _bc.onmessage = (e) => {
        if (e.data && e.data.tipo === 'hello' && e.data.tabId !== _tabId) {
          otraPestana.value = true;
          _bc?.postMessage({ tipo: 'existe', tabId: _tabId });
        }
      };
      _bc.postMessage({ tipo: 'hello', tabId: _tabId as string });
    }
  } catch (e) {}

  try {
    // SAFE MODE: contar intentos fallidos
    let intentos = 0;
    try {
      const sm = await db.config.get('safeModeCounter');
      intentos = sm && sm.value ? Number(sm.value) : 0;
    } catch (e) {}
    if (intentos >= 3) {
      safeMode.value = true;
      console.warn('SAFE MODE activado (3+ intentos fallidos)');
    }
    try {
      await P(db.config, { key: 'safeModeCounter', value: intentos + 1 });
    } catch (e) {}

    const c = await db.config.get('cfg');
    if (c) configStore.cfg = { ...configStore.cfg, ...(c.value as object) };
    else await configStore.guardarCfg();
    try {
      document.documentElement.setAttribute('data-theme', cfg.tema);
    } catch (e) {}
    try {
      document.documentElement.style.setProperty('--font-scale', String(Number(cfg.fontScale) || 1));
    } catch (e) {}

    // Limpiar items viejos de la cola de backups
    try {
      const hace7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const viejos = await db.tgQueue.filter((x) => x.ts < hace7d).toArray();
      if (viejos.length > 0) {
        await db.tgQueue.bulkDelete(viejos.map((x) => x.id));
        console.log('Limpiados ' + viejos.length + ' items viejos de tgQueue');
      }
    } catch (e) {
      console.error('limpiar tgQueue', e);
    }

    // Aviso de configuracion inicial
    if (!cfg.tiendaConfigurada && !cfg.avisoTiendaDescartado) {
      setTimeout(() => {
        mostrarAvisoTienda.value = true;
      }, 800);
    }

    await recargarTodoStores();

    // DETECCION DE PERDIDA DE DATOS
    try {
      const totalDatos = productosStore.productos.length + ventasStore.ventas.length + comprasStore.compras.length;
      if (totalDatos === 0 && cfg.nombreTienda && cfg.tiendaConfigurada) {
        console.warn('⚠ POSIBLE PERDIDA DE DATOS: app configurada pero base vacia');
        setTimeout(() => {
          alertaPerdidaDatos.value = true;
        }, 1200);
      }
    } catch (e) {
      console.warn('deteccion perdida', e);
    }

    // Restaurar carrito persistido (por si cerro la app a media venta)
    try {
      const savedCarrito = localStorage.getItem('carritoPro');
      if (savedCarrito) {
        const parsed = JSON.parse(savedCarrito);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validos = parsed.filter((it) => {
            if (!it || !it.productoId) return false;
            const prod = productosStore.productos.find((x) => x.id === it.productoId && !x.archivado);
            return !!prod && productosStore.stock(it.productoId) > 0;
          });
          if (validos.length > 0) {
            ventasStore.carrito = validos;
            toastMsg('Carrito restaurado (' + validos.length + ' item(s))');
          } else {
            localStorage.removeItem('carritoPro');
          }
        }
      }
    } catch (e) {
      console.error('restaurar carrito', e);
    }

    // Backup auto local al arrancar (si pasaron >2h)
    const b = await db.config.get('backupAuto');
    if (b) backup.ultimoBackup = b as { fecha: string; value: unknown };
    const ahora = Date.now();
    if (!cfg.ultimoBackupAuto || ahora - cfg.ultimoBackupAuto > 7200000) {
      await backup.backupAuto();
      cfg.ultimoBackupAuto = ahora;
      await configStore.guardarCfg();
      const b2 = await db.config.get('backupAuto');
      if (b2) backup.ultimoBackup = b2 as { fecha: string; value: unknown };
    }

    // B13: migrar gastos viejos
    await migrarGastosViejos();

    // Telegram: estado inicial
    telegram.sincronizarEstado();
    if (!cfg.tgChatId) {
      setTimeout(() => telegram.tgAutoDetectarChat(), 2000);
    }
  } catch (e) {
    console.error(e);
    toastMsg('Error al cargar datos', TOAST.BAD);
  } finally {
    // Si todo fue bien, resetear contador
    try {
      await P(db.config, { key: 'safeModeCounter', value: 0 });
    } catch (e) {}
    cargando.value = false;
    splashVisible.value = false;
    console.log('Inicializacion: ' + (performance.now() - t0).toFixed(1) + 'ms');

    // Cargar handle de carpeta si existe
    try {
      const rec = await cargarCarpetaHandle();
      if (rec) {
        cfg.tgCarpetaActiva = true;
        cfg.tgCarpetaNombre = rec.nombre || 'Carpeta';
      }
    } catch (e) {}

    // Actualizar cola pendiente y pre-import info
    await telegram.tgActualizarCola();
    await backup.cargarPreImportInfo();

    // Timers de fondo
    backup.iniciarBackupInterval();
    notificaciones.iniciarChequeos();
    telegram.iniciarTimers(() => datosDeStores());

    // Si no hay chat de Telegram, empezar a buscar (no en safe mode)
    if (!safeMode.value && !cfg.tgChatId) telegram.iniciarTgPoll();

    // Auto-backup a Telegram si esta activo (no en safe mode)
    if (!safeMode.value && cfg.tgAutoBackup) {
      setTimeout(() => telegram.tgAutoBackupCheck(datosDeStores), 5000);
    }
  }
}

// ===== CICLO DE VIDA =====
onMounted(() => {
  inicializar();

  window.addEventListener('pwa:update', () => {
    hayUpdate.value = true;
  });
  window.addEventListener('online', () => {
    telegram.tgProcesarCola().catch(() => {});
  });
  window.addEventListener('resize', () => {
    // Los gráficos se repintan solos al re-montar DashboardView
  });
  // Flush al cerrar/cambiar de visibilidad (evita perder carrito por debounce)
  window.addEventListener('beforeunload', _flushPendientes);
  window.addEventListener('pagehide', _flushPendientes);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flushPendientes();
  });
});

onBeforeUnmount(() => {
  if (_bc) {
    try {
      _bc.close();
    } catch (e) {}
  }
  backup.detenerBackupInterval();
  notificaciones.detenerChequeos();
  telegram.detenerTimers();
});

// Exponer la instancia para debugging (Eruda/F12)
defineExpose({
  ui,
  configStore,
  backup,
  telegram,
  sec,
});
</script>
