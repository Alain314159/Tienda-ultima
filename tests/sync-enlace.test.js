/**
 * Sincronización por un canal (src/sync/enlace.ts) con el protocolo completo y
 * dos bases: dos "dispositivos" unidos por un canal de memoria.
 *
 * Contrato: el vacío recibe todo; la segunda vez viaja solo lo nuevo; lo que
 * llegó de un tercer dispositivo sigue su camino; y un enlace mudo se corta.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { aplicarRemotas } from '../src/sync/motor';
import { sincronizarPorCanal, cursorDe } from '../src/sync/enlace';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

const A = new TiendaProDB('SyncEnlaceA');
const B = new TiendaProDB('SyncEnlaceB');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_aaa' }) };
const ctxB = { db: B, seg: instalarSeguimiento(B, { dispositivo: 'dev_zzz' }) };

/** Dos canales conectados entre sí; la entrega es diferida, como en la red. */
function parDeCanales() {
  const receptores = [[], []];
  const cerrados = [];
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
    cerrar: () => {
      cerrados.push(yo);
    },
  });
  return { a: lado(0), b: lado(1), cerrados };
}

const enlazar = async (opciones) => {
  const { a, b } = parDeCanales();
  const [ra, rb] = await Promise.all([sincronizarPorCanal(ctxA, a, opciones), sincronizarPorCanal(ctxB, b, opciones)]);
  return { ra, rb };
};

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

describe('sincronización por canal', () => {
  it('primer enlace: el vacío recibe todo y guarda hasta dónde le enviaron', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    await A.ventas.put({ id: 'v1', fecha: '2026-11-24', items: [], total: 10, ganancia: 2 });
    const { ra, rb } = await enlazar();
    expect(rb.aplicados).toBe(3);
    expect(rb.enviado).toBe(0);
    expect(rb.tablas.sort()).toEqual(['productos', 'ventas']);
    expect(rb.dispositivoRemoto).toBe('dev_aaa');
    expect(ra.aplicados).toBe(0);
    expect(ra.enviado).toBe(3);
    expect(await B.productos.count()).toBe(2);
    expect(await B.ventas.count()).toBe(1);
    const cursor = await B.syncMeta.get(cursorDe('dev_aaa'));
    expect(cursor.value).toBe(3);
  });

  it('segundo enlace: solo viaja lo nuevo, en lotes confirmados', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await enlazar({ filasPorLote: 2 });
    await B.productos.put({ id: 'p3', nombre: 'Tres' });
    await B.productos.update('p1', { nombre: 'Uno editado' });
    const { ra, rb } = await enlazar({ filasPorLote: 2 });
    expect(rb.enviado).toBe(2);
    expect(rb.aplicados).toBe(0);
    expect(rb.descartes).toBe(0);
    // A no tenía nada nuevo, y lo que acaba de recibir de B no se lo devuelve.
    expect(ra.enviado).toBe(0);
    expect(ra.aplicados).toBe(2);
    expect((await A.productos.get('p1')).nombre).toBe('Uno editado');
    expect((await A.productos.get('p3')).nombre).toBe('Tres');
  });

  it('el punto guardado sirve en los dos sentidos', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await enlazar();
    await B.productos.put({ id: 'p3', nombre: 'Tres' });
    const primera = await enlazar();
    expect(primera.rb.enviado).toBe(1);
    expect(primera.ra.enviado).toBe(0);
    await A.productos.put({ id: 'p9', nombre: 'Nueve' });
    const segunda = await enlazar();
    expect(segunda.ra.enviado).toBe(1);
    expect(segunda.rb.enviado).toBe(0);
    expect((await B.productos.get('p9')).nombre).toBe('Nueve');
  });

  it('lo que llegó del otro no se le devuelve', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    await enlazar();
    // B edita una de las dos filas que recibió: solo eso viaja de vuelta.
    await B.productos.update('p1', { nombre: 'Uno editado en B' });
    const { rb } = await enlazar();
    expect(rb.enviado).toBe(1);
    expect((await A.productos.get('p1')).nombre).toBe('Uno editado en B');
  });

  it('viajan por lotes sin perder ni repetir filas', async () => {
    await A.productos.bulkPut(Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, nombre: `P${i}` })));
    const { rb } = await enlazar({ filasPorLote: 4 });
    expect(rb.aplicados).toBe(25);
    expect(await B.productos.count()).toBe(25);
  });

  it('lo que llegó de un tercer dispositivo sigue hasta el otro teléfono', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await enlazar();
    await aplicarRemotas(
      ctxA,
      [
        {
          tabla: 'productos',
          id: 'de_c',
          datos: { nombre: 'De C' },
          borrado: false,
          ts: Date.now() + 5000,
          dispositivo: 'dev_ccc',
        },
      ],
      'nube'
    );
    const { rb } = await enlazar();
    expect(rb.aplicados).toBe(1);
    expect((await B.productos.get('de_c')).nombre).toBe('De C');
  });

  it('un conflicto deja la versión perdedora guardada en descartes y gana la más nueva', async () => {
    await A.productos.put({ id: 'p1', nombre: 'De A' });
    await new Promise((r) => setTimeout(r, 5));
    await B.productos.put({ id: 'p1', nombre: 'De B' });
    const { ra, rb } = await enlazar();
    expect(ra.descartes + rb.descartes).toBe(1);
    // B escribió después: su versión es la más nueva.
    expect((await A.productos.get('p1')).nombre).toBe('De B');
    expect((await B.productos.get('p1')).nombre).toBe('De B');
    expect((await A.descartes.count()) + (await B.descartes.count())).toBe(1);
  });

  it('avisa del progreso de envío y recepción', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    const vistos = [];
    const { a, b } = parDeCanales();
    await Promise.all([
      sincronizarPorCanal(ctxA, a, { enProgreso: (p) => vistos.push(p) }),
      sincronizarPorCanal(ctxB, b),
    ]);
    const ultimo = vistos.at(-1);
    expect(vistos[0].fase).toBe('conectando');
    expect(ultimo).toMatchObject({ fase: 'enviando', enviadas: 2, porEnviar: 2, porRecibir: 0 });
  });

  it('un enlace mudo se corta en lugar de quedar colgado', async () => {
    const mudo = { abierto: Promise.resolve(), enviar() {}, alRecibir() {}, cerrar() {} };
    await expect(sincronizarPorCanal(ctxA, mudo, { sinActividadMs: 40 })).rejects.toThrow('tiempo-agotado');
  });

  it('mientras el otro no se conecta espera más; conectado, corta antes', async () => {
    const mudo = { abierto: Promise.resolve(), enviar() {}, alRecibir() {}, cerrar() {} };
    const inicio = Date.now();
    await expect(sincronizarPorCanal(ctxA, mudo, { sinActividadMs: 40, esperaConexionMs: 300 })).rejects.toThrow(
      'tiempo-agotado'
    );
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(250);

    // Un canal que solo anuncia quién es y luego calla.
    const soloHola = {
      abierto: Promise.resolve(),
      enviar() {},
      alRecibir(fn) {
        fn(JSON.stringify({ t: 'hola', dispositivo: 'dev_zzz' }));
      },
      cerrar() {},
    };
    const conectado = Date.now();
    await expect(sincronizarPorCanal(ctxA, soloHola, { sinActividadMs: 40, esperaConexionMs: 5000 })).rejects.toThrow(
      'tiempo-agotado'
    );
    expect(Date.now() - conectado).toBeLessThan(2000);
  });
});
