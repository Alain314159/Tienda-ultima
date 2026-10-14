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
