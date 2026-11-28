/**
 * Tests del PIN con bloqueo por intentos y longitud mínima (1.1).
 *
 * - Un PIN nuevo debe tener 4–6 dígitos, solo números.
 * - Tras 5 intentos fallidos el PIN se bloquea un tiempo creciente; el
 *   contador vive en localStorage, así que cerrar el modal (o la app) no
 *   lo resetea. Un acierto limpia fallos y bloqueo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  validarPinNuevo,
  estadoBloqueoPin,
  registrarFalloPin,
  registrarAciertoPin,
  pinBloqueado,
  msRestantesBloqueoPin,
  intentosPinRestantes,
  PIN_MAX_INTENTOS,
} from '../src/services/pin';

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('validarPinNuevo', () => {
  it('acepta de 4 a 6 dígitos', () => {
    for (const pin of ['1234', '12345', '123456', '0000']) {
      expect(validarPinNuevo(pin)).toEqual({ ok: true });
    }
  });

  it('rechaza menos de 4 dígitos (el placeholder decía «4 dígitos» pero se aceptaba cualquiera)', () => {
    for (const pin of ['1', '12', '123']) {
      const r = validarPinNuevo(pin);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/4/);
    }
    expect(validarPinNuevo('').ok).toBe(false);
  });

  it('rechaza más de 6 dígitos y caracteres no numéricos', () => {
    expect(validarPinNuevo('1234567').ok).toBe(false);
    expect(validarPinNuevo('12a4').ok).toBe(false);
    expect(validarPinNuevo('abcd').ok).toBe(false);
    expect(validarPinNuevo(' 1234 ').ok).toBe(true); // espacios alrededor se ignoran
  });
});

describe('bloqueo por intentos fallidos', () => {
  it('empieza sin fallos ni bloqueo', () => {
    expect(estadoBloqueoPin()).toEqual({ fallos: 0, bloqueadoHasta: 0 });
    expect(pinBloqueado()).toBe(false);
    expect(intentosPinRestantes()).toBe(PIN_MAX_INTENTOS);
  });

  it('4 fallos no bloquean; el 5.º sí, durante 1 minuto', () => {
    for (let i = 1; i <= 4; i++) {
      const e = registrarFalloPin();
      expect(e.fallos).toBe(i);
      expect(e.bloqueadoHasta).toBe(0);
      expect(pinBloqueado()).toBe(false);
      expect(intentosPinRestantes()).toBe(PIN_MAX_INTENTOS - i);
    }
    const e = registrarFalloPin();
    expect(e.fallos).toBe(5);
    expect(e.bloqueadoHasta).toBeGreaterThan(Date.now());
    expect(e.bloqueadoHasta - Date.now()).toBeLessThanOrEqual(60_000);
    expect(pinBloqueado()).toBe(true);
    expect(intentosPinRestantes()).toBe(0);
    expect(msRestantesBloqueoPin()).toBeGreaterThan(0);
  });

  it('cada fallo posterior al bloqueo duplica la espera (tope 15 min)', () => {
    for (let i = 0; i < 5; i++) registrarFalloPin();
    const primero = estadoBloqueoPin().bloqueadoHasta;
    const segundo = registrarFalloPin().bloqueadoHasta;
    expect(segundo - primero).toBeGreaterThan(50_000); // ~1 min más (2 min total)
    for (let i = 0; i < 10; i++) registrarFalloPin();
    const tope = estadoBloqueoPin().bloqueadoHasta;
    expect(tope - Date.now()).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  it('el bloqueo sobrevive a «cerrar el modal»: el estado está en localStorage', () => {
    for (let i = 0; i < 5; i++) registrarFalloPin();
    // Simular reapertura: leer el estado guardado sin tocar la memoria
    const guardado = JSON.parse(localStorage.getItem('tp_pin_bloqueo'));
    expect(guardado.fallos).toBe(5);
    expect(guardado.bloqueadoHasta).toBeGreaterThan(Date.now());
    expect(pinBloqueado()).toBe(true);
  });

  it('un acierto limpia fallos y bloqueo', () => {
    for (let i = 0; i < 5; i++) registrarFalloPin();
    expect(pinBloqueado()).toBe(true);
    registrarAciertoPin();
    expect(estadoBloqueoPin()).toEqual({ fallos: 0, bloqueadoHasta: 0 });
    expect(pinBloqueado()).toBe(false);
    expect(intentosPinRestantes()).toBe(PIN_MAX_INTENTOS);
  });

  it('el bloqueo caduca solo con el paso del tiempo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00'));
    for (let i = 0; i < 5; i++) registrarFalloPin();
    expect(pinBloqueado()).toBe(true);
    vi.setSystemTime(new Date('2026-11-27T12:00:30'));
    expect(pinBloqueado()).toBe(true);
    vi.setSystemTime(new Date('2026-11-27T12:01:01'));
    expect(pinBloqueado()).toBe(false);
    expect(msRestantesBloqueoPin()).toBe(0);
  });
});
