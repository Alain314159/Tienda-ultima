/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versión del build inyectada por el workflow (p. ej. `6.0.1-a1b2c3d`). */
  readonly VITE_APP_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module 'virtual:pwa-register' {
  export function registerSW(options?: Record<string, unknown>): void;
}

interface Window {
  db: unknown;
  __app: unknown;
  Log: { init: () => Promise<void>; evento: (nombre: string, datos?: Record<string, unknown>) => void };
}
