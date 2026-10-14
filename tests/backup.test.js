/**
 * Tests del store de backup: validarEsquema / importarData (la vía de
 * supervivencia de datos de la app) y cargarCfg (persistencia de config).
 *
 * Regresiones cubiertas:
 * - Raíz array de un respaldo escapaba del typeof 'object' (error confuso).
 * - cfg.value se REEMPLAZABA (spread) tras capturar la referencia →
 *   referencias huérfanas (App.vue, storeToRefs) y pérdida de cambios.
 * - Valor corrupto de cfg en BD (string/array) contaminaba el objeto vivo.
 * - Import inválido NO debe borrar los datos existentes.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { useBackupStore } from '../src/stores/useBackupStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useProductosStore } from '../src/stores/useProductosStore';
import { db } from '../src/db';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validarEsquema', () => {
  it('rechaza raíz null o primitiva', () => {
    const b = useBackupStore();
    for (const mala of [null, undefined, 42, 'texto', true]) {
      const r = b.validarEsquema(mala);
      expect(r.ok).toBe(false);
      expect(r.errores[0]).toContain('no es un objeto valido');
    }
  });

  it('rechaza un array como raíz (regresión: typeof array === "object")', () => {
    const b = useBackupStore();
    const r = b.validarEsquema([{ id: 'x' }]);
    expect(r.ok).toBe(false);
    expect(r.errores).toContain('El archivo no es un objeto valido');
  });

  it('rechaza si faltan productos y ventas (no parece un respaldo)', () => {
    const b = useBackupStore();
    const r = b.validarEsquema({ compras: [{ id: 'c1' }] });
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('Falta productos y ventas');
  });

  it('rechaza cfg que no es un objeto plano', () => {
    const b = useBackupStore();
    for (const cfgMala of ['x', 7, [{ a: 1 }]]) {
      const r = b.validarEsquema({ productos: [{ id: 'p1' }], cfg: cfgMala });
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toContain('"cfg" no es un objeto');
    }
    // cfg ausente o objeto válido: sin ese error
    expect(b.validarEsquema({ productos: [{ id: 'p1' }] }).ok).toBe(true);
    expect(b.validarEsquema({ productos: [], cfg: { nombre: 'X' } }).ok).toBe(true);
  });

  it('rechaza tablas que no son array e items sin id', () => {
    const b = useBackupStore();
    const r = b.validarEsquema({ productos: 'no-array', ventas: [{ total: 5 }] });
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('"productos" no es un array');
    expect(r.errores.join(' ')).toContain('item(s) sin id');
  });

  it('rechaza respaldos mayores a 50MB', () => {
    const b = useBackupStore();
    const r = b.validarEsquema({
      productos: [{ id: 'p1', nota: 'a'.repeat(51 * 1024 * 1024) }],
    });
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toContain('demasiado grande');
  });

  it('acepta un respaldo mínimo válido y avisa versiones antiguas', () => {
    const b = useBackupStore();
    const ok = b.validarEsquema({ productos: [{ id: 'p1' }], version: 9 });
    expect(ok.ok).toBe(true);
    expect(ok.errores).toHaveLength(0);

    const viejo = b.validarEsquema({ productos: [{ id: 'p1' }], version: 4 });
    expect(viejo.ok).toBe(true);
    expect(viejo.avisos.join(' ')).toContain('version antigua');
  });
});

describe('importarData', () => {
  it('restaura datos válidos y recarga los stores', async () => {
    const b = useBackupStore();
    await b.importarData({
      productos: [{ id: 'p_1', nombre: 'Café', precio: 25 }],
      ventas: [{ id: 'v_1', items: [{ productoId: 'p_1', cantidad: 1 }], total: 25 }],
    });
    const productos = useProductosStore();
    expect(await db.productos.get('p_1')).toBeTruthy();
    expect(productos.productos.some((p) => p.id === 'p_1')).toBe(true);
  });

  it('aplica la cfg del respaldo SIN romper la referencia capturada (regresión huérfana)', async () => {
    const configStore = useConfigStore();
    const cfgViva = configStore.cfg; // referencia capturada como hace App.vue/storeToRefs
    const b = useBackupStore();
    await b.importarData({
      productos: [{ id: 'p_1' }],
      cfg: { nombre: 'Tienda Del Sol', tema: 'dark' },
    });
    expect(configStore.cfg.nombre).toBe('Tienda Del Sol');
    expect(configStore.cfg.tema).toBe('dark');
    // La MISMA identidad: si el store reemplazó el objeto, esta referencia
    // quedó huérfana y los cambios posteriores no se persistirían.
    expect(cfgViva).toBe(configStore.cfg);
    // Un cambio a través de la referencia capturada debe verse en el store
    cfgViva.tema = 'light';
    expect(configStore.cfg.tema).toBe('light');
  });

  it('datos inválidos → error y NO borra los datos existentes', async () => {
    // Sembrar un producto real
    await db.productos.put({ id: 'p_real', nombre: 'Leche' });
    const b = useBackupStore();
    await expect(b.importarData({ compras: 'basura' })).rejects.toThrow('Datos invalidos');
    // El dato original sigue intacto
    expect(await db.productos.get('p_real')).toBeTruthy();
  });

  it('rollback automático si la transacción falla a mitad', async () => {
    await db.productos.put({ id: 'p_real', nombre: 'Leche' });
    const b = useBackupStore();
    // OJO: importarData usa db.table(t), que es una instancia DISTINTA a
    // db.productos (dos wrappers del mismo IDB). Espiar la que se usa.
    const spy = vi.spyOn(db.table('productos'), 'bulkPut').mockRejectedValueOnce(new Error('boom'));
    await expect(b.importarData({ productos: [{ id: 'p_nuevo' }], ventas: [{ id: 'v_1' }] })).rejects.toThrow(
      'rollback'
    );
    expect(spy).toHaveBeenCalled();
    // El snapshot pre-import se restauró: el producto original sigue y el nuevo no entró
    expect(await db.productos.get('p_real')).toBeTruthy();
    expect(await db.productos.get('p_nuevo')).toBeFalsy();
  });
});

describe('cargarCfg', () => {
  it('mezcla la cfg guardada sobre los defaults sin perder claves', async () => {
    const configStore = useConfigStore();
    await db.config.put({ key: 'cfg', value: { nombre: 'La Bodega', umbralBackupDias: 3 } });
    await configStore.cargarCfg();
    expect(configStore.cfg.nombre).toBe('La Bodega');
    expect(configStore.cfg.umbralBackupDias).toBe(3);
    // Defaults intactos para claves no guardadas
    expect(configStore.cfg.stockMinDefault).toBe(5);
    expect(configStore.cfg.mostrarSplash).toBe(true);
  });

  it('mantiene viva la referencia capturada (regresión del fix crítico)', async () => {
    const configStore = useConfigStore();
    const cfgViva = configStore.cfg;
    await db.config.put({ key: 'cfg', value: { nombre: 'Otra' } });
    await configStore.cargarCfg();
    expect(cfgViva).toBe(configStore.cfg);
    expect(cfgViva.nombre).toBe('Otra');
    // toggleTema muta cfg.value: con la referencia rota el watch de App.vue
    // seguiría mirando el objeto viejo
    configStore.toggleTema();
    expect(cfgViva.tema).toBe('dark');
    const guardada = await db.config.get('cfg');
    expect(guardada.value.tema).toBe('dark');
  });

  it('valor corrupto (string) en BD → no rompe ni contamina cfg', async () => {
    const configStore = useConfigStore();
    await db.config.put({ key: 'cfg', value: 'chatarra' });
    await expect(configStore.cargarCfg()).resolves.toBeUndefined();
    expect(configStore.cfg.nombre).toBe('Tienda Pro'); // default
    expect(Object.keys(configStore.cfg).some((k) => /^\d+$/.test(k))).toBe(false);
  });

  it('valor corrupto (array) en BD → no rompe ni contamina cfg', async () => {
    const configStore = useConfigStore();
    await db.config.put({ key: 'cfg', value: [{ nombre: 'X' }] });
    await expect(configStore.cargarCfg()).resolves.toBeUndefined();
    expect(configStore.cfg.nombre).toBe('Tienda Pro');
    expect(configStore.cfg[0]).toBeUndefined();
  });
});
