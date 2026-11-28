/**
 * Tests de importación segura (1.2 / 1.9) y estados de carga (2.9).
 *
 * - Importar un respaldo NUNCA cambia el PIN ni pinActivo, y la cfg se
 *   valida campo a campo: lo inválido se ignora con aviso sin romper la
 *   importación de los datos.
 * - El respaldo cifrado exige un mínimo de iteraciones PBKDF2 y limita los
 *   intentos de contraseña (5, con espera de 1 minuto).
 * - El export plano no incluye el PIN (datosDeStores lo excluye).
 * - Los flags exportando/importando se encienden durante la operación y se
 *   apagan al terminar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { useBackupStore } from '../src/stores/useBackupStore';
import {
  sanearCfgImportada,
  validarIteracionesKdf,
  puedeIntentarClave,
  registrarClaveFallida,
  reiniciarIntentosClave,
  intentosClaveRestantes,
  MAX_INTENTOS_CLAVE_RESPALDO,
} from '../src/stores/useBackupStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { datosDeStores } from '../src/stores/exportar';
import { hashPin, verificarPin } from '../src/services/pin';
import { db } from '../src/db';

beforeEach(async () => {
  setActivePinia(createPinia());
  reiniciarIntentosClave();
  await db.config.clear();
  for (const t of ['productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja', 'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos', 'pasivos', 'auditorias']) {
    await db.table(t).clear();
  }
});

const respaldoMinimo = (cfg) => ({
  version: 10,
  fecha: '2026-11-27T12:00:00.000Z',
  cfg,
  productos: [{ id: 'p1', nombre: 'Arroz' }],
  ventas: [
    {
      id: 'v1',
      fecha: '2026-11-27T12:00:00.000Z',
      items: [{ nombre: 'Arroz', precio: 10, cantidad: 1, costo: 5 }],
      total: 10,
    },
  ],
  lotes: [],
  compras: [],
  ajustes: [],
  arqueos: [],
  movCaja: [],
  cierres: [],
  capital: [],
  retiros: [],
  socios: [],
  distribuciones: [],
  gastos: [],
  pasivos: [],
  auditorias: [],
  asientos: [],
});

describe('sanearCfgImportada', () => {
  it('nunca importa pin ni pinActivo, y lo avisa', () => {
    const { cfg, avisos } = sanearCfgImportada({ pin: 'pbkdf2$600000$xxx$yyy', pinActivo: false });
    expect(cfg).not.toHaveProperty('pin');
    expect(cfg).not.toHaveProperty('pinActivo');
    expect(avisos.join(' ')).toMatch(/PIN/i);
  });

  it('conserva los campos válidos con sus tipos', () => {
    const { cfg, avisos } = sanearCfgImportada({
      nombre: 'Mi Tienda',
      tema: 'dark',
      fontScale: 1.2,
      capitalInicial: 100,
      periodoInicio: '2026-01-01T00:00:00.000Z',
      busquedaGlobalActiva: false,
      umbralDescuentoPct: 20,
      stockMinDefault: 3,
      horaArqueo: '18:30',
      anomaliasDescartadas: ['a', 'b'],
      graficoVista: 'semana',
      ultimoExport: '2026-11-26T10:00:00.000Z',
    });
    expect(avisos).toEqual([]);
    expect(cfg).toMatchObject({
      nombre: 'Mi Tienda',
      tema: 'dark',
      fontScale: 1.2,
      capitalInicial: 100,
      umbralDescuentoPct: 20,
      horaArqueo: '18:30',
      graficoVista: 'semana',
    });
  });

  it('ignora con aviso cada campo inválido (tipo o rango)', () => {
    const { cfg, avisos } = sanearCfgImportada({
      tema: 'rosa',
      fontScale: 9,
      capitalInicial: -5,
      periodoInicio: 'no-es-fecha',
      umbralDescuentoPct: 150,
      stockMinDefault: 'mucho',
      busquedaGlobalActiva: 'si',
      horaArqueo: '25:99',
      anomaliasDescartadas: ['ok', 42],
      graficoVista: 'decada',
      campoDesconocido: true,
    });
    expect(cfg).toEqual({});
    expect(avisos.length).toBeGreaterThanOrEqual(10);
  });

  it('cfg que no es un objeto devuelve vacío sin romper', () => {
    expect(sanearCfgImportada(null).cfg).toEqual({});
    expect(sanearCfgImportada('texto').cfg).toEqual({});
    expect(sanearCfgImportada([1, 2]).cfg).toEqual({});
  });
});

describe('importarData no toca el PIN y sanea la cfg', () => {
  it('un respaldo con PIN distinto y pinActivo=false no cambia el PIN local', async () => {
    const configStore = useConfigStore();
    await configStore.cargarCfg();
    configStore.cfg.pin = await hashPin('1234');
    configStore.cfg.pinActivo = true;
    configStore.cfg.nombreTienda = 'Mi Tienda';
    await configStore.guardarCfg();

    const b = useBackupStore();
    const respaldo = respaldoMinimo({
      pin: await hashPin('0000'),
      pinActivo: false,
      nombreTienda: 'Tienda Atacante',
      fontScale: 9,
      tema: 'dark',
    });
    await b.importarData(respaldo);

    expect(await verificarPin('1234', configStore.cfg.pin)).toBe(true);
    expect(await verificarPin('0000', configStore.cfg.pin)).toBe(false);
    expect(configStore.cfg.pinActivo).toBe(true);
    // Lo válido sí se importa; lo inválido se ignora
    expect(configStore.cfg.nombreTienda).toBe('Tienda Atacante');
    expect(configStore.cfg.tema).toBe('dark');
    expect(configStore.cfg.fontScale).toBe(1);
    // Y en IndexedDB tampoco quedó el PIN del archivo
    const guardado = await db.config.get('cfg');
    expect(await verificarPin('1234', guardado.value.pin)).toBe(true);
  });

  it('validarEsquema avisa de la cfg que se ignorará, sin rechazar el archivo', () => {
    const b = useBackupStore();
    const r = b.validarEsquema(
      respaldoMinimo({ pin: 'x', pinActivo: true, fontScale: 9 })
    );
    expect(r.ok).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/PIN/i);
  });
});

describe('validarIteracionesKdf (mínimo PBKDF2 al importar)', () => {
  it('rechaza iteraciones por debajo del mínimo (fuerza bruta trivial)', () => {
    for (const iter of [1, 1000, 99999]) {
      const r = validarIteracionesKdf(iter);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/débiles|mínimo/);
    }
  });

  it('acepta los valores de los respaldos propios (100k v1, 600k v2)', () => {
    expect(validarIteracionesKdf(100000).ok).toBe(true);
    expect(validarIteracionesKdf(600000).ok).toBe(true);
  });

  it('rechaza valores no numéricos o excesivos (DoS derivando la clave)', () => {
    expect(validarIteracionesKdf(undefined).ok).toBe(false);
    expect(validarIteracionesKdf('600000').ok).toBe(false);
    expect(validarIteracionesKdf(NaN).ok).toBe(false);
    expect(validarIteracionesKdf(3_000_000).ok).toBe(false);
  });
});

describe('límite de intentos de contraseña del respaldo cifrado', () => {
  it('empieza con 5 intentos disponibles', () => {
    expect(puedeIntentarClave()).toEqual({ ok: true, esperaMs: 0 });
    expect(intentosClaveRestantes()).toBe(MAX_INTENTOS_CLAVE_RESPALDO);
  });

  it('al 5.º fallo se bloquea; reiniciar lo limpia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00'));
    for (let i = 0; i < 4; i++) {
      registrarClaveFallida();
      expect(puedeIntentarClave().ok).toBe(true);
    }
    expect(intentosClaveRestantes()).toBe(1);
    registrarClaveFallida();
    const bloqueo = puedeIntentarClave();
    expect(bloqueo.ok).toBe(false);
    expect(bloqueo.esperaMs).toBeGreaterThan(0);
    expect(bloqueo.esperaMs).toBeLessThanOrEqual(60_000);
    // La espera caduca sola
    vi.setSystemTime(new Date('2026-11-27T12:01:01'));
    expect(puedeIntentarClave().ok).toBe(true);
    vi.useRealTimers();
    reiniciarIntentosClave();
    expect(intentosClaveRestantes()).toBe(MAX_INTENTOS_CLAVE_RESPALDO);
  });
});

describe('el export plano no incluye el PIN', () => {
  it('datosDeStores devuelve cfg sin pin ni pinActivo', async () => {
    const configStore = useConfigStore();
    await configStore.cargarCfg();
    configStore.cfg.pin = await hashPin('1234');
    configStore.cfg.pinActivo = true;
    const d = await datosDeStores();
    expect(d.cfg).not.toHaveProperty('pin');
    expect(d.cfg).not.toHaveProperty('pinActivo');
    expect(JSON.stringify(d)).not.toContain('pbkdf2');
  });
});

describe('estados de carga exportar/importar (2.9)', () => {
  it('los flags empiezan apagados', () => {
    const b = useBackupStore();
    expect(b.exportando).toBe(false);
    expect(b.importando).toBe(false);
  });

  it('importando se enciende durante importarData y se apaga al terminar', async () => {
    const b = useBackupStore();
    const p = b.importarData(respaldoMinimo({ nombreTienda: 'X' }));
    expect(b.importando).toBe(true);
    await p;
    expect(b.importando).toBe(false);
  });

  it('importando se apaga aunque la importación falle', async () => {
    const b = useBackupStore();
    await expect(b.importarData({ productos: [{ id: 'p1' }] })).rejects.toThrow();
    expect(b.importando).toBe(false);
  });

  it('exportando se enciende durante exportar y se apaga al terminar', async () => {
    const b = useBackupStore();
    const p = b.exportar();
    expect(b.exportando).toBe(true);
    await p;
    expect(b.exportando).toBe(false);
  });
});
