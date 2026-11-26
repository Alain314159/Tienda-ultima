/**
 * Contratos de seguridad del Worker proxy:
 *  - limitacion de ritmo (KV) en /api/register y /api/login contra fuerza bruta
 *  - PBKDF2 a 600k iteraciones con compatibilidad hacia atras (registros legacy
 *    a 100k se validan y se re-hashean al primer login correcto)
 *
 * El Worker se importa como modulo ESM real y el KV se simula con un Map, de
 * modo que los contratos se prueban sobre el codigo que se despliega.
 */
import { describe, it, expect } from 'vitest';
import worker from '../tools/worker/worker.js';

function kvFalso() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v) {
      m.set(k, String(v));
    },
  };
}

function peticion(pathname, { metodo = 'GET', cuerpo, ip = '1.2.3.4' } = {}) {
  const headers = new Headers({ 'X-App-Key': 'k', 'CF-Connecting-IP': ip });
  return new Request('https://worker.test' + pathname, {
    method: metodo,
    headers,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
}

async function hashLegacy100k(password, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

describe('Worker proxy: limitacion de ritmo (KV)', () => {
  it('permite 10 intentos de login y bloquea el 11 con 429', async () => {
    const KV = kvFalso();
    const env = { APP_KEY: 'k', TG_TOKEN: 't', TIENDA_NAMES: KV };
    const cuerpo = { nombre: 'mi-tienda', password: 'mal Incorrecta', chatId: '111' };
    let r;
    for (let i = 0; i < 10; i++) {
      r = await worker.fetch(peticion('/api/login', { metodo: 'POST', cuerpo }), env, {});
      expect(r.status).toBe(404);
    }
    const bloqueado = await worker.fetch(peticion('/api/login', { metodo: 'POST', cuerpo }), env, {});
    expect(bloqueado.status).toBe(429);
  });

  it('no bloquea logins desde otra IP distinta', async () => {
    const KV = kvFalso();
    const env = { APP_KEY: 'k', TG_TOKEN: 't', TIENDA_NAMES: KV };
    const cuerpo = { nombre: 'otra-tienda', password: 'x', chatId: '222' };
    for (let i = 0; i < 10; i++) {
      await worker.fetch(peticion('/api/login', { metodo: 'POST', cuerpo, ip: '5.6.7.8' }), env, {});
    }
    const r = await worker.fetch(peticion('/api/login', { metodo: 'POST', cuerpo, ip: '9.9.9.9' }), env, {});
    expect(r.status).toBe(404);
  });

  it('bloquea el sexto registro desde la misma IP en una hora (429)', async () => {
    const KV = kvFalso();
    const env = { APP_KEY: 'k', TG_TOKEN: 't', TIENDA_NAMES: KV };
    let r;
    for (let i = 0; i < 5; i++) {
      r = await worker.fetch(
        peticion('/api/register', {
          metodo: 'POST',
          cuerpo: { nombre: 'tienda-' + i, password: 'secreta1', chatId: String(i) },
        }),
        env,
        {}
      );
      expect(r.status).toBe(200);
    }
    const sexto = await worker.fetch(
      peticion('/api/register', { metodo: 'POST', cuerpo: { nombre: 'tienda-5', password: 'secreta1', chatId: '5' } }),
      env,
      {}
    );
    expect(sexto.status).toBe(429);
  });
});

describe('Worker proxy: PBKDF2 con iteraciones declaradas', () => {
  it('register guarda iter: 600000', async () => {
    const KV = kvFalso();
    const env = { APP_KEY: 'k', TG_TOKEN: 't', TIENDA_NAMES: KV };
    const r = await worker.fetch(
      peticion('/api/register', {
        metodo: 'POST',
        cuerpo: { nombre: 'nueva-tienda', password: 'secreta1', chatId: '333' },
      }),
      env,
      {}
    );
    expect(r.status).toBe(200);
    const registro = JSON.parse(await KV.get('name:nueva-tienda'));
    expect(registro.iter).toBe(600000);
  });

  it('un registro legacy (100k, sin iter) inicia sesion y se re-hashea a 600k', async () => {
    const KV = kvFalso();
    const env = { APP_KEY: 'k', TG_TOKEN: 't', TIENDA_NAMES: KV };
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = btoa(String.fromCharCode(...saltBytes));
    const passwordHash = await hashLegacy100k('secreta1', salt);
    await KV.put(
      'name:legacy-tienda',
      JSON.stringify({ nombre: 'legacy-tienda', chatId: '444', salt, passwordHash, chatsAutorizados: ['444'] })
    );

    const r = await worker.fetch(
      peticion('/api/login', {
        metodo: 'POST',
        cuerpo: { nombre: 'legacy-tienda', password: 'secreta1', chatId: '444' },
      }),
      env,
      {}
    );
    expect(r.status).toBe(200);

    const registro = JSON.parse(await KV.get('name:legacy-tienda'));
    expect(registro.iter).toBe(600000);
    expect(registro.passwordHash).not.toBe(passwordHash);
    expect(registro.salt).not.toBe(salt);
  });
});
