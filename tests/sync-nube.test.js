/**
 * Sincronización con la nube (src/sync/nube.ts) sobre el motor común.
 *
 * Contrato: lo de un teléfono llega a los demás de la misma cuenta; lo que bajó
 * de la nube no vuelve a subir; sin conexión gana lo más nuevo en todos y la
 * versión que pierde queda en `descartes`; los borrados viajan; otra cuenta no
 * ve nada; y lo recibido por WiFi sigue hasta la nube.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { sincronizarNube } from '../src/sync/nube';
import { sincronizarPorCanal } from '../src/sync/enlace';
import { TABLAS_SINCRONIZABLES } from '../src/sync/tipos';

/** Nube en memoria con la misma regla que el SQL: gana (ts, dispositivo) mayor. */
function nubeFalsa() {
  const porCuenta = new Map();
  let version = 0;
  const filasDe = (cuenta) => {
    if (!porCuenta.has(cuenta)) porCuenta.set(cuenta, new Map());
    return porCuenta.get(cuenta);
  };
  return {
    reset: () => porCuenta.clear(),
    para(cuenta) {
      return {
        async empujar(lote) {
          let aceptadas = 0;
          for (const f of lote) {
            const m = filasDe(cuenta);
            const actual = m.get(f.tabla + '|' + f.id);
            const gana =
              !actual || f.ts > actual.ts || (f.ts === actual.ts && f.dispositivo > actual.dispositivo);
            if (gana) {
              m.set(f.tabla + '|' + f.id, { ...f, version: ++version });
              aceptadas++;
            }
          }
          return aceptadas;
        },
        async tirar(desde) {
          return [...filasDe(cuenta).values()].filter((f) => f.version > desde).sort((a, b) => a.version - b.version);
        },
      };
    },
  };
}

const nube = nubeFalsa();
const A = new TiendaProDB('SyncNubeA');
const B = new TiendaProDB('SyncNubeB');
const C = new TiendaProDB('SyncNubeC');
const ctxA = { db: A, seg: instalarSeguimiento(A, { dispositivo: 'dev_aaa' }) };
const ctxB = { db: B, seg: instalarSeguimiento(B, { dispositivo: 'dev_bbb' }) };
const ctxC = { db: C, seg: instalarSeguimiento(C, { dispositivo: 'dev_ccc' }) };
const cuenta1a = nube.para('cuenta-1');
const cuenta1b = nube.para('cuenta-1');
const cuenta2 = nube.para('cuenta-2');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const limpiar = async (ctx) => {
  for (const t of TABLAS_SINCRONIZABLES) await ctx.db.table(t).clear();
  await ctx.db.cambios.clear();
  await ctx.db.descartes.clear();
  await ctx.db.syncMeta.clear();
};

beforeEach(async () => {
  nube.reset();
  await Promise.all([limpiar(ctxA), limpiar(ctxB), limpiar(ctxC)]);
});
afterAll(async () => {
  await Promise.all([A.delete(), B.delete(), C.delete()]);
});

describe('sincronización con la nube', () => {
  it('lo de un teléfono llega a otro de la misma cuenta y no vuelve a subir', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await A.productos.put({ id: 'p2', nombre: 'Dos' });
    await sincronizarNube(ctxA, cuenta1a);
    const rb = await sincronizarNube(ctxB, cuenta1b);
    expect(rb.aplicados).toBe(2);
    expect(await B.productos.count()).toBe(2);
    expect((await sincronizarNube(ctxB, cuenta1b)).enviado).toBe(0);
    expect((await sincronizarNube(ctxA, cuenta1a)).enviado).toBe(0);
  });

  it('otra cuenta no ve los datos', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await sincronizarNube(ctxA, cuenta1a);
    expect((await sincronizarNube(ctxC, cuenta2)).aplicados).toBe(0);
    expect(await C.productos.count()).toBe(0);
  });

  it('lo escrito sin conexión: gana lo más nuevo en todos y lo que pierde queda en descartes', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Original' });
    await sincronizarNube(ctxA, cuenta1a);
    await sincronizarNube(ctxB, cuenta1b);
    await A.productos.update('p1', { nombre: 'Editado en A' });
    await pausa(5);
    await B.productos.update('p1', { nombre: 'Editado en B' });
    await sincronizarNube(ctxA, cuenta1a);
    await sincronizarNube(ctxB, cuenta1b);
    const ra = await sincronizarNube(ctxA, cuenta1a);
    expect((await A.productos.get('p1')).nombre).toBe('Editado en B');
    expect((await B.productos.get('p1')).nombre).toBe('Editado en B');
    expect(ra.aplicados).toBe(1);
    expect(ra.descartes).toBe(1);
    expect(await A.descartes.count()).toBe(1);
  });

  it('un borrado viaja y la fila no resucita', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    await sincronizarNube(ctxA, cuenta1a);
    await sincronizarNube(ctxB, cuenta1b);
    await A.productos.delete('p1');
    await sincronizarNube(ctxA, cuenta1a);
    expect((await sincronizarNube(ctxB, cuenta1b)).aplicados).toBe(1);
    expect(await B.productos.count()).toBe(0);
    await sincronizarNube(ctxB, cuenta1b);
    await sincronizarNube(ctxA, cuenta1a);
    expect(await A.productos.count()).toBe(0);
    expect(await B.productos.count()).toBe(0);
  });

  it('lo recibido por WiFi sigue hasta la nube y de allí a un tercer teléfono', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    const receptores = [[], []];
    const lado = (yo) => ({
      abierto: Promise.resolve(),
      enviar: (texto) =>
        setTimeout(() => {
          for (const f of receptores[1 - yo]) f(texto);
        }, 0),
      alRecibir: (fn) => receptores[yo].push(fn),
      cerrar() {},
    });
    await Promise.all([sincronizarPorCanal(ctxA, lado(0)), sincronizarPorCanal(ctxB, lado(1))]);
    expect((await sincronizarNube(ctxB, cuenta1b)).enviado).toBe(1);
    expect((await sincronizarNube(ctxC, cuenta1b)).aplicados).toBe(1);
    expect((await C.productos.get('p1')).nombre).toBe('Uno');
  });

  it('dos vueltas a la vez se resuelven en una sola', async () => {
    await A.productos.put({ id: 'p1', nombre: 'Uno' });
    const [r1, r2] = await Promise.all([sincronizarNube(ctxA, cuenta1a), sincronizarNube(ctxA, cuenta1a)]);
    expect(r1).toBe(r2);
    expect(r1.enviado).toBe(1);
  });
});
