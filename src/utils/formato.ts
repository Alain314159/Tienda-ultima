/**
 * Formateadores de dinero, cantidades y fechas para la UI.
 */
import { n } from './numero';

/** Vibración háptica (no-op si el dispositivo no la soporta). */
export const vib = (ms: number | number[]): void => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
};

/** Formato moneda: $1,234.56 */
export function fmt(v: unknown): string {
  try {
    return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    return '$0.00';
  }
}

/** Formato cantidad: recorta ceros no significativos. */
export function fmtCant(v: unknown): string {
  const num = parseFloat(String(v));
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? String(num) : num.toFixed(4).replace(/\.?0+$/, '');
}

/** Formato fecha corta: dd/mm/aa */
export function fmtFecha(iso: string | Date): string {
  try {
    const d = new Date(iso);
    return (
      String(d.getDate()).padStart(2, '0') +
      '/' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '/' +
      String(d.getFullYear()).slice(2)
    );
  } catch (e) {
    return '';
  }
}

/** Formato fecha y hora: dd/mm/aa HH:mm */
export function fmtFH(iso: string | Date): string {
  try {
    const d = new Date(iso);
    return fmtFecha(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } catch (e) {
    return '';
  }
}
