/**
 * Tests del evaluador de la calculadora (mathjs sandboxed).
 * Cubre: aritmética básica, porcentaje relacional (A ± B%), porcentaje
 * suelto, normalización de símbolos ×÷−, paréntesis, potencia, raíz
 * (via async), lista blanca anti-inyección y contrato de carga diferida.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { evaluar, evaluarAsync, precargarEvaluador } from '../src/services/calculadora';

beforeAll(async () => {
  await precargarEvaluador();
});

describe('evaluar: aritmética básica', () => {
  it('suma, resta, multiplicación y división', () => {
    expect(evaluar('2+3')).toBe(5);
    expect(evaluar('10−4')).toBe(6);
    expect(evaluar('2×3')).toBe(6);
    expect(evaluar('10÷4')).toBe(2.5);
  });

  it('respeta precedencia y paréntesis', () => {
    expect(evaluar('2+3×4')).toBe(14);
    expect(evaluar('(2+3)×4')).toBe(20);
  });

  it('potencia y decimales', () => {
    expect(evaluar('2^3')).toBe(8);
    expect(evaluar('0.1+0.2')).toBeCloseTo(0.3, 10);
  });

  it('números negativos (símbolo − unicode)', () => {
    expect(evaluar('−5+3')).toBe(-2);
    expect(evaluar('5×−2')).toBe(-10);
  });
});

describe('evaluar: porcentajes (sintaxis pre-transformada)', () => {
  it('A + B% → A + (A * B / 100) — relacional', () => {
    expect(evaluar('100+10%')).toBe(110);
    expect(evaluar('50+50%')).toBe(75);
  });

  it('A - B% → A - (A * B / 100)', () => {
    expect(evaluar('100−10%')).toBe(90);
    expect(evaluar('200−25%')).toBe(150);
  });

  it('N% suelto → fracción', () => {
    expect(evaluar('50%')).toBe(0.5);
    expect(evaluar('150%')).toBe(1.5);
  });

  it('porcentaje anidado en expresión mayor', () => {
    // 200 + 10% = 220, luego ×2 = 440
    expect(evaluar('(200+10%)×2')).toBeCloseTo(440, 6);
  });
});

describe('evaluar: contrato defensivo', () => {
  it('vacío o espacios → null', () => {
    expect(evaluar('')).toBeNull();
    expect(evaluar('   ')).toBeNull();
  });

  it('expresión inválida → null (sin lanzar)', () => {
    expect(evaluar('2+')).toBeNull();
    expect(evaluar('(2+3')).toBeNull();
    expect(evaluar('2))((')).toBeNull();
  });

  it('lista blanca: caracteres no aritméticos → null (anti-inyección)', () => {
    expect(evaluar('alert(1)')).toBeNull();
    expect(evaluar('2;console.log(1)')).toBeNull();
    expect(evaluar('constructor')).toBeNull();
    expect(evaluar('import("fs")')).toBeNull();
    expect(evaluar('2+3e')).toBeNull();
  });

  it('resultado no-numérico → null', () => {
    // "2,3" no es válido tras normalizar (la coma no está en la lista blanca)
    expect(evaluar('2,5+1')).toBeNull();
  });
});

describe('evaluarAsync / precargarEvaluador', () => {
  it('evaluarAsync resuelve tras garantizar mathjs cargado', async () => {
    expect(await evaluarAsync('6×7')).toBe(42);
  });

  it('raíz cuadrada via mathjs', async () => {
    expect(await evaluarAsync('2^0.5')).toBeCloseTo(Math.SQRT2, 10);
  });

  it('precargarEvaluador es idempotente (segunda llamada resuelve)', async () => {
    await precargarEvaluador();
    await precargarEvaluador();
    expect(evaluar('1+1')).toBe(2);
  });
});
