/**
 * Tests del coalescing/debounce del libro diario (4.4):
 * programarRegeneracionAsientos() en services/libroDiario.ts.
 *
 * - Las peticiones de la misma ventana comparten UNA regeneración
 *   (misma promesa) en vez de una reconstrucción completa por venta.
 * - El resultado sigue siendo la regeneración completa e idempotente:
 *   mismo estado => mismos asientos, y ningún cambio se pierde aunque
 *   llegue mientras otra regeneración corre.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../src/db';
import {
  regenerarAsientos,
  programarRegeneracionAsientos,
  hayRegeneracionAsientosPendiente,
} from '../src/services/libroDiario';

const HACE = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

async function limpiar() {
  await Promise.all([
    db.ventas.clear(),
    db.compras.clear(),
    db.gastos.clear(),
    db.capital.clear(),
    db.retiros.clear(),
    db.movCaja.clear(),
    db.ajustes.clear(),
    db.lotes.clear(),
    db.socios.clear(),
    db.asientos.clear(),
    db.config.clear(),
  ]);
}

beforeEach(async () => {
  await limpiar();
});

afterEach(async () => {
  // Dejar que expire cualquier ventana programada por el test.
  await new Promise((r) => setTimeout(r, 400));
  await limpiar();
});

describe('programarRegeneracionAsientos', () => {
  it('3 peticiones seguidas comparten la misma promesa (una sola regeneración)', async () => {
    await db.ventas.put({
      id: 'v_1',
      fecha: HACE(1),
      items: [{ productoId: 'p_1', cantidad: 1, precio: 10, costo: 6, ganancia: 4 }],
      total: 10,
      ganancia: 4,
      anulada: false,
    });
    await db.config.put({ key: 'cfg', value: { capitalInicial: 0 } });

    const p1 = programarRegeneracionAsientos(50);
    const p2 = programarRegeneracionAsientos(50);
    const p3 = programarRegeneracionAsientos(50);
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);
    expect(hayRegeneracionAsientosPendiente()).toBe(true);

    const total = await p1;
    expect(total).toBe(2); // venta + costo
    expect(hayRegeneracionAsientosPendiente()).toBe(false);
    expect(await db.asientos.count()).toBe(2);
  });

  it('el resultado es el mismo libro que regenerarAsientos() directo', async () => {
    await db.compras.put({
      id: 'c_1',
      fecha: HACE(1),
      productoId: 'p_1',
      productoNombre: 'A',
      cantidad: 2,
      costo: 5,
      total: 10,
      anulada: false,
    });
    await db.config.put({ key: 'cfg', value: { capitalInicial: 100 } });

    const total = await programarRegeneracionAsientos(10);
    const ids = (await db.asientos.toArray()).map((a) => a.id).sort();
    expect(total).toBe(ids.length);
    expect(ids).toEqual(['capitalInicial:cfg', 'compra:c_1']);

    // Regenerar directo sobre el mismo estado no cambia nada (idempotente).
    await regenerarAsientos();
    expect((await db.asientos.toArray()).map((a) => a.id).sort()).toEqual(ids);
  });

  it('una tanda nueva tras asentarse vuelve a regenerar con el estado nuevo', async () => {
    await db.config.put({ key: 'cfg', value: { capitalInicial: 0 } });
    expect(await programarRegeneracionAsientos(10)).toBe(0);

    await db.gastos.put({ id: 'g_1', fecha: HACE(0), categoria: 'Luz', concepto: 'Recibo', monto: 8 });
    const pSegunda = programarRegeneracionAsientos(10);
    expect(await pSegunda).toBe(1);
    expect((await db.asientos.toArray()).map((a) => a.id)).toEqual(['gasto:g_1']);
  });

  it('un cambio que llega mientras corre una regeneración no se pierde', async () => {
    await db.ventas.put({
      id: 'v_1',
      fecha: HACE(1),
      items: [{ productoId: 'p_1', cantidad: 1, precio: 10, costo: 6, ganancia: 4 }],
      total: 10,
      ganancia: 4,
      anulada: false,
    });
    await db.config.put({ key: 'cfg', value: { capitalInicial: 0 } });

    // La primera vuelta arranca casi de inmediato...
    const p1 = programarRegeneracionAsientos(5);
    await new Promise((r) => setTimeout(r, 15));
    // ...y mientras corre (o justo después) llega otro cambio.
    await db.ventas.put({
      id: 'v_2',
      fecha: HACE(0),
      items: [{ productoId: 'p_1', cantidad: 1, precio: 20, costo: 12, ganancia: 8 }],
      total: 20,
      ganancia: 8,
      anulada: false,
    });
    const p2 = programarRegeneracionAsientos(5);
    await p2;
    // Da igual si p2 compartió la primera vuelta o disparó una segunda:
    // el libro final tiene que incluir la venta que llegó en medio.
    await p1;
    await new Promise((r) => setTimeout(r, 50));
    const ids = (await db.asientos.toArray()).map((a) => a.id).sort();
    expect(ids).toEqual(['costo:v_1', 'costo:v_2', 'venta:v_1', 'venta:v_2']);
  });
});
