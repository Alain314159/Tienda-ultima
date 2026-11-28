/**
 * Esquema de la base de datos local (Dexie / IndexedDB).
 * Fuente única de verdad de la persistencia.
 */
import Dexie, { type Table } from 'dexie';
import type {
  Producto,
  Lote,
  Venta,
  Compra,
  Ajuste,
  Arqueo,
  MovCaja,
  Asiento,
  Cierre,
  MovCapital,
  Retiro,
  Socio,
  Distribucion,
  Gasto,
} from './types';
import type { Cambio, Descarte, RegistroSync } from './sync/tipos';
import { instalarSeguimiento } from './sync/seguimiento';

/** Registro clave/valor de configuración. */
export interface RegistroConfig {
  key: string;
  value: unknown;
  fecha?: string;
  nombre?: string;
}

/**
 * Esquema Dexie por versión, compuesto como base + overrides (4.5).
 *
 * Dexie exige el esquema COMPLETO en cada versión, pero antes cada versión
 * re-listaba las 20 tablas a mano (las v6-10 eran copias casi idénticas) y
 * un índice añadido había que repetirlo en todas las posteriores — así se
 * coló el bug silencioso de la v8 (un índice que faltaba en una versión).
 * Ahora cada versión es la anterior + solo lo que cambia.
 *
 * CONTRATO: el esquema EFECTIVO de cada versión es idéntico al anterior
 * (mismo conjunto de tablas e índices por versión); las migraciones
 * v1→v10 deben seguir siendo las mismas. Lo verifica
 * tests/db-esquema.test.js, que compara cada versión contra el esquema
 * literal que había antes de la composición.
 */
type EsquemaDexie = Record<string, string>;

/** Versión 1: esquema inicial. */
const ESQUEMA_V1: EsquemaDexie = {
  productos: 'id, nombre, archivado',
  lotes: 'id, productoId, compraId, fecha',
  ventas: 'id, fecha, anulada',
  compras: 'id, productoId, fecha',
  ajustes: 'id, productoId, fecha',
  arqueos: 'id, fecha',
  movCaja: 'id, fecha, tipo',
  cierres: 'id, fechaCierre',
  capital: 'id, fecha',
  retiros: 'id, fecha',
  socios: 'id, nombre, aporte, porcentaje, fecha, activo',
  distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
  config: 'key',
};

/** Versión 2: agrega gastos operativos. */
const ESQUEMA_V2: EsquemaDexie = { ...ESQUEMA_V1, gastos: 'id, fecha, categoria' };

/** Versión 3: agrega libro diario. */
const ESQUEMA_V3: EsquemaDexie = {
  ...ESQUEMA_V2,
  asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
};

/** Versión 4: agrega pasivos (deudas). */
const ESQUEMA_V4: EsquemaDexie = {
  ...ESQUEMA_V3,
  pasivos: 'id, fecha, acreedor, pagado, vencimiento',
};

/** Versión 5: auditorías físicas. */
const ESQUEMA_V5: EsquemaDexie = {
  ...ESQUEMA_V4,
  auditorias: 'id, fechaInicio, estado',
};

/** Versión 6: índices compuestos para consultas rápidas. */
const ESQUEMA_V6: EsquemaDexie = {
  ...ESQUEMA_V5,
  productos: 'id, nombre, archivado, [archivado+nombre]',
  lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
  ventas: 'id, fecha, anulada, [anulada+fecha]',
  compras: 'id, productoId, fecha, [productoId+fecha]',
  ajustes: 'id, productoId, fecha, [productoId+fecha]',
  movCaja: 'id, fecha, tipo, [tipo+fecha]',
  capital: 'id, fecha, socioId',
  gastos: 'id, fecha, categoria, [categoria+fecha]',
};

/** Versión 7: cola de backups pendientes. */
const ESQUEMA_V7: EsquemaDexie = { ...ESQUEMA_V6, tgQueue: 'id, estado, ts' };

/**
 * Versión 8: indexar 'motivo' en la cola de backups — los
 * where('motivo').equals('auto') de la cola/backupAuto reventaban con
 * SchemaError (motivo no era índice) y los try/catch lo tragaban en
 * silencio: la anti-acumulación de backups 'auto' en cola estaba muerta.
 */
const ESQUEMA_V8: EsquemaDexie = { ...ESQUEMA_V7, tgQueue: 'id, estado, ts, motivo' };

/**
 * Versión 9: sincronización entre dispositivos.
 * - cambios: registro de altas, modificaciones y borrados (lápidas) que
 *   alimenta la nube y el WiFi directo. `++id` da el orden y el cursor;
 *   `propagar` separa lo nacido aquí (1) de lo aplicado desde fuera (0).
 * - descartes: versión local que pierde un conflicto, para poder recuperarla.
 * - syncMeta: cursores y estado de los transportes.
 */
const ESQUEMA_V9: EsquemaDexie = {
  ...ESQUEMA_V8,
  cambios: '++id, tabla, registroId, [tabla+registroId], ts, propagar',
  descartes: '++id, tabla, registroId, ts',
  syncMeta: 'clave',
};

/** Quita una tabla del esquema (copia; el original no se toca). */
function sinTabla(esquema: EsquemaDexie, tabla: string): EsquemaDexie {
  const copia = { ...esquema };
  delete copia[tabla];
  return copia;
}

/**
 * Versión 10: elimina la cola de Telegram (tgQueue). Telegram se retiró
 * el 2026-11-27; la sincronización en la nube (Supabase) y por WiFi, más
 * el backup local, sustituyen el respaldo por Telegram.
 */
const ESQUEMA_V10: EsquemaDexie = sinTabla(ESQUEMA_V9, 'tgQueue');

/** Esquema efectivo por versión (exportado para tests/db-esquema.test.js). */
export const ESQUEMAS_POR_VERSION: Record<number, EsquemaDexie> = {
  1: ESQUEMA_V1,
  2: ESQUEMA_V2,
  3: ESQUEMA_V3,
  4: ESQUEMA_V4,
  5: ESQUEMA_V5,
  6: ESQUEMA_V6,
  7: ESQUEMA_V7,
  8: ESQUEMA_V8,
  9: ESQUEMA_V9,
  10: ESQUEMA_V10,
};

export class TiendaProDB extends Dexie {
  productos!: Table<Producto, string>;
  lotes!: Table<Lote, string>;
  ventas!: Table<Venta, string>;
  compras!: Table<Compra, string>;
  ajustes!: Table<Ajuste, string>;
  arqueos!: Table<Arqueo, string>;
  movCaja!: Table<MovCaja, string>;
  cierres!: Table<Cierre, string>;
  capital!: Table<MovCapital, string>;
  retiros!: Table<Retiro, string>;
  socios!: Table<Socio, string>;
  distribuciones!: Table<Distribucion, string>;
  gastos!: Table<Gasto, string>;
  asientos!: Table<Asiento, string>;
  pasivos!: Table<Record<string, unknown>, string>;
  auditorias!: Table<Record<string, unknown>, string>;
  config!: Table<RegistroConfig, string>;
  cambios!: Table<Cambio, number>;
  descartes!: Table<Descarte, number>;
  syncMeta!: Table<RegistroSync, string>;

  // `nombre` permite abrir una segunda base en los tests (dos "dispositivos").
  constructor(nombre = 'TiendaProDB') {
    super(nombre);
    this._definirVersiones();
  }

  private _definirVersiones(): void {
    for (const [version, esquema] of Object.entries(ESQUEMAS_POR_VERSION)) {
      this.version(Number(version)).stores(esquema);
    }
  }
}

export const db = new TiendaProDB();

/** Seguimiento de cambios de la base principal (ver sync/seguimiento.ts). */
export const seguimiento = instalarSeguimiento(db);

// Exponer db en window para debugging (útil con Eruda/F12). SOLO en
// desarrollo: en producción exponer la BD entera en window es regalar el
// acceso a toda la contabilidad a cualquier script inyectado (mismo
// criterio que window.__app en main.ts).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).db = db;
}
