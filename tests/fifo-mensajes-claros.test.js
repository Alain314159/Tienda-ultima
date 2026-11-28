/**
 * Tests de los mensajes de error en lenguaje claro (MEJORAS 2.6):
 * FIFO ya no vuelca «No hay lotes disponibles» ni «Stock insuficiente»,
 * sino mensajes en español que dicen qué pasa y qué hacer.
 */
import { describe, it, expect } from 'vitest';
import { calcFIFO } from '../src/services/fifo';

describe('calcFIFO: errores en lenguaje claro', () => {
  it('producto sin lotes: dice que no hay stock suficiente', () => {
    const r = calcFIFO('p_1', 1, []);
    expect(r.error).toBe('No hay stock suficiente de este producto');
    expect(r.lotesUsados).toEqual([]);
    expect(r.costoTotal).toBe(0);
  });

  it('lotes con stock 0: mismo mensaje claro', () => {
    const r = calcFIFO(
      'p_1',
      1,
      [{ id: 'l_1', productoId: 'p_1', cantidadInicial: 5, cantidadVendida: 5, costo: 10, fecha: '2026-10-01' }]
    );
    expect(r.error).toBe('No hay stock suficiente de este producto');
  });

  it('cantidad mayor que el stock: dice que no alcanza e invita a pedir menos', () => {
    const r = calcFIFO(
      'p_1',
      9,
      [{ id: 'l_1', productoId: 'p_1', cantidadInicial: 4, cantidadVendida: 0, costo: 10, fecha: '2026-10-01' }]
    );
    expect(r.error).toContain('No hay stock suficiente para esa cantidad');
    expect(r.error).toContain('menos unidades');
    expect(r.lotesUsados).toEqual([]);
  });

  it('sin error: el cálculo FIFO no cambia', () => {
    const r = calcFIFO(
      'p_1',
      3,
      [{ id: 'l_1', productoId: 'p_1', cantidadInicial: 4, cantidadVendida: 0, costo: 10, fecha: '2026-10-01' }]
    );
    expect(r.error).toBeNull();
    expect(r.costoTotal).toBe(30);
    expect(r.lotesUsados).toEqual([{ loteId: 'l_1', cantidad: 3, costo: 10 }]);
  });
});
