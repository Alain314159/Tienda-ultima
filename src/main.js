import { createApp } from 'vue';
import App from './App.vue';
import AppIcon from './components/AppIcon.vue';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Autosave } from './services/autosave.js';
import { Log } from './services/logger.js';
import { buildData } from './db.js';
import { db } from './db.js';

// Logger: captura console, errores globales y eventos
Log.init().catch(e => console.warn('Log init fallo:', e));

const app = createApp(App);

app.component('icon', AppIcon);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
  try { window.Log && window.Log.evento('vue-error', { message: err && err.message, info }); } catch (e) {}
};

const vm = app.mount('#app');
window.__app = vm;
window.Log = Log;
setTimeout(() => {
  try {
    Log.evento('app-boot', {
      plataforma: Capacitor.getPlatform(),
      nativo: Capacitor.isNativePlatform(),
      userAgent: navigator.userAgent.slice(0, 80)
    });
  } catch (e) {}
}, 500);

// ============================================================
// CAPACITOR: inicializacion nativa (solo en APK)
// ============================================================
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch(e => console.warn('notifyAppReady fallo:', e));

  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#2196F3' }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

  SplashScreen.hide().catch(() => {});

  CapApp.addListener('backButton', () => {
    if (vm.cobroModal && vm.cobroModal.activo) { vm.cobroModal.activo = false; return; }
    if (vm.ajustesAbierto) { vm.ajustesAbierto = false; return; }
    if (vm.masAbierto) { vm.masAbierto = false; return; }
    if (vm.retiroAbierto) { vm.retiroAbierto = false; return; }
    if (vm.aporteAbierto) { vm.aporteAbierto = false; return; }
    if (vm.confirm && vm.confirm.activo) { vm.confirm.activo = false; return; }
    if (vm.prompt && vm.prompt.activo) { vm.prompt.activo = false; return; }
    if (vm.shareSheetAbierto) { vm.shareSheetAbierto = false; return; }
    if (vm.busquedaGlobalAbierta) { vm.busquedaGlobalAbierta = false; return; }
    if (vm.calcAbierto) { vm.calcAbierto = false; return; }
    if (vm.backupPanelAbierto) { vm.backupPanelAbierto = false; return; }
    if (vm.sec && vm.sec !== 'dashboard') { vm.sec = 'dashboard'; return; }
    CapApp.minimizeApp();
  });
}

// ============================================================
// AUTOSAVE
// ============================================================
setTimeout(async () => {
  try {
    await Autosave.init({ getData: () => buildData(window.__app) });
    await Autosave.verificarAlArrancar();
    db.on('changes', (changes) => {
      const hayEscritura = changes.some(ch => ch.type === 1 || ch.type === 2 || ch.type === 3);
      if (hayEscritura) Autosave.notificarOperacion();
    });
  } catch (e) {
    console.warn('[Autosave] init fallo:', e);
  }
}, 1500);

// ============================================================
// SERVICE WORKER (PWA): solo en web
// ============================================================
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() { window.dispatchEvent(new CustomEvent('pwa:update')); },
      onOfflineReady() { console.log('✅ PWA lista para uso offline'); },
      onRegisteredSW(url, reg) {
        if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      },
      onRegisterError(err) { console.error('❌ SW fallo:', err); }
    });
  }).catch(err => console.warn('PWA register fallo:', err));
}
