import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index';
import AppIcon from './components/AppIcon.vue';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Autosave } from './services/autosave';
import { Log } from './services/logger';
import { db } from './db';
import { datosDeStores } from './stores/exportar';
import { useUIStore } from './stores/useUIStore';

// Logger: captura console, errores globales y eventos
Log.init().catch((e) => console.warn('Log init fallo:', e));

// Crear instancia de Pinia
const pinia = createPinia();

const app = createApp(App);

app.use(pinia);
app.use(router);
app.component('Icon', AppIcon);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
  try {
    if (window.Log) window.Log.evento('vue-error', { message: err instanceof Error ? err.message : String(err), info });
  } catch {}
};

const vm = app.mount('#app');
window.__app = vm;
window.Log = Log;
setTimeout(() => {
  try {
    Log.evento('app-boot', {
      plataforma: Capacitor.getPlatform(),
      nativo: Capacitor.isNativePlatform(),
      userAgent: navigator.userAgent.slice(0, 80),
    });
  } catch {}
}, 500);

// ============================================================
// CAPACITOR: inicializacion nativa (solo en APK)
// Botón back usando el store de UI (sin acoplarse a App.vue)
// ============================================================
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch((e) => console.warn('notifyAppReady fallo:', e));

  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#2196F3' }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

  SplashScreen.hide().catch(() => {});

  CapApp.addListener('backButton', () => {
    const ui = useUIStore();
    // Prioridad: cobro > ajustes > mas > retiro > aporte > confirm > prompt >
    // share > busqueda > calculadora > backup > status > navegar a inicio
    if (ui.cobroAbierto) {
      ui.cobroAbierto = false;
      return;
    }
    if (ui.ajustesAbierto) {
      ui.ajustesAbierto = false;
      return;
    }
    if (ui.masAbierto) {
      ui.masAbierto = false;
      return;
    }
    if (ui.retiroAbierto) {
      ui.retiroAbierto = false;
      return;
    }
    if (ui.aporteAbierto) {
      ui.aporteAbierto = false;
      return;
    }
    if (ui.confirm.activo) {
      ui.confirm.activo = false;
      return;
    }
    if (ui.prompt.activo) {
      ui.prompt.activo = false;
      return;
    }
    if (ui.shareSheetAbierto) {
      ui.shareSheetAbierto = false;
      return;
    }
    if (ui.busquedaGlobalAbierta) {
      ui.busquedaGlobalAbierta = false;
      return;
    }
    if (ui.calcAbierto) {
      ui.calcAbierto = false;
      return;
    }
    if (ui.backupPanelAbierto) {
      ui.backupPanelAbierto = false;
      return;
    }
    if (ui.statusPanelAbierto) {
      ui.statusPanelAbierto = false;
      return;
    }
    const ruta = router.currentRoute.value.name;
    if (ruta && ruta !== 'dashboard') {
      router.push({ name: 'dashboard' });
      return;
    }
    CapApp.minimizeApp();
  });
}

// ============================================================
// AUTOSAVE
// ============================================================
setTimeout(async () => {
  try {
    await Autosave.init({ getData: datosDeStores });
    await Autosave.verificarAlArrancar();
    (db as unknown as { on: (ev: string, cb: (changes: { type: number }[]) => void) => void }).on(
      'changes',
      (changes) => {
        const hayEscritura = changes.some((ch) => ch.type === 1 || ch.type === 2 || ch.type === 3);
        if (hayEscritura) Autosave.notificarOperacion();
      }
    );
  } catch (e) {
    console.warn('[Autosave] init fallo:', e);
  }
}, 1500);

// ============================================================
// SERVICE WORKER (PWA): solo en web
// ============================================================
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          window.dispatchEvent(new CustomEvent('pwa:update'));
        },
        onOfflineReady() {
          console.log('✅ PWA lista para uso offline');
        },
        onRegisteredSW(url: string, reg: ServiceWorkerRegistration | undefined) {
          if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        },
        onRegisterError(err: unknown) {
          console.error('❌ SW fallo:', err);
        },
      });
    })
    .catch((err) => console.warn('PWA register fallo:', err));
}
