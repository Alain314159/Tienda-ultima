/**
 * Tipos y constantes compartidos por el seguimiento de cambios y el motor de
 * sincronización (nube y WiFi directo).
 */

/**
 * Tablas de datos que viajan entre dispositivos. `asientos` no viaja: el libro
 * diario se reconstruye en cada teléfono a partir de sus tablas fuente.
 * Tampoco viajan `config` (ajustes y PIN del teléfono) ni `tgQueue` (cola local).
 */
export const TABLAS_SINCRONIZABLES = [
  'productos',
  'lotes',
  'ventas',
  'compras',
  'ajustes',
  'arqueos',
  'movCaja',
  'cierres',
  'capital',
  'retiros',
  'socios',
  'distribuciones',
  'gastos',
  'pasivos',
  'auditorias',
] as const;

export type TablaSincronizable = (typeof TABLAS_SINCRONIZABLES)[number];

/** Conjunto para comprobar rápido si una tabla viaja. */
export const ES_SYNC: ReadonlySet<string> = new Set<string>(TABLAS_SINCRONIZABLES);

export type TipoCambio = 'put' | 'delete';

export interface Cambio {
  /** Secuencia autoincremental: da el orden y sirve de cursor a los transportes. */
  id?: number;
  tabla: string;
  registroId: string;
  tipo: TipoCambio;
  /** Marca lógica del dispositivo que hizo el cambio (ms); 0 = edad desconocida. */
  ts: number;
  dispositivo: string;
  /** 1 si nació en este dispositivo (hay que propagarlo); 0 si llegó de otro. */
  propagar: number;
  /** De dónde llegó si no nació aquí (`wifi`, `nube`): así no vuelve al mismo sitio. */
  origen?: string;
}

/** Versión local que pierde contra una remota más nueva: se guarda para poder recuperarla. */
export interface Descarte {
  id?: number;
  tabla: string;
  registroId: string;
  ts: number;
  origen: string;
  motivo: string;
  datos: unknown;
}

/** Registro clave/valor del estado de sincronización (cursores). */
export interface RegistroSync {
  clave: string;
  value: unknown;
}

/** Fila tal como viaja entre dos dispositivos o con la nube. */
export interface FilaRemota {
  tabla: string;
  id: string;
  datos: Record<string, unknown> | null;
  borrado: boolean;
  ts: number;
  dispositivo: string;
}
