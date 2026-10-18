/**
 * Tests del contrato de la excepción ambiental 409 del proxy TG
 * (tests/lib/tg409.mjs), compartida por smoke y functional.
 *
 * Reglas de oro que estos tests fijan:
 * - Sin 409 real del proxy NO se perdona nada.
 * - Solo se perdonan tantos console.error como 409 reales hubo (pareo 1:1).
 * - El 401 y cualquier otro error sigue siendo FATAL.
 * - Los checks fallidos (strings 'P12: ...') jamás se tocan.
 */
import { describe, it, expect } from 'vitest';
import { filtrarTg409, esConsola409, esHttp409Tg } from './lib/tg409.mjs';

const CONSOLA_409 = 'console.error: Failed to load resource: the server responded with a status of 409 ()';
const HTTP_409_TG = { tipo: 'http-409', texto: 'https://tienda-proxy.tienda-ul5r2q.workers.dev/api/tg/getUpdates' };

describe('tg409: detección', () => {
  it('esConsola409 reconoce el texto exacto de Chromium', () => {
    expect(esConsola409(CONSOLA_409)).toBe(true);
    expect(esConsola409('console.error: Failed to fetch')).toBe(false);
    expect(esConsola409('')).toBe(false);
  });

  it('esHttp409Tg solo acepta http-409 del proxy (no otros hosts ni códigos)', () => {
    expect(esHttp409Tg(HTTP_409_TG)).toBe(true);
    expect(
      esHttp409Tg({ tipo: 'http-401', texto: 'https://tienda-proxy.tienda-ul5r2q.workers.dev/api/tg/getMe' })
    ).toBe(false);
    expect(esHttp409Tg({ tipo: 'http-409', texto: 'https://otro.host.com/x' })).toBe(false);
    expect(esHttp409Tg('http-409 tienda-proxy')).toBe(false);
    expect(esHttp409Tg(null)).toBe(false);
  });
});

describe('tg409: forma smoke (objetos {tipo, texto})', () => {
  it('sin 409 del proxy la lista queda intacta (nada se perdona a ciegas)', () => {
    const lista = [
      { tipo: 'console.error', texto: CONSOLA_409 },
      { tipo: 'http-500', texto: 'https://api.github.com/x' },
    ];
    expect(filtrarTg409(lista)).toEqual(lista);
  });

  it('409 + console.error emparejados se perdonan ambos (mismo evento)', () => {
    const lista = [HTTP_409_TG, { tipo: 'console.error', texto: CONSOLA_409 }];
    expect(filtrarTg409(lista)).toEqual([]);
  });

  it('más console.error 409 que http 409 reales: solo se perdona el pareo', () => {
    const lista = [
      HTTP_409_TG,
      { tipo: 'console.error', texto: CONSOLA_409 },
      { tipo: 'console.error', texto: CONSOLA_409 },
    ];
    const resto = filtrarTg409(lista);
    expect(resto).toEqual([{ tipo: 'console.error', texto: CONSOLA_409 }]);
  });

  it('el 401 del proxy y otros 4xx siguen FATALES', () => {
    const lista = [
      { tipo: 'http-401', texto: 'https://tienda-proxy.tienda-ul5r2q.workers.dev/api/tg/getMe' },
      { tipo: 'console.error', texto: 'Failed to load resource: the server responded with a status of 401' },
    ];
    expect(filtrarTg409(lista)).toEqual(lista);
  });

  it('avisar se invoca solo cuando hubo perdón', () => {
    let llamadas = 0;
    filtrarTg409([HTTP_409_TG], { avisar: () => llamadas++ });
    filtrarTg409([{ tipo: 'http-500', texto: 'x' }], { avisar: () => llamadas++ });
    expect(llamadas).toBe(1);
  });
});

describe('tg409: forma functional (strings + contador extra409)', () => {
  it('console.error 409 SIN 409 real contado → FATAL (no se perdona a ciegas)', () => {
    const lista = [CONSOLA_409];
    expect(filtrarTg409(lista, { extra409: 0 })).toEqual(lista);
  });

  it('console.error 409 CON 409 real contado → perdonado', () => {
    expect(filtrarTg409([CONSOLA_409], { extra409: 1 })).toEqual([]);
  });

  it('los checks fallidos y pageerrors jamás se tocan', () => {
    const lista = ['P12: venta no registrada 0 !== 1', 'pageerror: TypeError: x is null', CONSOLA_409];
    const resto = filtrarTg409(lista, { extra409: 1 });
    expect(resto).toEqual(['P12: venta no registrada 0 !== 1', 'pageerror: TypeError: x is null']);
  });

  it('extra409 acota el perdón igual que el pareo por objetos', () => {
    const lista = [CONSOLA_409, CONSOLA_409, CONSOLA_409];
    const resto = filtrarTg409(lista, { extra409: 2 });
    expect(resto).toEqual([CONSOLA_409]);
  });
});
