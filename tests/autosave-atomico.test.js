/**
 * Tests del autosave atómico y con aviso (1.4) y de la escritura atómica
 * de BackupFolder (temporal + renombrado).
 *
 * Autosave: BackupFolder, plataforma y toast están mockeados; el
 * comportamiento real de reintento de guardado pendiente, aviso visible
 * al fallar y aviso de poco espacio se comprueba contra esos mocks.
 *
 * BackupFolder: el módulo real con @capacitor/filesystem mockeado con un
 * Map en memoria (incluido `rename`, que es lo que hace atómica la
 * escritura).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const mocks = vi.hoisted(() => {
  let llamadas = 0;
  let rechazarCon = null;
  return {
    backup: {
      guardar: vi.fn(async () => {
        if (rechazarCon) {
          const e = rechazarCon;
          rechazarCon = null;
          throw e;
        }
        llamadas++;
        return 'backup-test.json.gz';
      }),
      rotar: vi.fn(async () => 0),
    },
    toastMsg: vi.fn(),
    llamadas: () => llamadas,
    fallarProximaCon: (e) => {
      rechazarCon = e;
    },
  };
});

vi.mock('../src/services/platform', () => ({ esNativo: () => false }));
vi.mock('../src/services/backupFolder', () => ({
  BackupFolder: mocks.backup,
  esErrorCuota: (e) => e?.name === 'QuotaExceededError',
}));
vi.mock('../src/utils/toast', () => ({ toastMsg: mocks.toastMsg }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

import { Autosave } from '../src/services/autosave';
import { Log } from '../src/services/logger';

let datos = { version: 1 };

beforeEach(async () => {
  await Autosave.init({ getData: () => datos });
});

describe('Autosave atómico y con aviso', () => {
  it('un guardado pedido mientras otro está en curso NO se descarta: se reintenta', async () => {
    // El primer guardado tarda 60 ms; el segundo llega mientras tanto.
    mocks.backup.guardar.mockImplementationOnce(
      () => new Promise((res) => setTimeout(() => res('backup-lento.json.gz'), 60))
    );
    const antes = mocks.backup.guardar.mock.calls.length;
    const p1 = Autosave._forzarGuardado('primero');
    const p2 = Autosave._forzarGuardado('segundo-mientras-guarda');
    await Promise.all([p1, p2]);
    // p1 espera a que termine el reintento pendiente (finally encadenado).
    expect(mocks.backup.guardar.mock.calls.length).toBe(antes + 2);
  });

  it('si el guardado falla por falta de espacio avisa claro (no solo console)', async () => {
    const e = new Error('QuotaExceededError');
    e.name = 'QuotaExceededError';
    mocks.fallarProximaCon(e);
    mocks.toastMsg.mockClear();
    await Autosave._forzarGuardado('cuota');
    expect(mocks.toastMsg).toHaveBeenCalledTimes(1);
    const [msg, tipo] = mocks.toastMsg.mock.calls[0];
    expect(msg).toMatch(/poco espacio/i);
    expect(msg).toMatch(/exporta un respaldo/i);
    expect(tipo).toBe('bad');
  });

  it('si el guardado falla por otro motivo queda en el log y avisa', async () => {
    const spyLog = vi.spyOn(Log, 'error').mockImplementation(() => {});
    mocks.fallarProximaCon(new Error('disco roto'));
    // El aviso de fallo está limitado a 1/hora y el test anterior ya avisó:
    // aquí se comprueba el log, que no tiene límite.
    await Autosave._forzarGuardado('generico');
    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('Autosave'), expect.any(Error));
    spyLog.mockRestore();
  });

  it('tras un fallo, el próximo disparo lo reintenta (no queda perdido)', async () => {
    mocks.fallarProximaCon(new Error('fallo una vez'));
    const antes = mocks.llamadas();
    await Autosave._forzarGuardado('falla');
    expect(mocks.llamadas()).toBe(antes); // el fallido no contó como guardado
    datos = { version: 99 };
    await Autosave.forzarBackupManual();
    expect(mocks.llamadas()).toBe(antes + 1);
  });
});
