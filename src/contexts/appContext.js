/**
 * Contexto de la app (provide/inject).
 * App.vue provee `appCtx`; los views lo inyectan con useApp().
 * Evita prop drilling de 40 props por vista.
 */
import { inject } from 'vue';

export const APP_CTX = Symbol('appCtx');

/**
 * Devuelve el contexto de la app (métodos compartidos).
 * Lanza error si se usa fuera de App.
 */
export function useApp() {
  const ctx = inject(APP_CTX, null);
  if (!ctx) throw new Error('useApp() debe usarse dentro de App.vue (falta provide)');
  return ctx;
}
