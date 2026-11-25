import { describe, it, expect } from 'vitest';
import { n, m, q } from '../src/utils/numero';
import { fmt, fmtCant, fmtFecha, fmtFH } from '../src/utils/formato';
import { genId, clean } from '../src/utils/id';

describe('n() - parsing numerico', () => {
  it('parsea numeros', () => {
    expect(n(5)).toBe(5);
    expect(n('3.14')).toBe(3.14);
    expect(n('abc')).toBe(0);
    expect(n(null)).toBe(0);
    expect(n(undefined)).toBe(0);
    expect(n('')).toBe(0);
    expect(n('  7  ')).toBe(7);
  });
});

describe('m() - redondeo a 4 decimales', () => {
  it('redondea correctamente', () => {
    expect(m(1.23456789)).toBe(1.2346);
    expect(m(0.1 + 0.2)).toBe(0.3);
    expect(m(100.99999)).toBe(101);
    expect(m(-1.23456789)).toBe(-1.2346);
    expect(m('5.123456')).toBe(5.1235);
  });

  it('evita drift de flotantes', () => {
    let suma = 0;
    for (let i = 0; i < 100; i++) suma = m(suma + 0.01);
    expect(suma).toBe(1);
  });
});

describe('q() - redondeo cantidades', () => {
  it('redondea a 4 decimales', () => {
    expect(q(1.23456)).toBe(1.2346);
    expect(q(0.333333)).toBe(0.3333);
  });
});

describe('fmt() - formato moneda', () => {
  it('formatea con 2 decimales', () => {
    expect(fmt(1234.5)).toBe('$1,234.50');
    expect(fmt(0)).toBe('$0.00');
    expect(fmt('abc')).toBe('$0.00');
    expect(fmt(null)).toBe('$0.00');
  });
});

describe('fmtCant() - formato cantidad', () => {
  it('muestra enteros sin decimales', () => {
    expect(fmtCant(5)).toBe('5');
    expect(fmtCant(100)).toBe('100');
  });

  it('muestra decimales recortados', () => {
    expect(fmtCant(1.5)).toBe('1.5');
    expect(fmtCant(0.25)).toBe('0.25');
    expect(fmtCant(1.2345)).toBe('1.2345');
  });

  it('maneja NaN', () => {
    expect(fmtCant('abc')).toBe('0');
    expect(fmtCant(null)).toBe('0');
  });
});

describe('fmtFecha() - fecha corta', () => {
  it('formatea DD/MM/YY', () => {
    expect(fmtFecha('2026-09-13T10:00:00')).toBe('13/09/26');
    expect(fmtFecha('2026-01-05T00:00:00')).toBe('05/01/26');
  });
});

describe('fmtFH() - fecha con hora', () => {
  it('formatea DD/MM/YY HH:MM', () => {
    const r = fmtFH('2026-09-13T14:30:00');
    expect(r).toMatch(/^13\/09\/26 \d{2}:\d{2}$/);
  });
});

describe('genId() - IDs unicos', () => {
  it('genera IDs con prefijo', () => {
    expect(genId('v')).toMatch(/^v_/);
    expect(genId('lote')).toMatch(/^lote_/);
  });

  it('no colisiona en 1000 IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(genId('t'));
    expect(ids.size).toBe(1000);
  });
});

describe('clean() - limpieza de objetos', () => {
  it('elimina undefined', () => {
    const r = clean({ a: 1, b: undefined, c: null });
    expect(r).toEqual({ a: 1, c: null });
    expect('b' in r).toBe(false);
  });

  it('clona profundamente', () => {
    const obj = { a: { b: { c: 1 } } };
    const clon = clean(obj);
    clon.a.b.c = 999;
    expect(obj.a.b.c).toBe(1);
  });
});

describe('datosDeStores() - exportacion', () => {
  it('incluye todas las tablas leyendo de los stores', async () => {
    const { setActivePinia, createPinia } = await import('pinia');
    setActivePinia(createPinia());
    const { datosDeStores } = await import('../src/stores/exportar');
    const data = datosDeStores();
    expect(data.version).toBe(9);
    expect(Array.isArray(data.productos)).toBe(true);
    expect(Array.isArray(data.ventas)).toBe(true);
    expect(Array.isArray(data.gastos)).toBe(true);
    expect(Array.isArray(data.pasivos)).toBe(true);
    expect(data.fecha).toBeTruthy();
  });
});
