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
    const ESQUEMA_BASE = {
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

    // Version 1: esquema inicial
    this.version(1).stores(ESQUEMA_BASE);

    // Version 2: agrega gastos operativos
    this.version(2).stores({ ...ESQUEMA_BASE, gastos: 'id, fecha, categoria' });

    // Version 3: agrega libro diario
    this.version(3).stores({
      ...ESQUEMA_BASE,
      gastos: 'id, fecha, categoria',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
    });

    // Version 4: agrega pasivos (deudas)
    this.version(4).stores({
      ...ESQUEMA_BASE,
      gastos: 'id, fecha, categoria',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
    });

    // Version 5: auditorias fisicas
    this.version(5).stores({
      ...ESQUEMA_BASE,
      gastos: 'id, fecha, categoria',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
    });

    // Version 6: indices compuestos para consultas rapidas
    this.version(6).stores({
      productos: 'id, nombre, archivado, [archivado+nombre]',
      lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
      ventas: 'id, fecha, anulada, [anulada+fecha]',
      compras: 'id, productoId, fecha, [productoId+fecha]',
      ajustes: 'id, productoId, fecha, [productoId+fecha]',
      arqueos: 'id, fecha',
      movCaja: 'id, fecha, tipo, [tipo+fecha]',
      cierres: 'id, fechaCierre',
      capital: 'id, fecha, socioId',
      retiros: 'id, fecha',
      socios: 'id, nombre, aporte, porcentaje, fecha, activo',
      distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
      gastos: 'id, fecha, categoria, [categoria+fecha]',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
      config: 'key',
    });

    // Version 7: cola de backups pendientes
    this.version(7).stores({
      productos: 'id, nombre, archivado, [archivado+nombre]',
      lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
      ventas: 'id, fecha, anulada, [anulada+fecha]',
      compras: 'id, productoId, fecha, [productoId+fecha]',
      ajustes: 'id, productoId, fecha, [productoId+fecha]',
      arqueos: 'id, fecha',
      movCaja: 'id, fecha, tipo, [tipo+fecha]',
      cierres: 'id, fechaCierre',
      capital: 'id, fecha, socioId',
      retiros: 'id, fecha',
      socios: 'id, nombre, aporte, porcentaje, fecha, activo',
      distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
      gastos: 'id, fecha, categoria, [categoria+fecha]',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
      tgQueue: 'id, estado, ts',
      config: 'key',
    });

    // Version 8: indexar 'motivo' en la cola de backups — los
    // where('motivo').equals('auto') de la cola/backupAuto reventaban con
    // SchemaError (motivo no era índice) y los try/catch lo tragaban en
    // silencio: la anti-acumulación de backups 'auto' en cola estaba muerta.
    this.version(8).stores({
      productos: 'id, nombre, archivado, [archivado+nombre]',
      lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
      ventas: 'id, fecha, anulada, [anulada+fecha]',
      compras: 'id, productoId, fecha, [productoId+fecha]',
      ajustes: 'id, productoId, fecha, [productoId+fecha]',
      arqueos: 'id, fecha',
      movCaja: 'id, fecha, tipo, [tipo+fecha]',
      cierres: 'id, fechaCierre',
      capital: 'id, fecha, socioId',
      retiros: 'id, fecha',
      socios: 'id, nombre, aporte, porcentaje, fecha, activo',
      distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
      gastos: 'id, fecha, categoria, [categoria+fecha]',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
      tgQueue: 'id, estado, ts, motivo',
      config: 'key',
    });

    // Version 9: sincronización entre dispositivos.
    // - cambios: registro de altas, modificaciones y borrados (lápidas) que
    //   alimenta la nube y el WiFi directo. `++id` da el orden y el cursor;
    //   `propagar` separa lo nacido aquí (1) de lo aplicado desde fuera (0).
    // - descartes: versión local que pierde un conflicto, para poder recuperarla.
    // - syncMeta: cursores y estado de los transportes.
    this.version(9).stores({
      productos: 'id, nombre, archivado, [archivado+nombre]',
      lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
      ventas: 'id, fecha, anulada, [anulada+fecha]',
      compras: 'id, productoId, fecha, [productoId+fecha]',
      ajustes: 'id, productoId, fecha, [productoId+fecha]',
      arqueos: 'id, fecha',
      movCaja: 'id, fecha, tipo, [tipo+fecha]',
      cierres: 'id, fechaCierre',
      capital: 'id, fecha, socioId',
      retiros: 'id, fecha',
      socios: 'id, nombre, aporte, porcentaje, fecha, activo',
      distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
      gastos: 'id, fecha, categoria, [categoria+fecha]',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
      tgQueue: 'id, estado, ts, motivo',
      config: 'key',
      cambios: '++id, tabla, registroId, [tabla+registroId], ts, propagar',
      descartes: '++id, tabla, registroId, ts',
      syncMeta: 'clave',
    });

    // Version 10: elimina la cola de Telegram (tgQueue). Telegram se retiró
    // el 2026-11-27; la sincronización en la nube (Supabase) y por WiFi, más
    // el backup local, sustituyen el respaldo por Telegram.
    this.version(10).stores({
      productos: 'id, nombre, archivado, [archivado+nombre]',
      lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
      ventas: 'id, fecha, anulada, [anulada+fecha]',
      compras: 'id, productoId, fecha, [productoId+fecha]',
      ajustes: 'id, productoId, fecha, [productoId+fecha]',
      arqueos: 'id, fecha',
      movCaja: 'id, fecha, tipo, [tipo+fecha]',
      cierres: 'id, fechaCierre',
      capital: 'id, fecha, socioId',
      retiros: 'id, fecha',
      socios: 'id, nombre, aporte, porcentaje, fecha, activo',
      distribuciones: 'id, fecha, montoTotal, socioId, monto, concepto',
      gastos: 'id, fecha, categoria, [categoria+fecha]',
      asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber',
      pasivos: 'id, fecha, acreedor, pagado, vencimiento',
      auditorias: 'id, fechaInicio, estado',
      config: 'key',
      cambios: '++id, tabla, registroId, [tabla+registroId], ts, propagar',
      descartes: '++id, tabla, registroId, ts',
      syncMeta: 'clave',
    });
  }
}

export const db = new TiendaProDB();

/** Seguimiento de cambios de la base principal (ver sync/seguimiento.ts). */
export const seguimiento = instalarSeguimiento(db);

// Exponer db en window para debugging (útil con Eruda/F12)
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).db = db;
