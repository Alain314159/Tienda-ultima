/**
 * Tests de la previsualización de importación (stores/importacion.ts):
 * - crearPreview: conteos por tabla, etiquetas, fallbacks de fecha/tienda
 * - usarStores: conteos actuales desde los stores activos
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { crearPreview, usarStores } from '../src/stores/importacion';
import { useProductosStore } from '../src/stores/useProductosStore';
import { useLotesStore } from '../src/stores/useLotesStore';
import { useVentasStore } from '../src/stores/useVentasStore';
import { useComprasStore } from '../src/stores/useComprasStore';
import { useGastosStore } from '../src/stores/useGastosStore';
import { useCapitalStore } from '../src/stores/useCapitalStore';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('crearPreview', () => {
  const respaldoLleno = {
    productos: [{ id: 'p_1' }, { id: 'p_2' }],
    lotes: [{ id: 'l_1' }, { id: 'l_2' }, { id: 'l_3' }],
    ventas: [],
    compras: [{ id: 'c_1' }],
    gastos: [{ id: 'g_1' }, { id: 'g_2' }],
    socios: [{ id: 's_1' }, { id: 's_2' }, { id: 's_3' }],
    asientos: [{ id: 'as_1' }],
    pasivos: [],
    fecha: '2026-10-01T10:00:00.000Z',
    cfg: { nombre: 'Mi Tienda' },
  };

  it('cuenta los registros nuevos por tabla', () => {
    const prev = crearPreview(respaldoLleno, { productos: 5, lotes: 0 });
    expect(prev.nuevos).toEqual({
      productos: 2,
      lotes: 3,
      ventas: 0,
      compras: 1,
      gastos: 2,
      socios: 3,
      asientos: 1,
      pasivos: 0,
    });
  });

  it('expone las 8 tablas con sus etiquetas y el archivo completo', () => {
    const prev = crearPreview(respaldoLleno, {});
    expect(prev.campos.map((c) => c.key)).toEqual([
      'productos',
      'lotes',
      'ventas',
      'compras',
      'gastos',
      'socios',
      'asientos',
      'pasivos',
    ]);
    expect(prev.archivo).toBe(respaldoLleno);
    expect(prev.actuales).toEqual({});
  });

  it('fallbacks: fecha null y tienda "(sin nombre)" cuando faltan', () => {
    const prev = crearPreview({ productos: [] }, {});
    expect(prev.fechaArchivo).toBeNull();
    expect(prev.tiendaArchivo).toBe('(sin nombre)');
  });

  it('tablas ausentes en el respaldo cuentan como 0 (no explotan)', () => {
    const prev = crearPreview({ fecha: '2026-10-02', cfg: { nombre: 'X' } }, {});
    expect(prev.nuevos.productos).toBe(0);
    expect(prev.nuevos.ventas).toBe(0);
    expect(prev.fechaArchivo).toBe('2026-10-02');
    expect(prev.tiendaArchivo).toBe('X');
  });
});

describe('usarStores', () => {
  it('devuelve los conteos actuales de los 6 stores', () => {
    useProductosStore().productos = [{ id: 'a' }, { id: 'b' }];
    useLotesStore().lotes = [{ id: 'l' }];
    useVentasStore().ventas = [];
    useComprasStore().compras = [{ id: 'c' }, { id: 'c2' }, { id: 'c3' }];
    useGastosStore().gastos = [{ id: 'g' }];
    useCapitalStore().socios = [];

    expect(usarStores()).toEqual({
      productos: 2,
      lotes: 1,
      ventas: 0,
      compras: 3,
      gastos: 1,
      socios: 0,
    });
  });
});
