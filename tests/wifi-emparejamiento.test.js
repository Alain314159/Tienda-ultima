/**
 * Tests de autenticación de emparejamiento WiFi (1.7).
 *
 * El creador del enlace muestra un código de 6 dígitos; quien se une debe
 * escribirlo. Sin el código (o con uno incorrecto) no se intercambia ningún
 * dato: la sesión se rechaza antes del primer `hola`.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { sincronizarPorCanal } from '../src/sync/enlace';
import { generarCodigoEmparejamiento } from '../src/sync/webrtc';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

const A = new TiendaProDB('WifiAuthA');
const B = new TiendaProDB('WifiAuthB');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_aaa' }) };
const ctxB = { db: B, seg: instalarSeguimiento(B, { dispositivo: 'dev_zzz' }) };

/** Dos canales conectados entre sí; la entrega es diferida, como en la red. */
function parDeCanales() {
  const receptores = [[], []];
  const lado = (yo) => ({
    abierto: Promise.resolve(),
    enviar: (texto) => {
      setTimeout(() => {
        for (const f of receptores[1 - yo]) f(texto);
      }, 0);
    },
    alRecibir: (fn) => {
      receptores[yo].push(fn);
    },
    cerrar: () => {},
  });
  return { a: lado(0), b: lado(1) };
}

const limpiar = async (ctx) => {
  for (const t of TABLAS_SINCRONIZABLES) await ctx.db.table(t).clear();
  await ctx.db.cambios.clear();
  await ctx.db.descartes.clear();
  await ctx.db.syncMeta.clear();
};

beforeEach(() => Promise.all([limpiar(ctxA), limpiar(ctxB)]));
afterAll(async () => {
  await A.delete();
  await B.delete();
});

describe('generarCodigoEmparejamiento', () => {
  it('genera 6 dígitos (100000–999999) y varía entre llamadas', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => generarCodigoEmparejamiento()));
    for (const c of codigos) expect(c).toMatch(/^[1-9]\d{5}$/);
    expect(codigos.size).toBeGreaterThan(10);
  });
});

describe('sincronizarPorCanal con autenticación', () => {
  it('con el código correcto la sync funciona igual que antes', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    const { a, b } = parDeCanales();
    const codigo = '123456';
    const [ra, rb] = await Promise.all([
      sincronizarPorCanal(ctxA, a, { auth: { esperado: codigo } }),
      sincronizarPorCanal(ctxB, b, { auth: { enviar: codigo } }),
    ]);
    expect(rb.aplicados).toBe(1);
    expect(ra.enviado).toBe(1);
    expect(await B.productos.count()).toBe(1);
  });

  it('con el código incorrecto no viaja ningún dato y la sesión falla', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    const { a, b } = parDeCanales();
    await expect(
      Promise.all([
        sincronizarPorCanal(ctxA, a, { auth: { esperado: '123456' }, sinActividadMs: 500 }),
        sincronizarPorCanal(ctxB, b, { auth: { enviar: '999999' }, sinActividadMs: 500 }),
      ])
    ).rejects.toThrow('codigo-emparejamiento-incorrecto');
    expect(await B.productos.count()).toBe(0);
    expect(await A.productos.count()).toBe(1);
  });

  it('si un lado no se autentica, el otro no le envía nada', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    const { a, b } = parDeCanales();
    // B (sin auth) saluda directamente; A (creador) lo ignora hasta autenticar
    // y la sesión muere por tiempo agotado sin intercambiar datos.
    await expect(
      Promise.all([
        sincronizarPorCanal(ctxA, a, { auth: { esperado: '123456' }, sinActividadMs: 300, esperaConexionMs: 300 }),
        sincronizarPorCanal(ctxB, b, { sinActividadMs: 300, esperaConexionMs: 300 }),
      ])
    ).rejects.toThrow();
    expect(await B.productos.count()).toBe(0);
  });
});
