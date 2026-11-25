/**
 * Tests del servicio FIFO — lógica nuclear de costo de inventario.
 * Cobra: orden por fecha (más viejo primero), desempate por id,
 * consumo parcial, stock insuficiente, fracciones y ganancia por item.
 */
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { calcFIFO, gananciaItem } from '../src/services/fifo';

/** Fábrica de lotes con defaults sensatos. */
function lote(overrides = {}) {
  return {
    id: 'l1',
    productoId: 'p1',
    fecha: '2026-01-01',
    cantidadInicial: 10,
    cantidadVendida: 0,
    costo: 100,
    ...overrides,
  };
}

describe('calcFIFO: casos base', () => {
  it('consume un único lote completo', () => {
    const r = calcFIFO('p1', 10, [lote()]);
    expect(r.error).toBeNull();
    expect(r.costoTotal).toBe(1000);
    expect(r.costoUnitario).toBe(100);
    expect(r.lotesUsados).toEqual([{ loteId: 'l1', cantidad: 10, costo: 100 }]);
  });

  it('consume parcialmente un lote', () => {
    const r = calcFIFO('p1', 4, [lote()]);
    expect(r.error).toBeNull();
    expect(r.costoTotal).toBe(400);
    expect(r.lotesUsados[0].cantidad).toBe(4);
  });

  it('sin lotes del producto devuelve error explícito', () => {
    const r = calcFIFO('otro', 1, [lote()]);
    expect(r.error).toBe('No hay lotes disponibles');
    expect(r.costoTotal).toBe(0);
    expect(r.lotesUsados).toEqual([]);
  });

  it('ignora lotes agotados (cantidadVendida >= cantidadInicial)', () => {
    const r = calcFIFO('p1', 1, [lote({ cantidadInicial: 5, cantidadVendida: 5 })]);
    expect(r.error).toBe('No hay lotes disponibles');
  });

  it('stock insuficiente devuelve error y no calcula costo a medias', () => {
    const r = calcFIFO('p1', 11, [lote()]);
    expect(r.error).toBe('Stock insuficiente');
    expect(r.costoTotal).toBe(0);
    expect(r.lotesUsados).toEqual([]);
  });
});

describe('calcFIFO: ordenamiento', () => {
  it('usa primero el lote más viejo (esencia del FIFO)', () => {
    const lotes = [
      lote({ id: 'nuevo', fecha: '2026-06-01', costo: 200 }),
      lote({ id: 'viejo', fecha: '2026-01-01', costo: 100 }),
    ];
    const r = calcFIFO('p1', 10, lotes);
    expect(r.lotesUsados[0].loteId).toBe('viejo');
    expect(r.costoTotal).toBe(1000);
  });

  it('desempata por id cuando las fechas coinciden', () => {
    const lotes = [
      lote({ id: 'b', fecha: '2026-01-01', costo: 300 }),
      lote({ id: 'a', fecha: '2026-01-01', costo: 100 }),
    ];
    const r = calcFIFO('p1', 10, lotes);
    expect(r.lotesUsados[0].loteId).toBe('a');
    expect(r.costoTotal).toBe(1000);
  });

  it('consume en cascada varios lotes hasta cubrir la cantidad', () => {
    const lotes = [
      lote({ id: 'l1', fecha: '2026-01-01', cantidadInicial: 3, costo: 100 }),
      lote({ id: 'l2', fecha: '2026-02-01', cantidadInicial: 5, costo: 200 }),
      lote({ id: 'l3', fecha: '2026-03-01', cantidadInicial: 9, costo: 50 }),
    ];
    const r = calcFIFO('p1', 10, lotes);
    expect(r.error).toBeNull();
    expect(r.costoTotal).toBe(3 * 100 + 5 * 200 + 2 * 50);
    expect(r.lotesUsados.map((l) => l.loteId)).toEqual(['l1', 'l2', 'l3']);
    expect(r.lotesUsados[2].cantidad).toBe(2);
  });
});

describe('calcFIFO: robustez numérica', () => {
  it('soporta cantidades fraccionarias (4 decimales)', () => {
    const r = calcFIFO('p1', 2.5, [lote({ cantidadInicial: 10, costo: 3.2 })]);
    expect(r.costoTotal).toBeCloseTo(8, 10);
    expect(r.costoUnitario).toBeCloseTo(3.2, 10);
  });

  it('cantidad 0 no consume lotes ni reporta error', () => {
    const r = calcFIFO('p1', 0, [lote()]);
    expect(r.error).toBeNull();
    expect(r.lotesUsados).toEqual([]);
    expect(r.costoTotal).toBe(0);
  });

  it('entradas numéricas como string se normalizan (n())', () => {
    const r = calcFIFO('p1', '2', [lote({ cantidadInicial: '5', cantidadVendida: '0', costo: '7' })]);
    expect(r.error).toBeNull();
    expect(r.costoTotal).toBe(14);
  });

  it('lote con campos inválidos no rompe el cálculo (saneo a 0)', () => {
    const r = calcFIFO('p1', 1, [lote({ cantidadInicial: undefined, cantidadVendida: null, costo: 'x' })]);
    // cantidadInicial 0 - vendida 0 = 0 => lote sin stock => no disponible
    expect(r.error).toBe('No hay lotes disponibles');
  });
});

describe('gananciaItem: precio de venta vs costo FIFO', () => {
  it('ganancia positiva con precio sobre el costo', () => {
    const g = gananciaItem({ productoId: 'p1', nombre: 'X', precio: 150, cant: 2 }, [lote({ costo: 100 })]);
    expect(g).toBe(100);
  });

  it('ganancia negativa (pérdida) cuando el precio no cubre el costo', () => {
    const g = gananciaItem({ productoId: 'p1', nombre: 'X', precio: 90, cant: 2 }, [lote({ costo: 100 })]);
    expect(g).toBe(-20);
  });

  it('sin stock disponible la ganancia es 0 (no error)', () => {
    const g = gananciaItem({ productoId: 'p1', nombre: 'X', precio: 150, cant: 1 }, [
      lote({ cantidadInicial: 1, cantidadVendida: 1 }),
    ]);
    expect(g).toBe(0);
  });

  it('usa el costo mixto de varios lotes', () => {
    const lotes = [
      lote({ id: 'a', fecha: '2026-01-01', cantidadInicial: 1, costo: 100 }),
      lote({ id: 'b', fecha: '2026-02-01', cantidadInicial: 1, costo: 200 }),
    ];
    // 2 und a 300 = 600 ingresos, costo 300 => ganancia 300
    const g = gananciaItem({ productoId: 'p1', nombre: 'X', precio: 300, cant: 2 }, lotes);
    expect(g).toBe(300);
  });
});
