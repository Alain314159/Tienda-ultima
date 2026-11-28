/**
 * Wrapper único de notificaciones toast (vue-sonner).
 * Centraliza el mapeo de tipos internos (ok/warn/bad) a vue-sonner
 * y la vibración háptica asociada.
 *
 * Duración (5.6/2.6): los errores necesitan tiempo de lectura — 6 s
 * (antes 3 s, lo mismo que un aviso de éxito) — y los avisos 5 s.
 * El contenedor de vue-sonner ya anuncia los toasts con
 * aria-live="polite" (Toaster.vue de la librería), así que TalkBack los
 * lee sin añadir nada en App.vue.
 */
import { toast } from 'vue-sonner';
import { vib } from '../utils/formato';
import { TOAST } from '../constants';

/** Duración mínima de lectura por tipo (ms). */
export const DURACION_TOAST = { ok: 3000, warn: 5000, bad: 6000 } as const;

/**
 * Muestra un toast.
 * @param {string} msg texto a mostrar
 * @param {'ok'|'warn'|'bad'} type tipo interno
 * @param {string} accionTxt etiqueta de la acción opcional
 * @param {Function|null} accionFn callback de la acción opcional
 */
export function toastMsg(
  msg: string,
  type: string = TOAST.OK,
  accionTxt: string = '',
  accionFn: (() => void) | null = null
) {
  vib(type === TOAST.OK ? 20 : 40);
  const tipo = type === TOAST.BAD ? 'error' : type === TOAST.WARN ? 'warning' : 'success';
  const base = tipo === 'error' ? DURACION_TOAST.bad : tipo === 'warning' ? DURACION_TOAST.warn : DURACION_TOAST.ok;
  const opts: { duration: number; action?: { label: string; onClick: () => void } } = {
    // Con acción (p. ej. reintentar) el usuario necesita leerla: nunca
    // menos de 5 s aunque el tipo sea de éxito.
    duration: accionTxt ? Math.max(base, 5000) : base,
  };
  if (accionTxt && accionFn) opts.action = { label: accionTxt, onClick: () => accionFn() };
  toast[tipo](msg, opts);
}
