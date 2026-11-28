/**
 * Tests de redacción de datos del negocio en los logs (1.11).
 *
 * El logger no persiste totales, ganancias, montos, precios, costos ni
 * nombres de productos: un archivo de log perdido no debe revelar la
 * contabilidad. La clave se conserva (se ve qué campo había) pero el valor
 * se redacta, también en objetos anidados.
 *
 * NOTA: tests/logger.test.js todavía afirma el comportamiento anterior
 * (`{total: 250}` en el log persistido) y falla con esta redacción: ese
 * test hay que actualizarlo, no la redacción.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { Log } from '../src/services/logger';

const HOY = new Date().toISOString().slice(0, 10);

function leido() {
  return localStorage.getItem('log_' + HOY) || '';
}

beforeEach(() => {
  localStorage.clear();
});

describe('Log no persiste datos del negocio', () => {
  it('redacta totales, ganancias y montos en eventos', async () => {
    await Log.init();
    Log.evento('venta-guardada', { id: 'v1', items: 3, total: 250, ganancia: 40 });
    Log.evento('compra-guardada', { producto: 'Café', cantidad: 2, costo: 30, total: 60 });
    await Log.flush();
    const out = leido();
    expect(out).toContain('venta-guardada');
    expect(out).toContain('{id: v1, items: [redactado], total: [redactado], ganancia: [redactado]}');
    expect(out).not.toContain('total: 250');
    expect(out).not.toContain('ganancia: 40');
    expect(out).not.toContain('Café');
    expect(out).not.toContain('costo: 30');
    expect(out).not.toContain('total: 60');
  });

  it('redacta precios y nombres de producto, también anidados', async () => {
    await Log.init();
    Log.info('detalle', { venta: { totalVentas: 100, items: [{ nombreProducto: 'Arroz', precio: 50 }] } });
    await Log.flush();
    const out = leido();
    expect(out).not.toContain('Arroz');
    expect(out).not.toContain('totalVentas: 100');
    expect(out).not.toContain('precio: 50');
    expect(out).toContain('[redactado]');
  });

  it('conserva los campos que no son datos del negocio', async () => {
    await Log.init();
    Log.evento('arranque', { codigo: 7, motivo: 'inicio', tabla: 'productos' });
    await Log.flush();
    const out = leido();
    expect(out).toContain('codigo: 7');
    expect(out).toContain('motivo: inicio');
    // 'tabla' no es sensible; 'productos' como VALOR no se redacta (solo claves)
    expect(out).toContain('tabla: productos');
  });
});
