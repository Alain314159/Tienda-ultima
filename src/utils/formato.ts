/**
 * Formateadores de dinero, cantidades y fechas para la UI.
 */
import { n } from './numero';

// Crear el formateador es lo caro: se cachea una única instancia en el
// módulo (~5-10x más rápido que toLocaleString por llamada en listas largas).
const FMT_MONEDA = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Vibración háptica (no-op si el dispositivo no la soporta). */
export const vib = (ms: number | number[]): void => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
};

/** Formato moneda: $1,234.56 */
export function fmt(v: unknown): string {
  try {
    return '$' + FMT_MONEDA.format(n(v));
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

/** Formato fecha completa: dd/mm/yyyy (períodos de cierre). */
export function formatoDisplay(iso: string | Date): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Diferencia en días entre dos fechas (d2 - d1). Fechas inválidas → 0. */
export function diasEntre(fecha1: string | Date | undefined, fecha2: string | Date | undefined): number {
  const d1 = fecha1 === undefined ? NaN : new Date(fecha1).getTime();
  const d2 = fecha2 === undefined ? NaN : new Date(fecha2).getTime();
  if (isNaN(d1) || isNaN(d2)) return 0;
  return Math.floor((d2 - d1) / 86400000);
}
