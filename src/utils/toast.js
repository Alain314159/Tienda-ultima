/**
 * Wrapper único de notificaciones toast (vue-sonner).
 * Centraliza el mapeo de tipos internos (ok/warn/bad) a vue-sonner
 * y la vibración háptica asociada.
 */
import { toast } from 'vue-sonner';
import { vib } from '../db.js';
import { TOAST } from '../constants.js';

/**
 * Muestra un toast.
 * @param {string} msg texto a mostrar
 * @param {'ok'|'warn'|'bad'} type tipo interno
 * @param {string} accionTxt etiqueta de la acción opcional
 * @param {Function|null} accionFn callback de la acción opcional
 */
export function toastMsg(msg, type = TOAST.OK, accionTxt = '', accionFn = null) {
  vib(type === TOAST.OK ? 20 : 40);
  const tipo = type === TOAST.BAD ? 'error' : type === TOAST.WARN ? 'warning' : 'success';
  const opts = { duration: accionTxt ? 5000 : 3000 };
  if (accionTxt && accionFn) opts.action = { label: accionTxt, onClick: () => accionFn() };
  toast[tipo](msg, opts);
}
