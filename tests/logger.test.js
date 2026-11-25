/**
 * Tests del servicio de logging (services/logger.ts) — antes 0% cubierto.
 * Cubre: captura de console, eventos de negocio, flush a localStorage (web),
 * rotación de logs antiguos, listar/leer y activar/desactivar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import { Log } from '../src/services/logger';

const HOY = new Date().toISOString().slice(0, 10);

function leido() {
  return localStorage.getItem('log_' + HOY) || '';
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Log (logger de auditoría)', () => {
  it('init captura console y escribe niveles con formato [hora] [NIVEL]', async () => {
    await Log.init();
    console.warn('cuidado', { codigo: 7 });
    console.error(new Error('boom'));
    await Log.flush();
    const out = leido();
    expect(out).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[WARN\] cuidado \{codigo: 7\}/);
    expect(out).toContain('[ERROR] Error: boom');
    // El console original sigue emitiendo (no se silencia)
  });

  it('evento/info/warn/error registran eventos del negocio', async () => {
    await Log.init();
    Log.evento('venta-guardada', { total: 250 });
    Log.info('arranque listo');
    Log.warn('stock bajo', 'Café');
    Log.error('fallo pdf');
    await Log.flush();
    const out = leido();
    expect(out).toContain('[EVENT] venta-guardada · {total: 250}');
    expect(out).toContain('[INFO] arranque listo');
    expect(out).toContain('[WARN] stock bajo · Café');
    expect(out).toContain('[ERROR] fallo pdf');
  });

  it('flush automático al llegar a 30 líneas (FLUSH_CADA_LINEAS)', async () => {
    await Log.init();
    for (let i = 0; i < 30; i++) Log.evento('ev-' + i);
    // flush() se disparó solo (async): esperar a que la escritura aterrice
    await vi.waitFor(() => expect(leido()).toContain('ev-29'), { timeout: 3000 });
    expect(leido()).toContain('ev-0');
  });

  it('serializa seguros: arrays largos, profundidad y funciones', async () => {
    await Log.init();
    Log.evento('serie', { lista: Array.from({ length: 25 }, (_, i) => i), fn: function ordena() {} });
    await Log.flush();
    const out = leido();
    expect(out).toContain('[Array(25)]');
    expect(out).toContain('...');
    expect(out).toContain('[Function ordena]');
    // claves limitadas a 15
    Log.evento('grande', Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['k' + i, i])));
    await Log.flush();
    expect(leido()).toMatch(/k14: 14.*\.\.\./);
  });

  it('captura errores globales (window error) y promesas rechazadas', async () => {
    await Log.init();
    window.dispatchEvent(new ErrorEvent('error', { message: 'crash de prueba', filename: 'app.js', lineno: 10 }));
    const reason = new Error('promesa rota');
    // happy-dom no tiene PromiseRejectionEvent: construir el evento a mano
    const ev = new Event('unhandledrejection');
    Object.defineProperty(ev, 'reason', { value: reason });
    window.dispatchEvent(ev);
    await Log.flush();
    const out = leido();
    expect(out).toContain('[FATAL] crash de prueba @ app.js:10');
    expect(out).toContain('[REJECT] promesa rota');
  });

  it('desactivar detiene la captura; activar la reanuda', async () => {
    await Log.init();
    Log.desactivar();
    Log.evento('no-debe-aparecer');
    await Log.flush();
    expect(leido()).not.toContain('no-debe-aparecer');
    Log.activar();
    Log.evento('reanudado');
    await Log.flush();
    expect(leido()).toContain('reanudado');
  });

  it('rotar borra logs con más de N días y conserva los recientes', async () => {
    localStorage.setItem('log_2020-01-01', 'viejo');
    localStorage.setItem('log_2021-06-15', 'tambien viejo');
    localStorage.setItem('log_' + HOY, 'hoy');
    await Log.rotar(7);
    expect(localStorage.getItem('log_2020-01-01')).toBeNull();
    expect(localStorage.getItem('log_2021-06-15')).toBeNull();
    expect(localStorage.getItem('log_' + HOY)).toBe('hoy');
  });

  it('listar y leer exponen los logs web por día', async () => {
    localStorage.setItem('log_' + HOY, 'línea 1');
    const archivos = await Log.listar();
    const deHoy = archivos.find((a) => a.name === HOY + '.log');
    expect(deHoy).toBeTruthy();
    expect(deHoy.size).toBeGreaterThan(0);
    expect(await Log.leer(HOY + '.log')).toBe('línea 1');
    // orden descendente por nombre
    localStorage.setItem('log_2000-01-01', 'x');
    const nombres = (await Log.listar()).map((a) => a.name);
    expect(nombres.indexOf(HOY + '.log')).toBeLessThan(nombres.indexOf('2000-01-01.log'));
  });

  it('estado refleja plataforma, buffer y archivos', async () => {
    await Log.init();
    Log.evento('x');
    const e = await Log.estado();
    expect(e.activo).toBe(true);
    expect(e.plataforma).toBe('web');
    expect(e.archivos).toBeInstanceOf(Array);
  });
});
