/**
 * Tests de utilidades críticas modificadas en la modernización:
 * - utils/numero: redondeo contable half-away-from-zero con épsilon relativo
 * - utils/formato: moneda con Intl.NumberFormat cacheado
 * - utils/id: genId (crypto) y clean (structuredClone con fallback)
 * - services/calculadora: evaluador mathjs (porcentajes, símbolos, seguridad)
 */
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { n, m, q, stockMinEfectivo } from '../src/utils/numero';
import { fmt, fmtCant } from '../src/utils/formato';
import { genId, clean } from '../src/utils/id';
import { evaluar, evaluarAsync, precargarEvaluador } from '../src/services/calculadora';

describe('numero: redondeo contable a 4 decimales', () => {
  it('n() parsea y devuelve 0 en entradas inválidas', () => {
    expect(n('12.5')).toBe(12.5);
    expect(n('abc')).toBe(0);
    expect(n(null)).toBe(0);
    expect(n(undefined)).toBe(0);
  });

  it('m()/q() neutralizan el error de coma flotante clásico', () => {
    expect(m(0.1 + 0.2)).toBe(0.3);
    expect(m(1.005)).toBe(1.005);
    expect(m(2.675)).toBe(2.675);
  });

  it('m() redondea half-away-from-zero (convención contable simétrica)', () => {
    expect(m(0.00005)).toBe(0.0001);
    expect(m(-0.00005)).toBe(-0.0001);
    expect(m(0.00004)).toBe(0);
    expect(m(-0.00004)).toBe(0);
  });

  it('m() mantiene precisión en magnitudes grandes (épsilon relativo)', () => {
    // Con el código anterior (EPSILON fijo), 1e9 * 10000 > 2^53 rompía el redondeo
    expect(m(1234567.89125)).toBe(1234567.8913);
    expect(m(999999999.99995)).toBeCloseTo(1000000000, 4);
  });

  it('m() sanea valores no finitos a 0', () => {
    expect(m(Infinity)).toBe(0);
    expect(m(NaN)).toBe(0);
    expect(m('no-numero')).toBe(0);
  });

  it('q() se comporta igual que m() para cantidades', () => {
    expect(q(1.23456)).toBe(1.2346);
    expect(q('2.00005')).toBe(2.0001);
  });

  it('stockMinEfectivo: 0 es válido (no avisar), solo defaultea 5 lo ausente', () => {
    expect(stockMinEfectivo(0)).toBe(0); // 0 = no avisar, NO 5
    expect(stockMinEfectivo('0')).toBe(0);
    expect(stockMinEfectivo(2)).toBe(2);
    expect(stockMinEfectivo(undefined)).toBe(5); // datos viejos
    expect(stockMinEfectivo(null)).toBe(5);
    expect(stockMinEfectivo('')).toBe(5);
    expect(stockMinEfectivo('7')).toBe(7);
    expect(stockMinEfectivo('basura')).toBe(5); // defensa final
  });
});

describe('formato: moneda Intl cacheada', () => {
  it('fmt() formatea con separador de miles y 2 decimales', () => {
    expect(fmt(1234.5)).toBe('$1,234.50');
    expect(fmt(0.1 + 0.2)).toBe('$0.30');
    expect(fmt(0)).toBe('$0.00');
    expect(fmt('2500')).toBe('$2,500.00');
  });

  it('fmt() degrada a $0.00 con entradas inválidas', () => {
    expect(fmt('abc')).toBe('$0.00');
    expect(fmt(null)).toBe('$0.00');
  });

  it('fmtCant() recorta ceros no significativos', () => {
    expect(fmtCant(3)).toBe('3');
    expect(fmtCant(2.5)).toBe('2.5');
    expect(fmtCant(1.23456)).toBe('1.2346');
  });
});

describe('id: generación y clonado', () => {
  it('genId() usa prefijo y es único en volumen', () => {
    const ids = new Set();
    for (let i = 0; i < 20000; i++) ids.add(genId('v'));
    expect(ids.size).toBe(20000);
  });

  it('genId() mantiene el formato legacy prefijo_tiempo+sufijo base36', () => {
    const id = genId('p');
    // Formato histórico: p_ + Date.now().toString(36) + sufijo (sin separador)
    expect(id).toMatch(/^p_[0-9a-z]{14,}$/);
  });

  it('clean() clona profundamente objetos anidados', () => {
    const orig = { a: 1, b: { c: [1, 2, { d: 'x' }] } };
    const clon = clean(orig);
    expect(clon).toEqual(orig);
    clon.b.c[2].d = 'modificado';
    expect(orig.b.c[2].d).toBe('x');
  });

  it('clean() preserva Date (structuredClone; JSON lo rompía a string)', () => {
    const fecha = new Date('2026-01-15T10:30:00Z');
    const clon = clean({ fecha });
    expect(clon.fecha instanceof Date).toBe(true);
    expect(clon.fecha.getTime()).toBe(fecha.getTime());
  });

  it('clean() cae a JSON ante funciones (comportamiento legacy)', () => {
    const obj = { a: 1, fn: () => 2 };
    const clon = clean(obj);
    expect(clon.a).toBe(1);
    expect(clon.fn).toBeUndefined();
  });
});

describe('calculadora: evaluador mathjs', () => {
  it('evaluar devuelve null hasta precargar (contrato async)', () => {
    expect(evaluar('2+2')).toBeNull();
  });

  it('evalúa aritmética básica con precedencia correcta', async () => {
    await precargarEvaluador();
    expect(evaluar('2+3*4')).toBe(14);
    expect(evaluar('(1+2)*5')).toBe(15);
    expect(evaluar('10/4')).toBe(2.5);
    expect(evaluar('-5+3')).toBe(-2);
  });

  it('normaliza símbolos × ÷ −', async () => {
    await precargarEvaluador();
    expect(evaluar('2×3')).toBe(6);
    expect(evaluar('10÷4')).toBe(2.5);
    expect(evaluar('5−3')).toBe(2);
  });

  it('porcentaje relacional: A ± B% y porcentaje suelto N%', async () => {
    await precargarEvaluador();
    expect(evaluar('100+10%')).toBe(110);
    expect(evaluar('100-10%')).toBe(90);
    expect(evaluar('50%')).toBe(0.5);
    expect(evaluar('200×50%')).toBe(100);
  });

  it('soporta exponente (capacidad nueva de mathjs)', async () => {
    await precargarEvaluador();
    expect(evaluar('2^10')).toBe(1024);
  });

  it('rechaza expresiones inválidas y vacías', async () => {
    await precargarEvaluador();
    expect(evaluar('')).toBeNull();
    expect(evaluar('2+*3')).toBeNull();
    expect(evaluar('constructor')).toBeNull();
    expect(evaluar('alert(1)')).toBeNull();
  });

  it('evaluarAsync precarga y evalúa en un solo paso', async () => {
    const r = await evaluarAsync('9×9');
    expect(r).toBe(81);
  });
});
