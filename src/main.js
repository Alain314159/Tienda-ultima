import { createApp } from 'vue';
import App from './App.vue';
import AppIcon from './components/AppIcon.vue';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import NextConsole from '@royalscome/nextconsole';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Autosave } from './services/autosave.js';
import { db } from './db.js';
import { buildData } from './db.js';

const app = createApp(App);

app.component('icon', AppIcon);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
};

const vm = app.mount('#app');
window.__app = vm;

// ============================================================
// CAPACITOR: inicializacion nativa (solo en APK, no en web)
// ============================================================
if (Capacitor.isNativePlatform()) {
  // Avisar a Capgo que la app arranco bien (evita rollback automatico)
  CapacitorUpdater.notifyAppReady().catch(e => console.warn('notifyAppReady fallo:', e));

  // Barra de estado azul (coherente con el header)
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#2196F3' }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

  // Ocultar splash al arrancar
  SplashScreen.hide().catch(() => {});

  // Boton atras de Android: comportamiento inteligente
  CapApp.addListener('backButton', () => {
    // 1. Si hay un modal abierto, cerrarlo
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

    // 2. Si no esta en dashboard, ir al dashboard
    if (vm.sec && vm.sec !== 'dashboard') { vm.sec = 'dashboard'; return; }

    // 3. Si esta en dashboard sin modales, minimizar la app
    CapApp.minimizeApp();
  });
}

// ============================================================
// AUTOSAVE: cuenta operaciones y guarda backups en carpeta
// ============================================================
setTimeout(async () => {
  try {
    // Inicializar con la funcion que devuelve el estado actual
    await Autosave.init({
      getData: () => buildData(window.__app)
    });
    // Si hubo cambios desde el ultimo backup, guardar
    await Autosave.verificarAlArrancar();
    // Hook de Dexie: cada escritura cuenta como una operacion
    db.on('changes', (changes) => {
      const hayEscritura = changes.some(ch => ch.type === 1 || ch.type === 2 || ch.type === 3);
      if (hayEscritura) Autosave.notificarOperacion();
    });
    console.log('[Autosave] inicializado');
  } catch (e) {
    console.warn('[Autosave] init fallo:', e);
  }
}, 1500);

// ============================================================
// NEXT CONSOLE: activar en dev o con 5 toques en el titulo
// ============================================================
const nc = new NextConsole({
  defaultTab: 'console',
  panelHeight: 0.4,
  theme: 'dark'
});
if (import.meta.env.DEV) {
  nc.show();
} else {
  let _taps = 0, _tapTimer = null;
  document.addEventListener('click', (e) => {
    const h1 = e.target.closest('.header h1');
    if (!h1) return;
    _taps++;
    clearTimeout(_tapTimer);
    if (_taps >= 5) { nc.show(); _taps = 0; }
    else _tapTimer = setTimeout(() => { _taps = 0; }, 800);
  });
}

// ============================================================
// SERVICE WORKER (PWA): solo en web, NO en Capacitor
// ============================================================
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('pwa:update'));
      },
      onOfflineReady() {
        console.log('✅ PWA lista para uso offline');
      },
      onRegisteredSW(url, reg) {
        console.log('✅ Service Worker registrado:', url);
        if (reg) {
          setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        }
      },
      onRegisterError(err) {
        console.error('❌ SW registro falló:', err);
      }
    });
  }).catch(err => console.warn('PWA register fallo:', err));
}
