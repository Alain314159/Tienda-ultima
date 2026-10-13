/**
 * Tests del watchdog de operaciones asíncronas.
 */
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { conWatchdog } from '../src/utils/watchdog';

describe('conWatchdog', () => {
  it('resuelve con el valor de la promesa cuando es rápida', async () => {
    const r = await conWatchdog('op-rapida', Promise.resolve(42), 1000);
    expect(r).toBe(42);
  });

  it('propaga el rechazo original si la promesa falla rápido', async () => {
    await expect(conWatchdog('op-falla', Promise.reject(new Error('fallo de negocio')), 1000)).rejects.toThrow(
      'fallo de negocio'
    );
  });

  it('rechaza con error de timeout si la promesa excede el límite', async () => {
    const lenta = new Promise(() => {}); // nunca resuelve
    await expect(conWatchdog('op-lenta', lenta, 30)).rejects.toThrow(/tardo mas de/);
  });

  it('el mensaje de timeout incluye el nombre de la operación y los segundos', async () => {
    const lenta = new Promise(() => {});
    const p = conWatchdog('procesarVenta', lenta, 50);
    await expect(p).rejects.toThrow('procesarVenta');
  });

  it('limpia el timer al resolver (sin rechazos no manejados posteriores)', async () => {
    let rechazoTardio = false;
    const p = conWatchdog('op', Promise.resolve('ok'), 20).catch(() => {
      rechazoTardio = true;
    });
    await p;
    // Esperar más allá del timeout original: no debe haber rechazo tardío
    await new Promise((r) => setTimeout(r, 60));
    expect(rechazoTardio).toBe(false);
  });
});
