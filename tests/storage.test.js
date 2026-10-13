/**
 * Tests del wrapper de storage (services/storage.ts):
 * - ruta web (localStorage) y ruta nativa (@capacitor/preferences)
 * - getJSON tolerante: null en clave ausente y en JSON corrupto
 * - setJSON/roundtrip y coerción a string de set()
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const mock = vi.hoisted(() => ({ nativo: false, map: new Map() }));

vi.mock('../src/services/platform', () => ({ esNativo: () => mock.nativo }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }) => ({ value: mock.map.has(key) ? mock.map.get(key) : null }),
    set: async ({ key, value }) => {
      mock.map.set(key, value);
    },
    remove: async ({ key }) => {
      mock.map.delete(key);
    },
  },
}));

import { Storage } from '../src/services/storage';

beforeEach(() => {
  mock.nativo = false;
  mock.map.clear();
  localStorage.clear();
});

describe('Storage: ruta web (localStorage)', () => {
  it('set/get/remove roundtrip de strings', async () => {
    await Storage.set('tema', 'dark');
    expect(await Storage.get('tema')).toBe('dark');
    await Storage.remove('tema');
    expect(await Storage.get('tema')).toBeNull();
  });

  it('set() coerciona a string valores no-string (contrato del wrapper)', async () => {
    await Storage.set('contador', 42);
    expect(await Storage.get('contador')).toBe('42');
    await Storage.set('flag', true);
    expect(await Storage.get('flag')).toBe('true');
  });

  it('get() de clave inexistente devuelve null (no undefined)', async () => {
    expect(await Storage.get('no-existe')).toBeNull();
  });

  it('getJSON: null en ausente, parsea válido, null en JSON corrupto', async () => {
    expect(await Storage.getJSON('cfg')).toBeNull();
    await Storage.set('cfg', '{"nombre":"Tienda","pin":null}');
    expect(await Storage.getJSON('cfg')).toEqual({ nombre: 'Tienda', pin: null });
    await Storage.set('cfg', '{esto no es json');
    expect(await Storage.getJSON('cfg')).toBeNull();
  });

  it('getJSON: cadena vacía cuenta como ausente (falsy guard)', async () => {
    await Storage.set('vacio', '');
    expect(await Storage.getJSON('vacio')).toBeNull();
  });

  it('setJSON serializa y getJSON recupera estructuras anidadas', async () => {
    await Storage.setJSON('lista', [{ id: 'a_1', items: [1, 2, { x: 3 }] }]);
    expect(await Storage.getJSON('lista')).toEqual([{ id: 'a_1', items: [1, 2, { x: 3 }] }]);
  });
});

describe('Storage: ruta nativa (@capacitor/preferences)', () => {
  beforeEach(() => {
    mock.nativo = true;
  });

  it('set/get/remove usan Preferences, no localStorage', async () => {
    await Storage.set('k', 'v');
    expect(mock.map.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBeNull();
    expect(await Storage.get('k')).toBe('v');
    await Storage.remove('k');
    expect(await Storage.get('k')).toBeNull();
    expect(mock.map.has('k')).toBe(false);
  });

  it('getJSON tolera JSON corrupto también en nativo', async () => {
    mock.map.set('roto', '{{{');
    expect(await Storage.getJSON('roto')).toBeNull();
  });

  it('setJSON funciona en la ruta nativa', async () => {
    await Storage.setJSON('resp', { ok: true, n: 3 });
    expect(await Storage.getJSON('resp')).toEqual({ ok: true, n: 3 });
  });
});
