/**
 * Seguimiento de cambios (src/sync/seguimiento.ts).
 *
 * Contrato:
 * - toda escritura en una tabla sincronizable deja su entrada en `cambios`,
 *   también dentro de una transacción explícita y en operaciones masivas;
 * - un borrado (delete, clear) deja lápida; config y asientos no se registran;
 * - la marca lógica es estrictamente creciente y salta por encima de cualquier
 *   marca remota vista.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { db, seguimiento, TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';

// En orden: primero se vacían los datos (los borrados dejan lápidas) y al final
// el registro, para que no quede ninguna entrada de la prueba anterior.
const limpiar = async () => {
  await db.productos.clear();
  await db.config.clear();
  await db.asientos.clear();
  await db.cambios.clear();
  await db.descartes.clear();
};

beforeEach(limpiar);

describe('seguimiento de cambios', () => {
  it('registra un alta con tabla, fila, marca y dispositivo', async () => {
    await db.productos.put({ id: 'prod_1', nombre: 'Arroz' });
    const cambios = await db.cambios.toArray();
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ tabla: 'productos', registroId: 'prod_1', tipo: 'put', propagar: 1 });
    expect(cambios[0].ts).toBeGreaterThan(0);
    expect(cambios[0].dispositivo).toMatch(/^dev_/);
  });

  it('registra la modificación y el borrado, y el borrado deja lápida', async () => {
    await db.productos.put({ id: 'prod_1', nombre: 'Arroz' });
    await db.productos.put({ id: 'prod_1', nombre: 'Arroz 2' });
    await db.productos.update('prod_1', { nombre: 'Arroz 3' });
    await db.productos.delete('prod_1');
    const tipos = (await db.cambios.toArray()).map((c) => c.tipo);
    expect(tipos).toEqual(['put', 'put', 'put', 'delete']);
    expect(await db.productos.get('prod_1')).toBeUndefined();
  });

  it('las marcas son estrictamente crecientes aunque las escrituras sean seguidas', async () => {
    for (let i = 0; i < 5; i++) await db.productos.put({ id: `prod_${i}`, nombre: `P${i}` });
    const marcas = (await db.cambios.toArray()).map((c) => c.ts);
    for (let i = 1; i < marcas.length; i++) expect(marcas[i]).toBeGreaterThan(marcas[i - 1]);
    expect(marcas[0]).toBeGreaterThan(Date.now() - 60_000);
  });

  it('clear() deja una lápida por fila y bulkPut registra cada fila', async () => {
    await db.productos.bulkPut([{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }, { id: 'c', nombre: 'C' }]);
    await db.productos.clear();
    const cambios = await db.cambios.toArray();
    const altas = cambios.filter((c) => c.tipo === 'put');
    const lapidas = cambios
      .filter((c) => c.tipo === 'delete')
      .map((c) => c.registroId)
      .sort();
    expect(altas).toHaveLength(3);
    expect(lapidas).toEqual(['a', 'b', 'c']);
  });

  it('no registra tablas que no viajan', async () => {
    await db.config.put({ key: 'tema', value: 'dark' });
    await db.asientos.put({ id: 'as_1', fecha: '2026-11-24' });
    expect(await db.cambios.count()).toBe(0);
  });

  it('funciona igual dentro de una transacción explícita', async () => {
    await db.transaction('rw', [db.productos], () => db.productos.put({ id: 'prod_t', nombre: 'x' }));
    const cambios = await db.cambios.toArray();
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ tabla: 'productos', registroId: 'prod_t', tipo: 'put' });
  });

  it('ver() obliga a la siguiente marca a superar la remota', async () => {
    const futuro = Date.now() + 3_600_000;
    seguimiento.ver(futuro);
    await db.productos.put({ id: 'prod_f', nombre: 'f' });
    const cambios = await db.cambios.toArray();
    expect(cambios.at(-1).ts).toBe(futuro + 1);
  });

  it('sinRegistrar aplica sin dejar entrada propia', async () => {
    await seguimiento.sinRegistrar(() => db.productos.put({ id: 'prod_r', nombre: 'r' }));
    expect(await db.productos.get('prod_r')).toBeTruthy();
    expect(await db.cambios.count()).toBe(0);
  });

  it('ultima() devuelve la entrada más reciente y compactar() deja una por fila', async () => {
    await db.productos.put({ id: 'prod_1', nombre: 'a' });
    await db.productos.put({ id: 'prod_1', nombre: 'b' });
    await db.productos.put({ id: 'prod_2', nombre: 'c' });
    await db.productos.put({ id: 'prod_1', nombre: 'd' });
    expect(await db.cambios.count()).toBe(4);
    expect((await seguimiento.ultima('productos', 'prod_1')).ts).toBeGreaterThan(0);
    const quitadas = await seguimiento.compactar(Infinity);
    expect(quitadas).toBe(2);
    expect(await db.cambios.count()).toBe(2);
    expect(await seguimiento.ultima('productos', 'prod_1')).toBeTruthy();
    expect(await seguimiento.ultima('productos', 'prod_2')).toBeTruthy();
  });

  it('el identificador de dispositivo es estable y puede fijarse', async () => {
    const otra = new TiendaProDB('SyncPruebaIds');
    const fija = new TiendaProDB('SyncPruebaIdsFija');
    try {
      expect(instalarSeguimiento(otra).idDispositivo).toBe(instalarSeguimiento(otra).idDispositivo);
      expect(instalarSeguimiento(fija, { dispositivo: 'dev_prueba' }).idDispositivo).toBe('dev_prueba');
    } finally {
      await Promise.allSettled([otra.delete(), fija.delete()]);
    }
  });
});
