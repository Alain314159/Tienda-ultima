/**
 * Tests de useStorageInfo — antes 22.7% cubierto.
 * Cubre: concesión/denegación de persistencia, umbral de contenido mínimo
 * (no pedir en primera visita), estimación de uso/cuota, fmtBytes y clases
 * de color por porcentaje.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { useStorageInfo } from '../src/composables/useStorageInfo';
import { useVentasStore } from '../src/stores/useVentasStore';

function mockStorage({ persisted = false, persistOk = true, usage = 0, quota = 0, conPersist = true } = {}) {
  const storage = {
    persisted: vi.fn(async () => persisted),
    estimate: vi.fn(async () => ({ usage, quota })),
  };
  if (conPersist) storage.persist = vi.fn(async () => persistOk);
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
  return storage;
}

beforeEach(async () => {
  setActivePinia(createPinia());
  await db.ventas.clear();
});

describe('pedirPersistenciaStorage', () => {
  it('con contenido suficiente pide persistencia y la registra', async () => {
    await db.ventas.bulkPut([{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);
    const v = useVentasStore();
    await v.cargarVentas();
    const storage = mockStorage({ persistOk: true });
    const { storagePersistente, pedirPersistenciaStorage } = useStorageInfo();
    const ok = await pedirPersistenciaStorage();
    expect(ok).toBe(true);
    expect(storagePersistente.value).toBe(true);
    expect(storage.persist).toHaveBeenCalled();
  });

  it('sin contenido suficiente NO pide persistencia (primera visita)', async () => {
    const storage = mockStorage({ persistOk: true });
    const { pedirPersistenciaStorage } = useStorageInfo();
    const ok = await pedirPersistenciaStorage();
    expect(ok).toBe(false);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('si ya es persistente no vuelve a pedir', async () => {
    const storage = mockStorage({ persisted: true });
    const { storagePersistente, pedirPersistenciaStorage } = useStorageInfo();
    expect(await pedirPersistenciaStorage()).toBe(true);
    expect(storagePersistente.value).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('denegación devuelve false', async () => {
    await db.ventas.bulkPut([{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }]);
    const v = useVentasStore();
    await v.cargarVentas();
    mockStorage({ persistOk: false });
    const { storagePersistente, pedirPersistenciaStorage } = useStorageInfo();
    expect(await pedirPersistenciaStorage()).toBe(false);
    expect(storagePersistente.value).toBe(false);
  });

  it('sin API de storage.persist degrada sin romper', async () => {
    mockStorage({ conPersist: false });
    const { pedirPersistenciaStorage } = useStorageInfo();
    expect(await pedirPersistenciaStorage()).toBe(false);
  });
});

describe('actualizarInfoStorage + formato', () => {
  it('estima uso/cuota y calcula porcentaje', async () => {
    mockStorage({ usage: 250 * 1024 * 1024, quota: 1024 * 1024 * 1024, persisted: true });
    const { storageInfo, actualizarInfoStorage, storagePersistente } = useStorageInfo();
    await actualizarInfoStorage();
    expect(storageInfo.value.uso).toBe(262144000);
    expect(storageInfo.value.porcentaje).toBeCloseTo(24.41, 1);
    expect(storagePersistente.value).toBe(true);
  });

  it('fmtBytes formatea unidades crecientes', async () => {
    const { fmtBytes } = useStorageInfo();
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fmtBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('storageClase colorea por uso: ok < warn < bad', async () => {
    const { storageInfo, storageClase } = useStorageInfo();
    storageInfo.value.porcentaje = 10;
    expect(storageClase.value).toBe('ok');
    storageInfo.value.porcentaje = 55;
    expect(storageClase.value).toBe('warn');
    storageInfo.value.porcentaje = 90;
    expect(storageClase.value).toBe('bad');
  });
});
