/**
 * Tests de la composición del esquema Dexie (4.5, src/db.ts).
 *
 * El esquema por versión se compone como base + overrides; el esquema
 * EFECTIVO de cada versión debe ser idéntico al que había antes de la
 * composición. Los literales de aquí son la transcripción exacta del
 * db.ts anterior (commit ee9f469): si la composición cambia un índice o
 * una tabla en cualquier versión, este test lo caza.
 *
 * Además se verifica la forma de la base migrada: versión 10, tablas
 * de la v10 presentes y tgQueue ausente (eliminada en la v10).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { db, ESQUEMAS_POR_VERSION } from '../src/db';

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

const ESPERADO = { 1: V1, 2: V2, 3: V3, 4: V4, 5: V5, 6: V6, 7: V7, 8: V8, 9: V9, 10: V10 };

describe('ESQUEMAS_POR_VERSION: el esquema efectivo no cambió', () => {
  it('las 10 versiones existen y coinciden con el esquema literal anterior', () => {
    expect(Object.keys(ESQUEMAS_POR_VERSION).map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const [v, esquema] of Object.entries(ESPERADO)) {
      expect(ESQUEMAS_POR_VERSION[Number(v)]).toEqual(esquema);
    }
  });

  it('cada versión solo añade/cambia respecto a la anterior (ninguna tabla se pierde)', () => {
    for (let v = 2; v <= 10; v++) {
      const anterior = ESQUEMAS_POR_VERSION[v - 1];
      const actual = ESQUEMAS_POR_VERSION[v];
      for (const tabla of Object.keys(anterior)) {
        // La única tabla que una versión posterior puede quitar es tgQueue
        // en la v10 (Telegram retirado); el resto se hereda (la v6 cambia
        // los ÍNDICES de varias tablas, pero ninguna tabla desaparece).
        if (v === 10 && tabla === 'tgQueue') continue;
        expect(actual[tabla], `v${v} pierde la tabla ${tabla}`).toBeDefined();
      }
    }
    expect(ESQUEMAS_POR_VERSION[10].tgQueue).toBeUndefined();
    expect(ESQUEMAS_POR_VERSION[9].tgQueue).toBe('id, estado, ts, motivo');
  });
});

describe('base migrada a v10', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('la base abre en versión 10 con los stores de la v10', async () => {
    expect(db.verno).toBe(10);
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
    // QUIRK PREEXISTENTE (verificado idéntico con el db.ts de HEAD): la
    // v10 "elimina" tgQueue omitiéndola del esquema, pero en Dexie omitir
    // una tabla NO la borra — para borrarla haría falta `tgQueue: null`
    // explícito. El store vacío sigue ahí; la composición no lo introdujo
    // ni lo quita (cambiarlo alteraría el esquema efectivo de la v10).
    expect(stores).toContain('tgQueue');
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
