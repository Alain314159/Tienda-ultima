/**
 * Motor de sincronización (src/sync/motor.ts) con dos bases: dos "dispositivos".
 *
 * Contrato: nada se pierde. Lo más nuevo gana; lo que pierde se guarda en
 * `descartes`; un borrado solo se aplica si es más nuevo que el último cambio
 * local; una copia de edad desconocida (marca 0) nunca pisa un cambio real; y
 * lo aplicado desde fuera no se vuelve a enviar (sin rebote).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import {
  aplicarRemotas,
  ganaRemoto,
  mismoContenido,
  obtenerCambiosDesde,
  obtenerEstadoCompleto,
} from '../src/sync/motor';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

const A = new TiendaProDB('SyncMotorA');
const B = new TiendaProDB('SyncMotorB');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_aaa' }) };
const ctxB = { db: B, seg: instalarSeguimiento(B, { dispositivo: 'dev_zzz' }) };

// En orden: primero los datos (los borrados dejan lápidas) y al final el registro.
const limpiar = async (ctx) => {
  for (const t of TABLAS_SINCRONIZABLES) await ctx.db.table(t).clear();
  await ctx.db.cambios.clear();
  await ctx.db.descartes.clear();
};

const pausa = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => Promise.all([limpiar(ctxA), limpiar(ctxB)]));
afterAll(async () => {
  await A.delete();
  await B.delete();
});

describe('ganaRemoto / mismoContenido', () => {
  it('manda la marca y, en empate, el dispositivo mayor', () => {
    expect(ganaRemoto(2, 'a', 1, 'z')).toBe(true);
    expect(ganaRemoto(1, 'z', 2, 'a')).toBe(false);
    expect(ganaRemoto(5, 'b', 5, 'a')).toBe(true);
    expect(ganaRemoto(5, 'a', 5, 'b')).toBe(false);
  });

  it('compara contenido sin depender del orden de claves', () => {
    expect(mismoContenido({ id: 'x', nombre: 'A', n: 1 }, { n: 1, nombre: 'A', id: 'x' })).toBe(true);
    expect(mismoContenido({ id: 'x', n: 1 }, { id: 'x', n: 2 })).toBe(false);
  });
});

describe('motor de sincronización', () => {
  it('el estado completo lleva lo anterior al seguimiento con marca 0, lo seguido con su marca y las lápidas', async () => {
    await ctxA.seg.sinRegistrar(() => A.productos.put({ id: 'p_vieja', nombre: 'Vieja' }));
    await A.productos.put({ id: 'p_nueva', nombre: 'Nueva' });
    await A.productos.put({ id: 'p_borrada', nombre: 'Borrada' });
    await A.productos.delete('p_borrada');
    const filas = await obtenerEstadoCompleto(ctxA);
    const porId = Object.fromEntries(filas.map((f) => [f.id, f]));
    expect(porId.p_vieja.ts).toBe(0);
    expect(porId.p_nueva.ts).toBeGreaterThan(0);
    expect(porId.p_borrada.borrado).toBe(true);
    expect(filas).toHaveLength(3);
  });

  it('primera unión: el dispositivo vacío recibe todo y no lo devuelve', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.ventas.put({ id: 'v1', fecha: '2026-11-24', items: [], total: 10, ganancia: 2 });
    const res = await aplicarRemotas(ctxB, await obtenerEstadoCompleto(ctxA), 'prueba');
    expect(res).toMatchObject({ aplicados: 2, descartes: 0 });
    expect((await B.productos.get('p1')).nombre).toBe('Uno');
    expect(await B.ventas.get('v1')).toBeTruthy();
    expect(res.tablas.sort()).toEqual(['productos', 'ventas']);
    // Lo recibido vuelve a viajar (lo necesita un tercer dispositivo), pero al
    // llegar a quien ya lo tenía no cambia nada.
    const eco = await obtenerCambiosDesde(ctxB, 0);
    expect(eco.filas).toHaveLength(2);
    expect(await aplicarRemotas(ctxA, eco.filas, 'wifi')).toMatchObject({ aplicados: 0, descartes: 0 });
  });

  it('una copia antigua (marca 0) nunca pisa un cambio real', async () => {
    await B.productos.put({ id: 'p1', nombre: 'Nueva' });
    await ctxA.seg.sinRegistrar(() => A.productos.put({ id: 'p1', nombre: 'Vieja' }));
    const haciaB = await aplicarRemotas(ctxB, await obtenerEstadoCompleto(ctxA), 'prueba');
    expect(haciaB).toMatchObject({ aplicados: 0, descartes: 0 });
    expect((await B.productos.get('p1')).nombre).toBe('Nueva');
    const haciaA = await aplicarRemotas(ctxA, await obtenerEstadoCompleto(ctxB), 'prueba');
    expect(haciaA).toMatchObject({ aplicados: 1, descartes: 1 });
    expect((await A.productos.get('p1')).nombre).toBe('Nueva');
    const guardado = await A.descartes.toArray();
    expect(guardado).toHaveLength(1);
    expect(guardado[0].datos.nombre).toBe('Vieja');
    expect(guardado[0].motivo).toBe('reemplazado');
  });

  it('gana el cambio más nuevo y el perdedor queda guardado', async () => {
    await A.productos.put({ id: 'p1', nombre: 'De A' });
    await pausa();
    await B.productos.put({ id: 'p1', nombre: 'De B' });
    const enB = await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    expect(enB).toMatchObject({ aplicados: 0, descartes: 0 });
    expect((await B.productos.get('p1')).nombre).toBe('De B');
    const enA = await aplicarRemotas(ctxA, (await obtenerCambiosDesde(ctxB, 0)).filas, 'wifi');
    expect(enA).toMatchObject({ aplicados: 1, descartes: 1 });
    expect((await A.productos.get('p1')).nombre).toBe('De B');
    expect((await A.descartes.toArray())[0].datos.nombre).toBe('De A');
  });

  it('un borrado solo se aplica si es más nuevo que el último cambio local', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    await A.productos.delete('p1');
    const res = await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    expect(res).toMatchObject({ aplicados: 1, descartes: 1 });
    expect(await B.productos.get('p1')).toBeUndefined();
    expect((await B.descartes.toArray())[0].motivo).toBe('borrado-remoto');

    // Un borrado viejo no pisa una edición local hecha después.
    await B.productos.put({ id: 'p2', nombre: 'Dos' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    await pausa();
    await A.productos.delete('p2');
    await pausa();
    await B.productos.update('p2', { nombre: 'Dos editado' });
    const viejo = await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    expect(viejo.aplicados).toBe(0);
    expect((await B.productos.get('p2')).nombre).toBe('Dos editado');
  });

  it('una edición local hecha después de recibir un cambio del futuro lo gana', async () => {
    const futuro = Date.now() + 86_400_000;
    await B.productos.put({ id: 'f1', nombre: 'Antes' });
    const res = await aplicarRemotas(
      ctxB,
      [{ tabla: 'productos', id: 'f1', datos: { nombre: 'Remoto' }, borrado: false, ts: futuro, dispositivo: 'dev_otro' }],
      'nube'
    );
    expect(res.aplicados).toBe(1);
    await B.productos.update('f1', { nombre: 'Local después' });
    const { filas } = await obtenerCambiosDesde(ctxB, 0);
    expect(filas).toHaveLength(1);
    expect(filas[0].ts).toBeGreaterThan(futuro);
  });

  it('una lápida recibida impide que resucite una copia vieja llegada después', async () => {
    const lapida = await aplicarRemotas(
      ctxB,
      [{ tabla: 'productos', id: 'f1', datos: null, borrado: true, ts: 5000, dispositivo: 'dev_x' }],
      'nube'
    );
    expect(lapida.aplicados).toBe(0);
    const vieja = await aplicarRemotas(
      ctxB,
      [{ tabla: 'productos', id: 'f1', datos: { nombre: 'Copión' }, borrado: false, ts: 4000, dispositivo: 'dev_y' }],
      'wifi'
    );
    expect(vieja.aplicados).toBe(0);
    expect(await B.productos.get('f1')).toBeUndefined();
  });

  it('el envío incremental devuelve solo lo posterior al cursor y repetir no cambia nada', async () => {
    await B.productos.put({ id: 'a', nombre: 'A' });
    const c1 = await obtenerCambiosDesde(ctxB, 0);
    expect(c1.filas.map((f) => f.id)).toEqual(['a']);
    await B.productos.put({ id: 'b', nombre: 'B' });
    const c2 = await obtenerCambiosDesde(ctxB, c1.hasta);
    expect(c2.filas.map((f) => f.id)).toEqual(['b']);
    expect(c2.hasta).toBeGreaterThan(c1.hasta);
    const primera = await aplicarRemotas(ctxA, c2.filas, 'wifi');
    const segunda = await aplicarRemotas(ctxA, c2.filas, 'wifi');
    expect(primera.aplicados).toBe(1);
    expect(segunda).toMatchObject({ aplicados: 0, descartes: 0 });
  });

  it('filas idénticas no generan descartes y las tablas que no viajan se ignoran', async () => {
    await A.productos.put({ id: 'x', nombre: 'Igual' });
    await ctxB.seg.sinRegistrar(() => B.productos.put({ id: 'x', nombre: 'Igual' }));
    const res = await aplicarRemotas(ctxB, await obtenerEstadoCompleto(ctxA), 'wifi');
    expect(res).toMatchObject({ aplicados: 0, descartes: 0 });
    const ajena = await aplicarRemotas(
      ctxA,
      [{ tabla: 'config', id: 'tema', datos: { a: 1 }, borrado: false, ts: 1, dispositivo: 'd' }],
      'wifi'
    );
    expect(ajena.ignorados).toBe(1);
  });

  it('varios ciclos en ambos sentidos convergen', async () => {
    await A.productos.put({ id: 'r', nombre: 'v1' });
    await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    await pausa();
    await B.productos.update('r', { nombre: 'v2' });
    await aplicarRemotas(ctxA, (await obtenerCambiosDesde(ctxB, 0)).filas, 'wifi');
    expect((await A.productos.get('r')).nombre).toBe('v2');
    await A.productos.delete('r');
    await aplicarRemotas(ctxB, (await obtenerCambiosDesde(ctxA, 0)).filas, 'wifi');
    expect(await B.productos.get('r')).toBeUndefined();
    expect((await obtenerEstadoCompleto(ctxA)).filter((f) => !f.borrado)).toHaveLength(0);
    expect((await obtenerEstadoCompleto(ctxB)).filter((f) => !f.borrado)).toHaveLength(0);
  });
});
