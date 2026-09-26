import { createApp } from 'vue';
import App from './App.vue';
import AppIcon from './components/AppIcon.vue';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import NextConsole from '@royalscome/nextconsole';

const app = createApp(App);

app.component('icon', AppIcon);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
};

const vm = app.mount('#app');
window.__app = vm;

// NextConsole: activar en dev o con 5 toques en el titulo de la app
const nc = new NextConsole({
  defaultTab: 'console',
  panelHeight: 0.4,
  theme: 'dark'
});
if (import.meta.env.DEV) {
  nc.show();
} else {
  // En produccion: 5 toques rapidos en el titulo para abrir la consola
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

// Registrar Service Worker (PWA)
if ('serviceWorker' in navigator) {
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
}
