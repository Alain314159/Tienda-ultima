/**
 * Contrato del build SIN VITE_TG_APP_KEY (p.ej. APK local sin .env.local).
 *
 * Regresión del action roto (2026-10-16): los workflows llamaban a los
 * reusables sin `secrets: inherit`, el build de E2E horneaba la key vacía y
 * la autodetección disparaba getUpdates → 401 → 8 errores de consola → el
 * smoke test en rojo. La app debe degradarse en SILENCIO cuando no hay key:
 * cero peticiones al proxy (están condenadas a 401), cero spam de consola.
 *
 * El caso CON key (autodetección funcional) vive en telegram-store.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    tgGetUpdates: vi.fn(),
    tgCheckName: vi.fn(),
    tgRegister: vi.fn(),
    tgLogin: vi.fn(),
    tgStatus: vi.fn(),
    tgListBackups: vi.fn(),
    tgSendDocument: vi.fn(),
    tgGetFile: vi.fn(),
    tgFileUrl: vi.fn(),
    tgDeleteMessage: vi.fn(),
  },
}));

vi.mock('../src/telegram', () => ({
  TG_PROXY_URL: 'https://proxy.test',
  TG_APP_KEY: '', // ← el build keyless
  tgDetectarChatId: () => null,
  ...mocks,
}));

import { useTelegramStore } from '../src/stores/useTelegramStore';

describe('build sin VITE_TG_APP_KEY (keyless)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('tgAutoDetectarChat no toca el proxy y devuelve false sin marcar error', async () => {
    const s = useTelegramStore();
    expect(await s.tgAutoDetectarChat()).toBe(false);
    expect(mocks.tgGetUpdates).not.toHaveBeenCalled();
    // Sin key no es un "error de conexión": queda esperando configuración.
    expect(s.tgEstado).toBe('sin-config');
  });

  it('iniciarTgPoll no arranca el timer: 30 s y ni una petición', async () => {
    vi.useFakeTimers();
    try {
      const s = useTelegramStore();
      s.iniciarTgPoll();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.tgGetUpdates).not.toHaveBeenCalled();
      s.detenerTgPoll();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ya conectado (tgChatId presente) sigue devolviendo true sin llamar al proxy', async () => {
    const s = useTelegramStore();
    const { useConfigStore } = await import('../src/stores/useConfigStore');
    useConfigStore().cfg.tgChatId = '12345';
    expect(await s.tgAutoDetectarChat()).toBe(true);
    expect(mocks.tgGetUpdates).not.toHaveBeenCalled();
  });
});
