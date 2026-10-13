/**
 * Tests del servicio de autosave (services/autosave.ts):
 * - guarda tras 10 operaciones (y no antes)
 * - hash sin cambios no gasta I/O; con cambios sí
 * - guardado forzado y verificación al arranque
 * - info() expone el estado interno
 * BackupFolder y la plataforma están mockeados (ruta web + sin Capacitor).
 *
 * Nota: el estado del módulo (contador, hash) es acumulativo entre tests,
 * pero Vitest limpia el historial de los mocks entre tests, así que el
 * conteo de backups se lleva con un contador propio dentro del mock.
 */
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let guardados = 0;
  let ultimo = undefined;
  return {
    backup: {
      guardar: vi.fn(async (data) => {
        guardados++;
        ultimo = data;
        return 'backup-2026-10-14.json.gz';
      }),
      rotar: vi.fn(async () => {}),
    },
    addListener: vi.fn(),
    cuenta: () => guardados,
    ultimoGuardado: () => ultimo,
  };
});

vi.mock('../src/services/platform', () => ({ esNativo: () => false }));
vi.mock('../src/services/backupFolder', () => ({ BackupFolder: mocks.backup }));
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.addListener } }));

import { Autosave } from '../src/services/autosave';

// Estado del módulo con closures vivos: la secuencia de tests es acumulativa
// (clearAllMocks resetearía los conteos entre tests y rompería la verificación).
let datos = { version: 1 };

describe('Autosave (secuencia acumulativa)', () => {
  it('init registra getData y no guarda nada por sí solo', async () => {
    await Autosave.init({ getData: () => datos });
    expect(mocks.cuenta()).toBe(0);
    expect(mocks.addListener).not.toHaveBeenCalled(); // esNativo false: sin listener nativo
  });

  it('9 operaciones no disparan backup; la 10ª sí (con rotación de 30)', async () => {
    for (let i = 0; i < 9; i++) Autosave.notificarOperacion();
    expect(mocks.cuenta()).toBe(0);

    Autosave.notificarOperacion(); // op 10
    await vi.waitFor(() => expect(mocks.cuenta()).toBe(1));
    expect(mocks.ultimoGuardado()).toEqual(datos);
    expect(mocks.backup.rotar).toHaveBeenCalledWith(30);
  });

  it('verificarAlArrancar con datos sin cambios no vuelve a guardar', async () => {
    await Autosave.verificarAlArrancar();
    expect(mocks.cuenta()).toBe(1); // sigue en 1
  });

  it('con datos nuevos sí guarda y actualiza la fecha', async () => {
    datos = { version: 2 };
    await Autosave.verificarAlArrancar();
    expect(mocks.cuenta()).toBe(2);
    expect(mocks.ultimoGuardado()).toEqual({ version: 2 });

    const info = await Autosave.info();
    expect(info.ultimoHash).toBeTruthy();
    expect(info.ultimaFecha).toBeTruthy();
    expect(info.contadorActual).toBe(0); // reseteado tras guardar
  });

  it('el guardado forzado ignora el hash (semántica de emergencia: app oculta)', async () => {
    await Autosave._forzarGuardado('test-forzado');
    expect(mocks.cuenta()).toBe(3); // fuerza = guarda aunque el hash coincida
  });

  it('guardado forzado con cambios persiste', async () => {
    datos = { version: 3 };
    await Autosave._forzarGuardado('page-hidden');
    expect(mocks.cuenta()).toBe(4);
    expect(mocks.ultimoGuardado()).toEqual({ version: 3 });
  });

  it('info() refleja el trinquete de operaciones', async () => {
    Autosave.notificarOperacion();
    Autosave.notificarOperacion();
    const info = await Autosave.info();
    expect(info.contadorActual).toBe(2);
    expect(info.opsParaBackup).toBe(10);
    // El hash persistió del último guardado (storage), no es el de memoria vacía
    expect(info.ultimoHash).not.toBeNull();
  });

  it('forzarBackupManual guarda siempre (aunque el hash coincida)', async () => {
    await Autosave.forzarBackupManual();
    expect(mocks.cuenta()).toBe(5);
  });
});
