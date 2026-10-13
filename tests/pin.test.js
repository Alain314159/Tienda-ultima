/**
 * Tests del servicio de PIN: hash PBKDF2 en reposo, verificación con
 * soporte legacy y migración automática en useConfigStore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { hashPin, verificarPin, esPinHasheado } from '../src/services/pin';
import { db } from '../src/db';
import { useConfigStore } from '../src/stores/useConfigStore';

beforeEach(async () => {
  setActivePinia(createPinia());
  await db.config.clear();
});

describe('hashPin / verificarPin', () => {
  it('el hash no contiene el PIN y usa el formato declarado', async () => {
    const h = await hashPin('1234');
    expect(h).toMatch(/^pbkdf2\$600000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(h).not.toContain('1234');
    expect(esPinHasheado(h)).toBe(true);
    expect(esPinHasheado('1234')).toBe(false);
  });

  it('el PIN correcto verifica; el incorrecto no', async () => {
    const h = await hashPin('4321');
    expect(await verificarPin('4321', h)).toBe(true);
    expect(await verificarPin('4322', h)).toBe(false);
    expect(await verificarPin('', h)).toBe(false);
  });

  it('dos hashes del mismo PIN difieren (sal aleatoria) pero ambos verifican', async () => {
    const h1 = await hashPin('9999');
    const h2 = await hashPin('9999');
    expect(h1).not.toBe(h2);
    expect(await verificarPin('9999', h1)).toBe(true);
    expect(await verificarPin('9999', h2)).toBe(true);
  });

  it('legacy: PIN en claro sigue verificándose (compatibilidad pre-hash)', async () => {
    expect(await verificarPin('1234', '1234')).toBe(true);
    expect(await verificarPin('0000', '1234')).toBe(false);
  });

  it('valor almacenado corrupto o vacío no verifica (fail-closed)', async () => {
    expect(await verificarPin('1234', undefined)).toBe(false);
    expect(await verificarPin('1234', '')).toBe(false);
    expect(await verificarPin('1234', 'pbkdf2$xxx$@@@$yyy')).toBe(false);
    expect(await verificarPin('1234', 'pbkdf2$abc$salt$hash')).toBe(false);
  });
});

describe('useConfigStore: PIN nunca en claro en IndexedDB', () => {
  it('guardarCfg hashea el PIN automáticamente', async () => {
    const cfg = useConfigStore();
    await cfg.cargarCfg();
    cfg.cfg.pin = '2468';
    cfg.cfg.pinActivo = true;
    await cfg.guardarCfg();

    const guardado = await db.config.get('cfg');
    expect(esPinHasheado(guardado.value.pin)).toBe(true);
    expect(guardado.value.pin).not.toContain('2468'.padEnd(8, '2'));
    // y el hash verifica
    expect(await verificarPin('2468', guardado.value.pin)).toBe(true);
  });

  it('un PIN ya hasheado no se re-hashea al guardar de nuevo', async () => {
    const cfg = useConfigStore();
    await cfg.cargarCfg();
    cfg.cfg.pin = '1357';
    cfg.cfg.pinActivo = true;
    await cfg.guardarCfg();
    const hash1 = (await db.config.get('cfg')).value.pin;

    await cfg.guardarCfg(); // otro cambio de ajustes cualquiera
    const hash2 = (await db.config.get('cfg')).value.pin;
    expect(hash1).toBe(hash2);
  });

  it('cargarCfg migra en segundo plano un PIN legacy en claro', async () => {
    // Sembrar config legacy (como la guardaba una versión anterior)
    await db.config.put({ key: 'cfg', value: { pin: '7777', pinActivo: true } });

    const cfg = useConfigStore();
    await cfg.cargarCfg();
    // esperar la migración fire-and-forget
    for (let i = 0; i < 50; i++) {
      const rec = await db.config.get('cfg');
      if (esPinHasheado(rec.value.pin)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const rec = await db.config.get('cfg');
    expect(esPinHasheado(rec.value.pin)).toBe(true);
    expect(await verificarPin('7777', rec.value.pin)).toBe(true);
  });
});
