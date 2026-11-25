/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TG_APP_KEY?: string;
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
