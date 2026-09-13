import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info);
};

app.mount('#app');

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
      // Buscar updates cada 1 hora
      if (reg) {
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      }
    },
    onRegisterError(err) {
      console.error('❌ SW registro falló:', err);
    }
  });
}
