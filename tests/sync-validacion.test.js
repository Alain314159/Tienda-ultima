/**
 * Tests de validación de contenido en sync (1.8).
 *
 * Cada fila remota se valida antes de aplicarse (montos finitos y >= 0
 * donde aplica, fechas en rango 2000–2100, ids válidos, marca temporal no
 * futura). Lo inválido se descarta a `descartes` con motivo
 * 'remoto-invalido' en vez de aplicarse, y no se ofrece para restaurar.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { aplicarRemotas, validarFilaRemota } from '../src/sync/motor';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

const A = new TiendaProDB('SyncValidacionA');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_aaa' }) };

const limpiar = async (ctx) => {
  for (const t of TABLAS_SINCRONIZABLES) await ctx.db.table(t).clear();
  await ctx.db.cambios.clear();
  await ctx.db.descartes.clear();
  await ctx.db.syncMeta.clear();
};

beforeEach(() => limpiar(ctxA));
afterAll(async () => {
  await A.delete();
});

const fila = (tabla, id, datos, extra = {}) => ({
  tabla,
  id,
  datos,
  borrado: false,
  ts: 1000,
  dispositivo: 'dev_zzz',
  ...extra,
});

describe('validarFilaRemota', () => {
  it('acepta una fila válida', () => {
    expect(
      validarFilaRemota(
        fila('ventas', 'v1', {
          fecha: '2026-11-27T12:00:00.000Z',
          total: 100,
          ganancia: 20,
          items: [{ nombre: 'Arroz', precio: 100, cantidad: 1, costo: 80 }],
        })
      )
    ).toBe(null);
  });

  it('rechaza montos negativos y no finitos', () => {
    expect(validarFilaRemota(fila('ventas', 'v1', { fecha: '2026-11-27', total: -5, items: [] }))).toMatch(
      /monto/
    );
    expect(
      validarFilaRemota(fila('ventas', 'v1', { fecha: '2026-11-27', total: Infinity, items: [] }))
    ).toMatch(/monto/);
    expect(validarFilaRemota(fila('gastos', 'g1', { fecha: '2026-11-27', monto: -1 }))).toMatch(/monto/);
    expect(
      validarFilaRemota(fila('ventas', 'v1', {
        fecha: '2026-11-27',
        total: 10,
        items: [{ nombre: 'X', precio: -1, cantidad: 1, costo: 1 }],
      }))
    ).toMatch(/ítem/);
  });

  it('rechaza fechas inválidas o fuera de rango', () => {
    expect(validarFilaRemota(fila('ventas', 'v1', { fecha: 'basura', total: 10, items: [] }))).toMatch(
      /fecha/
    );
    expect(validarFilaRemota(fila('ventas', 'v1', { fecha: '9999-01-01', total: 10, items: [] }))).toMatch(
      /fecha/
    );
    expect(validarFilaRemota(fila('ventas', 'v1', { fecha: '1969-01-01', total: 10, items: [] }))).toMatch(
      /fecha/
    );
  });

  it('rechaza id vacío, marca temporal futura o negativa', () => {
    expect(validarFilaRemota(fila('productos', '', { nombre: 'X' }))).toMatch(/id/);
    expect(
      validarFilaRemota(fila('productos', 'p1', { nombre: 'X' }, { ts: Date.now() + 48 * 3600_000 }))
    ).toMatch(/futuro/);
    expect(validarFilaRemota(fila('productos', 'p1', { nombre: 'X' }, { ts: -5 }))).toMatch(
      /marca temporal/
    );
  });

  it('una lápida solo necesita tabla, id y marca válidos', () => {
    expect(validarFilaRemota(fila('productos', 'p1', null, { borrado: true, ts: 500 }))).toBe(null);
    expect(validarFilaRemota(fila('productos', 'p1', null, { borrado: true, ts: -1 }))).toMatch(
      /marca temporal/
    );
  });

  it('rechaza porcentaje fuera de 0–100 y nombre vacío', () => {
    expect(validarFilaRemota(fila('socios', 's1', { nombre: 'Ana', porcentaje: 150, aporte: 10 }))).toMatch(
      /porcentaje/
    );
    expect(validarFilaRemota(fila('productos', 'p1', { nombre: '   ' }))).toMatch(/nombre/);
  });
});

describe('aplicarRemotas descarta lo inválido', () => {
  it('una venta con total negativo no se aplica y queda en descartes', async () => {
    const r = await aplicarRemotas(ctxA, [fila('ventas', 'v1', { fecha: '2026-11-27', total: -50, items: [] })], 'nube');
    expect(r.aplicados).toBe(0);
    expect(r.descartes).toBe(1);
    expect(await A.ventas.count()).toBe(0);
    const d = await A.descartes.toArray();
    expect(d).toHaveLength(1);
    expect(d[0].motivo).toBe('remoto-invalido');
    expect(d[0].tabla).toBe('ventas');
  });

  it('una fila válida se aplica y una inválida del mismo lote no', async () => {
    const r = await aplicarRemotas(
      ctxA,
      [
        fila('productos', 'p1', { nombre: 'Arroz', precio: 10 }),
        fila('productos', 'p2', { nombre: 'Café', precio: -3 }),
        fila('gastos', 'g1', { fecha: '2026-11-27', monto: 5 }),
      ],
      'nube'
    );
    expect(r.aplicados).toBe(2);
    expect(r.descartes).toBe(1);
    expect(await A.productos.get('p1')).toBeTruthy();
    expect(await A.productos.get('p2')).toBeUndefined();
    expect(await A.gastos.get('g1')).toBeTruthy();
  });

  it('una lápida con ts futuro no borra la fila local', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Arroz' });
    const r = await aplicarRemotas(
      ctxA,
      [fila('productos', 'p1', null, { borrado: true, ts: Date.now() + 48 * 3600_000 })],
      'nube'
    );
    expect(r.aplicados).toBe(0);
    expect(r.descartes).toBe(1);
    expect(await A.productos.get('p1')).toBeTruthy();
  });
});
