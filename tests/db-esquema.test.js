/**
 * Tests de la composición del esquema Dexie (4.5, src/db.ts).
 *
 * El esquema por versión se compone como base + overrides; el esquema
 * EFECTIVO de cada versión debe ser idéntico al que había antes de la
 * composición. Los literales de aquí son la transcripción exacta del
 * db.ts anterior (commit ee9f469): si la composición cambia un índice o
 * una tabla en cualquier versión, este test lo caza.
 *
 * Además se verifica la forma de la base migrada: versión 11, tablas
 * de la v11 presentes y tgQueue ausente (borrada de verdad en la v11
 * con `tgQueue: null`; la v10 solo la había omitido del esquema).
 * Y la migración real v10→v11: una base v10 con el store tgQueue
 * (heredado de la v7-v9) queda sin ese store y sus datos sobreviven.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

import { db, ESQUEMAS_POR_VERSION, TiendaProDB } from '../src/db';

const V1 = {
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

const V2 = { ...V1, gastos: 'id, fecha, categoria' };

const V3 = { ...V2, asientos: 'id, fecha, refTipo, refId, cuentaDebe, cuentaHaber' };

const V4 = { ...V3, pasivos: 'id, fecha, acreedor, pagado, vencimiento' };

const V5 = { ...V4, auditorias: 'id, fechaInicio, estado' };

const V6 = {
  ...V5,
  productos: 'id, nombre, archivado, [archivado+nombre]',
  lotes: 'id, productoId, compraId, fecha, [productoId+fecha]',
  ventas: 'id, fecha, anulada, [anulada+fecha]',
  compras: 'id, productoId, fecha, [productoId+fecha]',
  ajustes: 'id, productoId, fecha, [productoId+fecha]',
  movCaja: 'id, fecha, tipo, [tipo+fecha]',
  capital: 'id, fecha, socioId',
  gastos: 'id, fecha, categoria, [categoria+fecha]',
};

const V7 = { ...V6, tgQueue: 'id, estado, ts' };

const V8 = { ...V7, tgQueue: 'id, estado, ts, motivo' };

const V9 = {
  ...V8,
  cambios: '++id, tabla, registroId, [tabla+registroId], ts, propagar',
  descartes: '++id, tabla, registroId, ts',
  syncMeta: 'clave',
};

const { tgQueue: _tgQueue, ...V10 } = V9;

// v11: igual que la v10 pero con `tgQueue: null`, que borra el store.
const V11 = { ...V10, tgQueue: null };

const ESPERADO = { 1: V1, 2: V2, 3: V3, 4: V4, 5: V5, 6: V6, 7: V7, 8: V8, 9: V9, 10: V10, 11: V11 };

describe('ESQUEMAS_POR_VERSION: el esquema efectivo no cambió', () => {
  it('las 11 versiones existen y coinciden con el esquema literal anterior', () => {
    expect(Object.keys(ESQUEMAS_POR_VERSION).map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    for (const [v, esquema] of Object.entries(ESPERADO)) {
      expect(ESQUEMAS_POR_VERSION[Number(v)]).toEqual(esquema);
    }
  });

  it('cada versión solo añade/cambia respecto a la anterior (ninguna tabla se pierde)', () => {
    for (let v = 2; v <= 11; v++) {
      const anterior = ESQUEMAS_POR_VERSION[v - 1];
      const actual = ESQUEMAS_POR_VERSION[v];
      for (const tabla of Object.keys(anterior)) {
        // La única tabla que una versión posterior puede quitar es tgQueue:
        // omitida en la v10 (Telegram retirado) y borrada con `null` en
        // la v11; el resto se hereda (la v6 cambia los ÍNDICES de varias
        // tablas, pero ninguna tabla desaparece).
        if (v === 10 && tabla === 'tgQueue') continue;
        expect(actual[tabla], `v${v} pierde la tabla ${tabla}`).toBeDefined();
      }
    }
    expect(ESQUEMAS_POR_VERSION[10].tgQueue).toBeUndefined();
    expect(ESQUEMAS_POR_VERSION[11].tgQueue).toBeNull();
    expect(ESQUEMAS_POR_VERSION[9].tgQueue).toBe('id, estado, ts, motivo');
    // La v11 no toca nada más: es la v10 + `tgQueue: null`.
    expect(ESQUEMAS_POR_VERSION[11]).toEqual({ ...ESQUEMAS_POR_VERSION[10], tgQueue: null });
  });
});

describe('base migrada a v11', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('la base abre en versión 11 con los stores de la v11', async () => {
    expect(db.verno).toBe(11);
    // db.tables incluye los objetos Table de TODAS las versiones (Dexie
    // los conserva aunque el store ya no exista): lo que decide es la
    // lista de object stores real de la base abierta.
    const stores = Array.from(db.backendDB().objectStoreNames).sort();
    for (const tabla of [
      'ajustes',
      'arqueos',
      'asientos',
      'auditorias',
      'cambios',
      'capital',
      'cierres',
      'compras',
      'config',
      'descartes',
      'distribuciones',
      'gastos',
      'lotes',
      'movCaja',
      'pasivos',
      'productos',
      'retiros',
      'socios',
      'syncMeta',
      'ventas',
    ]) {
      expect(stores).toContain(tabla);
    }
    // La v11 borra tgQueue de verdad con `tgQueue: null`: la v10 solo la
    // omitió del esquema y el store vacío seguía existiendo (en Dexie
    // omitir una tabla no la borra).
    expect(stores).not.toContain('tgQueue');
  });

  it('los índices compuestos de la v6 están declarados en el esquema', async () => {
    const indicesVentas = db.ventas.schema.indexes.map((i) => i.name);
    expect(indicesVentas).toContain('[anulada+fecha]');
    const indicesProductos = db.productos.schema.indexes.map((i) => i.name);
    expect(indicesProductos).toContain('[archivado+nombre]');
    const indicesCambios = db.cambios.schema.indexes.map((i) => i.name);
    expect(indicesCambios).toContain('[tabla+registroId]');
    // La tabla de sync existe y acepta escrituras con id autoincremental.
    const id = await db.cambios.add({ tabla: 'ventas', registroId: 'v1', ts: 1, propagar: 1 });
    expect(typeof id).toBe('number');
    await db.cambios.clear();
  });
});

describe('migración v10 → v11: tgQueue se borra de verdad', () => {
  const NOMBRE = 'TiendaProDB-migracion-v10-v11';
  let v10;
  let v11;

  async function borrarBase() {
    for (const instancia of [v10, v11]) {
      if (instancia) {
        try {
          await instancia.close();
        } catch {
          // Ya cerrada: no pasa nada.
        }
      }
    }
    v10 = undefined;
    v11 = undefined;
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(NOMBRE);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('deleteDatabase bloqueado'));
    });
  }

  afterEach(async () => {
    await borrarBase();
  });

  it('una base v10 con el store tgQueue queda sin ese store tras abrir con v11 y los datos sobreviven', async () => {
    // 1. Base como la deja una v10 real: esquema v10 + store tgQueue
    // heredado de la v7-v9 (la v10 lo omitió del esquema pero no lo borró).
    v10 = new Dexie(NOMBRE);
    v10.version(10).stores({ ...ESQUEMAS_POR_VERSION[10], tgQueue: 'id, estado, ts, motivo' });
    await v10.open();
    expect(v10.verno).toBe(10);
    expect(Array.from(v10.backendDB().objectStoreNames)).toContain('tgQueue');
    await v10.table('productos').add({ id: 'p1', nombre: 'Leche', precio: 10, archivado: false });
    await v10.table('ventas').add({
      id: 'v1',
      fecha: '2026-11-01T10:00:00.000Z',
      total: 250,
      anulada: false,
    });
    await v10.table('tgQueue').add({ id: 'q1', estado: 'pendiente', ts: 1, motivo: 'auto' });
    await v10.close();

    // 2. Abrir con el esquema actual (v11): Dexie migra 10→11 y el
    // `tgQueue: null` borra el object store.
    v11 = new TiendaProDB(NOMBRE);
    await v11.open();
    expect(v11.verno).toBe(11);
    expect(Array.from(v11.backendDB().objectStoreNames)).not.toContain('tgQueue');

    // 3. Los datos de las demás tablas sobreviven intactos.
    expect(await v11.productos.get('p1')).toMatchObject({ nombre: 'Leche', precio: 10 });
    expect(await v11.ventas.get('v1')).toMatchObject({ total: 250 });
  });
});
