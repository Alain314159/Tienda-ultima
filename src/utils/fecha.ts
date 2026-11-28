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
  // Un 'YYYY-MM-DD' sin hora se parsea como medianoche UTC: en zonas UTC-4
  // eso es las 20:00 del día anterior en local, y setHours(0) caería en ese
  // día anterior. Un día sin hora es un día del calendario local.
  if (typeof iso === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
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
 * Timestamp (ms) de una fecha, con el mismo contrato que inicioDiaLocal:
 * un 'YYYY-MM-DD' sin hora es un día del calendario LOCAL (medianoche
 * local), nunca medianoche UTC; un ISO completo, un Date o un número son
 * el instante exacto que dicen. Fecha inválida → 0 (época: incluye todo
 * el histórico, igual que inicioDiaLocal).
 *
 * Es el parse ÚNICO que deben usar los filtros de período: parsear con
 * `new Date()` crudo un 'YYYY-MM-DD' desplaza el día 4-5 h en Cuba.
 */
export function fechaMs(fecha: string | number | Date): number {
  if (typeof fecha === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(fecha.trim())) {
    return inicioDiaLocal(fecha).getTime();
  }
  if (fecha instanceof Date) {
    const t = fecha.getTime();
    return isNaN(t) ? 0 : t;
  }
  if (typeof fecha === 'number') return isNaN(fecha) ? 0 : fecha;
  const t = new Date(fecha).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Predicado «en el período»: fecha >= inicio y (si hay fin) fecha <= fin.
 *
 * El inicio es el INSTANTE que dice periodoInicio, sin normalizarlo a
 * medianoche: tras un cierre el nuevo período arranca en el momento exacto
 * del cierre y un registro de ese mismo día pero anterior al cierre
 * pertenece al período CERRADO (contarlo también aquí sería doble conteo
 * de ganancia). El primer período ya viene normalizado a medianoche local
 * (default del config + migración one-shot en cargarCierres), así que el
 * instante exacto y la medianoche coinciden ahí.
 */
export function enPeriodo(
  fecha: string | number | Date,
  inicio: string | number | Date,
  fin?: string | number | Date
): boolean {
  const f = fechaMs(fecha);
  if (f < fechaMs(inicio)) return false;
  if (fin !== undefined && f > fechaMs(fin)) return false;
  return true;
}

/**
 * Fábrica del predicado «en el período» con los límites pre-parseados
 * UNA sola vez. Para filtros sobre muchos registros: parsear el inicio
 * (y el fin) en cada registro es el coste que se evita con esto.
 */
export function crearEnPeriodo(
  inicio: string | number | Date,
  fin?: string | number | Date
): (fecha: string | number | Date) => boolean {
  const ini = fechaMs(inicio);
  const hasta = fin === undefined ? Infinity : fechaMs(fin);
  return (fecha: string | number | Date) => {
    const f = fechaMs(fecha);
    return f >= ini && f <= hasta;
  };
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
