/**
 * Tests de persistencia de la sesión de Supabase (requisito prioritario del
 * usuario: una vez conectado, no debe desconectarse solo) y del reintento
 * con backoff.
 *
 * Se usa un cliente Supabase falso con un almacenamiento compartido que
 * simula localStorage ('tp-nube-sesion'): un cliente nuevo leyendo el mismo
 * almacenamiento es el «reinicio de la app».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  restaurarSesionNube,
  reintentarConBackoff,
  esErrorTransitorio,
  esSesionInvalida,
} from '../src/sync/nube';

const SESION = { access_token: 'ACC', refresh_token: 'REF', user: { email: 'dueño@example.com' } };

/**
 * Cliente Supabase falso con almacenamiento compartido (simula el
 * localStorage de la app real, clave 'tp-nube-sesion').
 * - `fallaTransitoria`: las N primeras llamadas a getSession lanzan un
 *   error de red y luego devuelven la sesión guardada.
 * - `refreshInvalido`: getSession devuelve el error de refresh token
 *   inválido que da Supabase cuando el token está revocado/caducado.
 */
function clienteFalso(almacen, opciones = {}) {
  let llamadasGet = 0;
  const signOut = vi.fn(async () => {
    almacen.delete('tp-nube-sesion');
    return { error: null };
  });
  return {
    signOut,
    llamadasGet: () => llamadasGet,
    auth: {
      signOut,
      async setSession({ access_token, refresh_token }) {
        const sesion = { ...SESION, access_token, refresh_token };
        almacen.set('tp-nube-sesion', sesion);
        return { data: { session: sesion }, error: null };
      },
      async getSession() {
        llamadasGet++;
        if (opciones.fallaTransitoria && llamadasGet <= opciones.fallaTransitoria) {
          throw new TypeError('Failed to fetch');
        }
        if (opciones.refreshInvalido) {
          return {
            data: { session: null },
            error: {
              code: 'refresh_token_not_found',
              message: 'Invalid Refresh Token: Refresh Token Not Found',
            },
          };
        }
        const guardada = almacen.get('tp-nube-sesion') ?? null;
        return { data: { session: guardada }, error: null };
      },
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('restaurarSesionNube: la sesión sobrevive a reinicios', () => {
  it('sesión guardada por un cliente se restaura con un cliente nuevo (reinicio)', async () => {
    const almacen = new Map();
    const antes = clienteFalso(almacen);
    await antes.auth.setSession({ access_token: 'ACC', refresh_token: 'REF' });

    // «Reinicio»: cliente nuevo, mismo almacenamiento.
    const despues = clienteFalso(almacen);
    const r = await restaurarSesionNube(despues, { esperaBaseMs: 1 });
    expect(r).toEqual({ sesion: { correo: 'dueño@example.com' } });
  });

  it('sin sesión guardada devuelve sin-sesion (no es un error)', async () => {
    const r = await restaurarSesionNube(clienteFalso(new Map()), { esperaBaseMs: 1 });
    expect(r).toEqual({ error: 'sin-sesion' });
  });

  it('refresh fallido por falta de red NO cierra la sesión: reintenta y la recupera', async () => {
    const almacen = new Map();
    almacen.set('tp-nube-sesion', SESION);
    const cliente = clienteFalso(almacen, { fallaTransitoria: 2 });
    const r = await restaurarSesionNube(cliente, { esperaBaseMs: 1 });
    expect(r).toEqual({ sesion: { correo: 'dueño@example.com' } });
    expect(cliente.llamadasGet()).toBe(3); // 2 fallos + 1 éxito
    expect(cliente.signOut).not.toHaveBeenCalled();
  });

  it('sin red permanente devuelve transitorio y NO cierra la sesión', async () => {
    const almacen = new Map();
    almacen.set('tp-nube-sesion', SESION);
    const cliente = clienteFalso(almacen, { fallaTransitoria: 99 });
    const r = await restaurarSesionNube(cliente, { intentos: 2, esperaBaseMs: 1 });
    expect(r).toEqual({ error: 'transitorio' });
    expect(cliente.signOut).not.toHaveBeenCalled();
    expect(almacen.get('tp-nube-sesion')).toBe(SESION); // la sesión guardada sigue ahí
  });

  it('refresh token inválido (Supabase lo dice explícito): se cierra la sesión, sin reintentos', async () => {
    const almacen = new Map();
    almacen.set('tp-nube-sesion', SESION);
    const cliente = clienteFalso(almacen, { refreshInvalido: true });
    const r = await restaurarSesionNube(cliente, { esperaBaseMs: 1 });
    expect(r).toEqual({ error: 'invalida' });
    expect(cliente.llamadasGet()).toBe(1);
    expect(cliente.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('clasificación de errores de sesión', () => {
  it('esErrorTransitorio: red y 5xx sí; 4xx y auth no', () => {
    expect(esErrorTransitorio(new TypeError('Failed to fetch'))).toBe(true);
    expect(esErrorTransitorio(new Error('network error'))).toBe(true);
    expect(esErrorTransitorio({ status: 503, message: 'Service Unavailable' })).toBe(true);
    expect(esErrorTransitorio({ status: 500, message: 'x' })).toBe(true);
    expect(esErrorTransitorio({ status: 401, message: 'JWT expired' })).toBe(false);
    expect(esErrorTransitorio({ status: 400, message: 'Bad Request' })).toBe(false);
    expect(esErrorTransitorio(new Error('Invalid Refresh Token'))).toBe(false);
  });

  it('esSesionInvalida: solo el refresh token inválido/revocado', () => {
    expect(esSesionInvalida({ code: 'refresh_token_not_found', message: 'x' })).toBe(true);
    expect(esSesionInvalida(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true);
    expect(esSesionInvalida(new Error('invalid_grant'))).toBe(true);
    expect(esSesionInvalida(new TypeError('Failed to fetch'))).toBe(false);
    expect(esSesionInvalida(new Error('JWT expired'))).toBe(false);
    expect(esSesionInvalida({ status: 500, message: 'x' })).toBe(false);
  });
});

describe('reintentarConBackoff', () => {
  it('reintenta con espera creciente y devuelve el éxito', async () => {
    const esperas = [];
    let intentos = 0;
    const r = await reintentarConBackoff(
      async () => {
        intentos++;
        if (intentos < 3) throw new TypeError('Failed to fetch');
        return 'ok';
      },
      { intentos: 3, esperaBaseMs: 10, esperar: async (ms) => void esperas.push(ms) }
    );
    expect(r).toBe('ok');
    expect(intentos).toBe(3);
    expect(esperas).toEqual([10, 20]); // base, base*2
  });

  it('si el error no es reintentable, no reintenta', async () => {
    let intentos = 0;
    await expect(
      reintentarConBackoff(
        async () => {
          intentos++;
          throw new Error('Invalid Refresh Token');
        },
        { intentos: 3, esperaBaseMs: 1, soloSi: esErrorTransitorio }
      )
    ).rejects.toThrow('Invalid Refresh Token');
    expect(intentos).toBe(1);
  });

  it('agotados los intentos, lanza el último error', async () => {
    let intentos = 0;
    await expect(
      reintentarConBackoff(
        async () => {
          intentos++;
          throw new TypeError('Failed to fetch');
        },
        { intentos: 3, esperaBaseMs: 1 }
      )
    ).rejects.toThrow('Failed to fetch');
    expect(intentos).toBe(3);
  });
});
