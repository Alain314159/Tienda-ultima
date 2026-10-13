/**
 * Tests de los schemas Zod y del helper validar():
 * validación de formularios de productos/compras/gastos/socios/retiros.
 */
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { productoSchema, compraSchema, gastoSchema, socioSchema, retiroSchema, validar } from '../src/schemas';

describe('productoSchema', () => {
  it('acepta un producto válido y aplica defaults', () => {
    const r = productoSchema.parse({ nombre: 'Café', precio: 150 });
    expect(r.nombre).toBe('Café');
    expect(r.precio).toBe(150);
    expect(r.stockMin).toBe(5);
    expect(r.nota).toBe('');
    expect(r.preciosEscalonados).toEqual([]);
    expect(r.empaques).toEqual([]);
  });

  it('coercea números desde string (input de formulario)', () => {
    const r = productoSchema.parse({ nombre: 'Café', precio: '150.5', stockMin: '3' });
    expect(r.precio).toBe(150.5);
    expect(r.stockMin).toBe(3);
  });

  it('rechaza nombre vacío y precio no positivo', () => {
    expect(productoSchema.safeParse({ nombre: '   ', precio: 10 }).success).toBe(false);
    expect(productoSchema.safeParse({ nombre: 'X', precio: 0 }).success).toBe(false);
    expect(productoSchema.safeParse({ nombre: 'X', precio: -1 }).success).toBe(false);
  });

  it('rechaza stockMin negativo', () => {
    expect(productoSchema.safeParse({ nombre: 'X', precio: 1, stockMin: -2 }).success).toBe(false);
  });

  it('valida estructura de precios escalonados y empaques', () => {
    const ok = productoSchema.safeParse({
      nombre: 'X',
      precio: 1,
      preciosEscalonados: [{ min: 10, precio: 90 }],
      empaques: [{ nombre: 'caja', unidades: 12 }],
    });
    expect(ok.success).toBe(true);

    const mal = productoSchema.safeParse({
      nombre: 'X',
      precio: 1,
      preciosEscalonados: [{ min: 'abc', precio: 1 }],
    });
    expect(mal.success).toBe(false);
  });
});

describe('compraSchema / gastoSchema', () => {
  it('compra válida con coerción', () => {
    const r = compraSchema.parse({ productoId: 'p1', cantidad: '5', costo: '20' });
    expect(r).toEqual({ productoId: 'p1', cantidad: 5, costo: 20 });
  });

  it('compra sin producto o con cantidad 0 se rechaza', () => {
    expect(compraSchema.safeParse({ productoId: '', cantidad: 1, costo: 1 }).success).toBe(false);
    expect(compraSchema.safeParse({ productoId: 'p1', cantidad: 0, costo: 1 }).success).toBe(false);
  });

  it('gasto requiere categoría, concepto y monto > 0', () => {
    expect(gastoSchema.safeParse({ categoria: 'Servicios', concepto: 'Luz', monto: 100 }).success).toBe(true);
    expect(gastoSchema.safeParse({ categoria: '', concepto: 'Luz', monto: 100 }).success).toBe(false);
    expect(gastoSchema.safeParse({ categoria: 'S', concepto: '', monto: 100 }).success).toBe(false);
    expect(gastoSchema.safeParse({ categoria: 'S', concepto: 'Luz', monto: 0 }).success).toBe(false);
  });
});

describe('socioSchema / retiroSchema', () => {
  it('socio con porcentaje en rango 0-100', () => {
    expect(socioSchema.safeParse({ nombre: 'Ana', porcentaje: 50, aporte: 1000 }).success).toBe(true);
    expect(socioSchema.safeParse({ nombre: 'Ana', porcentaje: 101, aporte: 1000 }).success).toBe(false);
    expect(socioSchema.safeParse({ nombre: 'Ana', porcentaje: -1, aporte: 1000 }).success).toBe(false);
    expect(socioSchema.safeParse({ nombre: '', porcentaje: 50, aporte: 1000 }).success).toBe(false);
  });

  it('retiro con monto positivo y concepto opcional', () => {
    const r = retiroSchema.parse({ monto: '500' });
    expect(r.monto).toBe(500);
    expect(r.concepto).toBe('');
    expect(retiroSchema.safeParse({ monto: 0 }).success).toBe(false);
  });
});

describe('validar(): contrato {ok, data, error}', () => {
  it('devuelve ok:true y los datos parseados', () => {
    const r = validar(gastoSchema, { categoria: 'A', concepto: 'B', monto: '10' });
    expect(r.ok).toBe(true);
    expect(r.data.monto).toBe(10);
    expect(r.error).toBeUndefined();
  });

  it('devuelve ok:false con el primer mensaje de error legible', () => {
    const r = validar(productoSchema, { nombre: '', precio: -5 });
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
    expect(r.data).toBeUndefined();
  });
});
