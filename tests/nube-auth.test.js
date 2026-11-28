/**
 * Tests del state/nonce del regreso de Google (1.6).
 *
 * Sin flujo iniciado no se acepta ningún token; el state es de un solo uso
 * y caduca a los 10 minutos; si la URL trae un state distinto al guardado,
 * se rechaza.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  iniciarFlujoAuth,
  estadoAuthPendiente,
  limpiarEstadoAuth,
  leerTokens,
} from '../src/sync/nube';

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('state/nonce del flujo de Google', () => {
  it('sin flujo iniciado no hay nada pendiente', () => {
    expect(estadoAuthPendiente()).toBe(null);
  });

  it('iniciarFlujoAuth genera un state aleatorio y lo guarda', () => {
    const s1 = iniciarFlujoAuth();
    const s2 = iniciarFlujoAuth();
    expect(s1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s1).not.toBe(s2);
    expect(estadoAuthPendiente()?.state).toBe(s2);
  });

  it('limpiarEstadoAuth borra el flujo (un solo uso)', () => {
    iniciarFlujoAuth();
    expect(estadoAuthPendiente()).not.toBe(null);
    limpiarEstadoAuth();
    expect(estadoAuthPendiente()).toBe(null);
  });

  it('el state caduca a los 10 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00'));
    iniciarFlujoAuth();
    expect(estadoAuthPendiente()).not.toBe(null);
    vi.setSystemTime(new Date('2026-11-27T12:09:59'));
    expect(estadoAuthPendiente()).not.toBe(null);
    vi.setSystemTime(new Date('2026-11-27T12:10:01'));
    expect(estadoAuthPendiente()).toBe(null);
    vi.useRealTimers();
  });
});

describe('leerTokens', () => {
  it('lee access_token, refresh_token y state del fragmento', () => {
    const t = leerTokens('tiendapro://auth#access_token=AAA&refresh_token=BBB&state=xyz');
    expect(t).toEqual({ access_token: 'AAA', refresh_token: 'BBB', state: 'xyz' });
  });

  it('lee los tokens de la query si no hay fragmento', () => {
    const t = leerTokens('tiendapro://auth?access_token=AAA&refresh_token=BBB');
    expect(t?.access_token).toBe('AAA');
    expect(t?.refresh_token).toBe('BBB');
  });

  it('sin los dos tokens devuelve null', () => {
    expect(leerTokens('tiendapro://auth#access_token=AAA')).toBe(null);
    expect(leerTokens('tiendapro://auth')).toBe(null);
  });
});
