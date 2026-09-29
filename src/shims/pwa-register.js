// Stub de virtual:pwa-register para el build de Capacitor.
// En modo nativo no hay Service Worker, asi que registerSW es no-op.
export function registerSW(_options) {
  return () => {};
}
