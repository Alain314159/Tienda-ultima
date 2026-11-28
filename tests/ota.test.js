/**
 * Tests del módulo OTA manual (src/sync/ota.ts): validación del manifiesto,
 * comprobación/descarga, sin internet, fallos y promoción de la versión
 * pendiente al arrancar. Sin Capgo Cloud: solo fetch + plugin local.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';

const capState = vi.hoisted(() => ({ nativo: true }));
const mocks = vi.hoisted(() => ({
  notifyAppReady: vi.fn(),
  download: vi.fn(),
  next: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capState.nativo,
    getPlatform: () => (capState.nativo ? 'android' : 'web'),
  },
}));
vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    notifyAppReady: (...a) => mocks.notifyAppReady(...a),
    download: (...a) => mocks.download(...a),
    next: (...a) => mocks.next(...a),
    reload: (...a) => mocks.reload(...a),
  },
}));

import {
  OTA_MANIFIESTO_URL,
  validarManifiesto,
  versionActiva,
  comprobarActualizacion,
  reiniciarParaAplicar,
  inicializarOTA,
} from '../src/sync/ota';

const SHA256 = 'a'.repeat(64);
const MANIFIESTO_OK = {
  version: '6.0.1-abcdef1',
  url: 'https://alain314159.github.io/Tienda-ultima/updates/6.0.1-abcdef1.zip',
  sha256: SHA256,
};

const mockFetch = vi.fn();

/** fetch que responde con un JSON y HTTP 200. */
function fetchJson(datos, ok = true, status = 200) {
  mockFetch.mockResolvedValue({ ok, status, json: async () => datos });
}

function setOnline(valor) {
  Object.defineProperty(window.navigator, 'onLine', { value: valor, configurable: true });
}

beforeEach(async () => {
  setActivePinia(createPinia());
  capState.nativo = true;
  setOnline(true);
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  mocks.notifyAppReady.mockReset().mockResolvedValue({});
  mocks.download.mockReset().mockResolvedValue({
    id: 'bundle-1',
    version: MANIFIESTO_OK.version,
    downloaded: '',
    checksum: SHA256,
    status: 'downloaded',
  });
  mocks.next.mockReset().mockResolvedValue({ id: 'bundle-1', version: MANIFIESTO_OK.version });
  mocks.reload.mockReset().mockResolvedValue(undefined);
  await db.config.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.navigator.onLine;
});

// ============================================================
// validarManifiesto
// ============================================================
describe('validarManifiesto', () => {
  it('acepta un manifiesto válido', () => {
    expect(validarManifiesto(MANIFIESTO_OK)).toEqual(MANIFIESTO_OK);
  });

  it('rechaza versión mal formada', () => {
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: '6.0.1' })).toBeNull(); // sin sha
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: 'v6.0.1-abcdef1' })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: '6.0-abcdef1' })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: '6.0.1-xyz' })).toBeNull(); // sha no hex
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: '6.0.1-abc' })).toBeNull(); // sha corto (<7)
    expect(validarManifiesto({ ...MANIFIESTO_OK, version: 601 })).toBeNull();
  });

  it('rechaza url fuera de GitHub Pages, sin https o sin .zip', () => {
    expect(validarManifiesto({ ...MANIFIESTO_OK, url: 'https://evil.com/updates/6.0.1.zip' })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, url: 'http://alain314159.github.io/Tienda-ultima/updates/6.0.1.zip' })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, url: 'https://alain314159.github.io/Tienda-ultima/updates/6.0.1.tar' })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, url: 'https://alain314159.github.io/Tienda-ultima/otro/6.0.1.zip' })).toBeNull();
  });

  it('rechaza sha256 corto, largo o no hexadecimal', () => {
    expect(validarManifiesto({ ...MANIFIESTO_OK, sha256: 'a'.repeat(63) })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, sha256: 'a'.repeat(65) })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, sha256: 'g'.repeat(64) })).toBeNull();
    expect(validarManifiesto({ ...MANIFIESTO_OK, sha256: 123 })).toBeNull();
  });

  it('rechaza datos que no son objeto o sin campos', () => {
    expect(validarManifiesto(null)).toBeNull();
    expect(validarManifiesto('texto')).toBeNull();
    expect(validarManifiesto([])).toBeNull();
    expect(validarManifiesto({})).toBeNull();
  });
});

// ============================================================
// versionActiva
// ============================================================
describe('versionActiva', () => {
  it('usa cfg.versionApp si existe y si no, "desconocida" (sin VITE_APP_BUILD en tests)', () => {
    expect(versionActiva()).toBe('desconocida');
    useConfigStore().cfg.versionApp = '6.0.0-aaaaaaa';
    expect(versionActiva()).toBe('6.0.0-aaaaaaa');
  });
});

// ============================================================
// comprobarActualizacion
// ============================================================
describe('comprobarActualizacion', () => {
  it('en web no hace nada: actualizado sin llamar a fetch ni al plugin', async () => {
    capState.nativo = false;
    useConfigStore().cfg.versionApp = '6.0.0-aaaaaaa';
    const r = await comprobarActualizacion();
    expect(r).toEqual({ estado: 'actualizado', version: '6.0.0-aaaaaaa' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('sin internet: fetch no se llama y devuelve sin-internet', async () => {
    setOnline(false);
    const r = await comprobarActualizacion();
    expect(r).toEqual({ estado: 'sin-internet' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('versión igual a la activa: actualizado y no descarga nada', async () => {
    useConfigStore().cfg.versionApp = MANIFIESTO_OK.version;
    fetchJson(MANIFIESTO_OK);
    const r = await comprobarActualizacion();
    expect(r).toEqual({ estado: 'actualizado', version: MANIFIESTO_OK.version });
    expect(mockFetch).toHaveBeenCalledWith(OTA_MANIFIESTO_URL, expect.objectContaining({ signal: expect.anything() }));
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.next).not.toHaveBeenCalled();
  });

  it('versión distinta: descarga con checksum, llama a next() y guarda versionPendiente', async () => {
    const config = useConfigStore();
    config.cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson(MANIFIESTO_OK);
    const r = await comprobarActualizacion();
    expect(r).toEqual({ estado: 'lista', version: MANIFIESTO_OK.version });
    expect(mocks.download).toHaveBeenCalledWith({
      url: MANIFIESTO_OK.url,
      version: MANIFIESTO_OK.version,
      checksum: MANIFIESTO_OK.sha256,
    });
    expect(mocks.next).toHaveBeenCalledWith({ id: 'bundle-1' });
    expect(config.cfg.versionPendiente).toBe(MANIFIESTO_OK.version);
    // La versión activa no se toca hasta reiniciar con el paquete nuevo
    expect(config.cfg.versionApp).toBe('6.0.0-aaaaaaa');
  });

  it('fallo de descarga: error y versión activa intacta (sin pendiente)', async () => {
    const config = useConfigStore();
    config.cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson(MANIFIESTO_OK);
    mocks.download.mockRejectedValue(new Error('red caída'));
    const r = await comprobarActualizacion();
    expect(r.estado).toBe('error');
    expect(r.mensaje).toContain('6.0.1-abcdef1');
    expect(mocks.next).not.toHaveBeenCalled();
    expect(config.cfg.versionApp).toBe('6.0.0-aaaaaaa');
    expect(config.cfg.versionPendiente).toBeUndefined();
  });

  it('fallo de next(): error y sin versión pendiente', async () => {
    const config = useConfigStore();
    config.cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson(MANIFIESTO_OK);
    mocks.next.mockRejectedValue(new Error('no se pudo poner como siguiente'));
    const r = await comprobarActualizacion();
    expect(r.estado).toBe('error');
    expect(config.cfg.versionPendiente).toBeUndefined();
    expect(config.cfg.versionApp).toBe('6.0.0-aaaaaaa');
  });

  it('manifiesto inválido desde el servidor: error sin descargar', async () => {
    useConfigStore().cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson({ ...MANIFIESTO_OK, sha256: 'corto' });
    const r = await comprobarActualizacion();
    expect(r.estado).toBe('error');
    expect(r.mensaje).toContain('manifiesto');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('fetch que rechaza: error en español, sin descargar', async () => {
    useConfigStore().cfg.versionApp = '6.0.0-aaaaaaa';
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await comprobarActualizacion();
    expect(r.estado).toBe('error');
    expect(r.mensaje).toMatch(/manifiesto|conexión/);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('respuesta HTTP no-OK: error sin descargar', async () => {
    useConfigStore().cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson({ error: 'nope' }, false, 404);
    const r = await comprobarActualizacion();
    expect(r.estado).toBe('error');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

// ============================================================
// reiniciarParaAplicar
// ============================================================
describe('reiniciarParaAplicar', () => {
  it('llama a CapacitorUpdater.reload()', async () => {
    await reiniciarParaAplicar();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// inicializarOTA
// ============================================================
describe('inicializarOTA', () => {
  it('promueve versionPendiente a versionApp y la limpia; avisa app lista', async () => {
    const config = useConfigStore();
    config.cfg.versionApp = '6.0.0-aaaaaaa';
    config.cfg.versionPendiente = '6.0.1-abcdef1';
    // Tras la promoción, el manifiesto coincide: no descarga nada más
    fetchJson(MANIFIESTO_OK);
    await inicializarOTA();
    expect(mocks.notifyAppReady).toHaveBeenCalledTimes(1);
    expect(config.cfg.versionApp).toBe('6.0.1-abcdef1');
    expect(config.cfg.versionPendiente).toBeUndefined();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('sin versión pendiente no toca versionApp', async () => {
    const config = useConfigStore();
    config.cfg.versionApp = '6.0.0-aaaaaaa';
    fetchJson({ ...MANIFIESTO_OK, version: '6.0.0-aaaaaaa' });
    await inicializarOTA();
    expect(config.cfg.versionApp).toBe('6.0.0-aaaaaaa');
    expect(config.cfg.versionPendiente).toBeUndefined();
  });

  it('en web no hace nada (ni notifyAppReady ni fetch)', async () => {
    capState.nativo = false;
    await inicializarOTA();
    expect(mocks.notifyAppReady).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sin internet en la comprobación silenciosa: no rompe el arranque', async () => {
    setOnline(false);
    const config = useConfigStore();
    config.cfg.versionPendiente = '6.0.1-abcdef1';
    await expect(inicializarOTA()).resolves.toBeUndefined();
    expect(config.cfg.versionApp).toBe('6.0.1-abcdef1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('notifyAppReady que falla no rompe el arranque ni la promoción', async () => {
    mocks.notifyAppReady.mockRejectedValue(new Error('plugin no listo'));
    const config = useConfigStore();
    config.cfg.versionPendiente = '6.0.1-abcdef1';
    fetchJson(MANIFIESTO_OK);
    await expect(inicializarOTA()).resolves.toBeUndefined();
    expect(config.cfg.versionApp).toBe('6.0.1-abcdef1');
  });
});
