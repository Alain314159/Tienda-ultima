/**
 * Tests de compactar() tras una sync WiFi exitosa (3.5).
 *
 * La tabla `cambios` crecía sin límite porque nadie llamaba a compactar()
 * tras sincronizar por WiFi (la vuelta de nube sí lo hace). Al cerrar una
 * sesión WiFi con éxito, cada teléfono compacta sus cambios hasta el
 * cursor de lo que envió: se borran las entradas sustituidas y queda solo
 * la última por fila.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { sincronizarPorCanal } from '../src/sync/enlace';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

const A = new TiendaProDB('WifiCompactarA');
const B = new TiendaProDB('WifiCompactarB');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_comp_a' }) };
const ctxB = { db: B, seg: instalarSeguimiento(B, { dispositivo: 'dev_comp_b' }) };

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

describe('sync WiFi compacta cambios al terminar', () => {
  it('tras una sync exitosa solo queda la última entrada por fila enviada', async () => {
    // 3 escrituras del mismo producto + 1 de otro: 4 entradas en `cambios`.
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.productos.put({ id: 'p1', nombre: 'Uno v2' });
    await A.productos.put({ id: 'p1', nombre: 'Uno v3' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    expect(await A.cambios.count()).toBe(4);

    const { ra, rb } = await enlazar();
    expect(ra.enviado).toBe(2); // p1 (última versión) + p2
    expect(rb.aplicados).toBe(2);
    expect(await B.productos.get('p1')).toMatchObject({ nombre: 'Uno v3' });

    // Compactado: las 2 entradas sustituidas de p1 ya no están; queda la
    // última de p1 y la de p2.
    expect(await A.cambios.count()).toBe(2);
    const restantes = await A.cambios.toArray();
    expect(restantes.map((c) => c.registroId).sort()).toEqual(['p1', 'p2']);
  });

  it('una sync sin nada nuevo no borra el último cambio de cada fila', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await enlazar();
    expect(await A.cambios.count()).toBe(1);

    // Segunda sync: no hay nada nuevo que enviar, pero la entrada que
    // queda es la última de su fila y debe sobrevivir a compactar.
    await enlazar();
    expect(await A.cambios.count()).toBe(1);
    expect(await B.productos.get('p1')).toMatchObject({ nombre: 'Uno' });
  });
});
