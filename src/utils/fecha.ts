/**
 * Utilidades de fecha para períodos contables.
 */

/**
 * Normaliza una fecha ISO al INICIO del día LOCAL (medianoche).
 *
 * Los períodos de la app (periodoInicio, cierres) comienzan "el día X", no
 * "a las 16:09:41 del día X": comparar contra el momento exacto de arranque
 * excluía del período a los registros de ese mismo día con fecha local-mediodía
 * (gastos/compras guardan fecha+T12:00:00). Normalizar a medianoche local
 * hace que todo lo registrado el día inicial pertenezca al período, con
 * independencia de la hora a la que se inicializó o cerró.
 */
export function inicioDiaLocal(iso: string | number | Date): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date(0);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Fecha (YYYY-MM-DD) del calendario LOCAL de un momento cualquiera.
 *
 * `toISOString().split('T')[0]` da la fecha UTC: en zonas con desfase
 * negativo (Cuba UTC-4/-5) por la tarde/noche devuelve "mañana".
 * Todo prefill de formularios, display e input type=date debe usar esta.
 */
export function fechaLocal(d: string | number | Date): string {
  const x = new Date(d);
  if (isNaN(x.getTime())) return '';
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return x.getFullYear() + '-' + mm + '-' + dd;
}

/** Fecha de HOY (YYYY-MM-DD) según el calendario local. */
export function hoyLocal(): string {
  return fechaLocal(new Date());
}

/**
 * Interpreta un 'YYYY-MM-DD' (input type=date) como día del calendario
 * LOCAL: medianoche local si `fin` es falso, 23:59:59.999 local si es true.
 *
 * `new Date('YYYY-MM-DD')` parsea como medianoche UTC: en Cuba (UTC-4/-5)
 * el "fin del día" caía en el día anterior al elegido y el reporte
 * perdía el último día entero. Este parse es el contrato del input.
 */
export function diaLocal(fecha: string, fin = false): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((fecha || '').trim());
  if (!m) return fin ? new Date(23, 59, 59) : new Date(0);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return fin ? new Date(23, 59, 59) : new Date(0);
  if (fin) d.setHours(23, 59, 59, 999);
  return d;
}
