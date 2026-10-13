/**
 * Tests de cripto/backup: compresión gzip nativa, hash de contenido
 * y derivación de claves PBKDF2 + cifrado AES-256-GCM (el pipeline
 * que protege los backups cifrados de la app).
 */
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { comprimirGzip, descomprimirGzip, derivarClave } from '../src/services/backup';
import { hashContenido } from '../src/services/hash';

describe('gzip nativo (backup)', () => {
  it('roundtrip: comprimir → descomprimir devuelve el texto original', async () => {
    const original = JSON.stringify({ productos: [{ id: 'p1' }], ventas: [], ts: Date.now() });
    const gz = await comprimirGzip(new Blob([original], { type: 'application/json' }));
    const back = await descomprimirGzip(gz);
    const texto = await back.text();
    expect(texto).toBe(original);
  });

  it('payloads repetitivos comprimen (si el entorno soporta CompressionStream)', async () => {
    const original = 'x'.repeat(5000);
    const gz = await comprimirGzip(new Blob([original]));
    if (typeof CompressionStream !== 'undefined') {
      expect(gz.size).toBeLessThan(original.length);
      expect(gz.type).toBe('application/gzip');
    }
  });

  it('payload vacío sobrevive el roundtrip', async () => {
    const gz = await comprimirGzip(new Blob(['']));
    const back = await descomprimirGzip(gz);
    expect(await back.text()).toBe('');
  });
});

describe('hashContenido: SHA-256 truncado', () => {
  it('es determinista para el mismo contenido', async () => {
    const h1 = await hashContenido('backup-v1');
    const h2 = await hashContenido('backup-v1');
    expect(h1).toBe(h2);
  });

  it('cambia cuando cambia el contenido', async () => {
    expect(await hashContenido('a')).not.toBe(await hashContenido('b'));
  });

  it('formato: 16 caracteres hex (64 tras SHA-256, truncado)', async () => {
    const h = await hashContenido('x');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('cadena vacía produce hash estable (no el fallback len_)', async () => {
    const h = await hashContenido('');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).not.toContain('len_');
  });
});

describe('derivarClave: PBKDF2 → AES-256-GCM', () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  async function cifrar(key, texto) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(texto));
    return { iv, buf };
  }

  async function descifrar(key, { iv, buf }) {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf);
    return new TextDecoder().decode(out);
  }

  it('misma contraseña + salt → misma clave (roundtrip cifrar/descifrar)', async () => {
    const k1 = await derivarClave('secreto', salt);
    const k2 = await derivarClave('secreto', salt);
    const { iv, buf } = await cifrar(k1, '{"datos": true}');
    expect(await descifrar(k2, { iv, buf })).toBe('{"datos": true}');
  });

  it('salt distinto → clave distinta (el descifrado falla)', async () => {
    const k1 = await derivarClave('secreto', salt);
    const k2 = await derivarClave('secreto', crypto.getRandomValues(new Uint8Array(16)));
    const c = await cifrar(k1, 'x');
    await expect(descifrar(k2, c)).rejects.toThrow();
  });

  it('contraseña distinta → clave distinta', async () => {
    const k1 = await derivarClave('secreto', salt);
    const k2 = await derivarClave('otro-secreto', salt);
    const c = await cifrar(k1, 'x');
    await expect(descifrar(k2, c)).rejects.toThrow();
  });
});
