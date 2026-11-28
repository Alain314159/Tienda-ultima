/**
 * Tests de la escritura atómica de BackupFolder (1.4) y de la detección
 * de falta de espacio (1.5).
 *
 * El módulo real con @capacitor/filesystem mockeado con un Map en memoria,
 * incluido `rename`: guardar escribe al temporal y renombra al final.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const archivos = new Map();
const operaciones = [];

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(async (o) => {
      operaciones.push('write:' + o.path);
      archivos.set(o.path, { data: o.data, encoding: o.encoding });
    }),
    rename: vi.fn(async (o) => {
      operaciones.push('rename:' + o.from + '->' + o.to);
      const f = archivos.get(o.from);
      if (!f) throw new Error('ENOENT');
      archivos.set(o.to, f);
      archivos.delete(o.from);
    }),
    readFile: vi.fn(async (o) => {
      const f = archivos.get(o.path);
      if (!f) throw new Error('ENOENT');
      return { data: f.data };
    }),
    readdir: vi.fn(async () => ({
      files: [...archivos.keys()].map((k) => ({ name: k.replace('backups/', '') })),
    })),
    deleteFile: vi.fn(async (o) => {
      archivos.delete(o.path);
    }),
  },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
}));

import { esNativo } from '../src/services/platform';
import { BackupFolder, esErrorCuota } from '../src/services/backupFolder';

vi.mock('../src/services/platform', () => ({ esNativo: vi.fn(() => true) }));

beforeEach(() => {
  archivos.clear();
  operaciones.length = 0;
  vi.restoreAllMocks(); // restaura esNativo al default del mock (true)
});

describe('BackupFolder: escritura atómica', () => {
  it('guardar escribe al temporal y renombra: nunca hay un final a medias', async () => {
    expect(esNativo()).toBe(true);
    const nombre = await BackupFolder.guardar({ productos: [{ id: 'p1' }] }, 'backup-x.json.gz');

    expect(nombre).toBe('backup-x.json.gz');
    expect(operaciones).toEqual([
      'write:backups/backup-x.json.gz.tmp',
      'rename:backups/backup-x.json.gz.tmp->backups/backup-x.json.gz',
    ]);
    // El final existe y el temporal ya no.
    expect(archivos.has('backups/backup-x.json.gz')).toBe(true);
    expect(archivos.has('backups/backup-x.json.gz.tmp')).toBe(false);
    // Y se puede leer de vuelta (round-trip).
    const leido = await BackupFolder.leer('backup-x.json.gz');
    expect(leido).toEqual({ productos: [{ id: 'p1' }] });
  });

  it('si el renombrado falla, el temporal se limpia y guardar lanza', async () => {
    const { Filesystem } = await import('@capacitor/filesystem');
    Filesystem.rename.mockRejectedValueOnce(new Error('rename roto'));
    await expect(BackupFolder.guardar({ a: 1 }, 'backup-y.json.gz')).rejects.toThrow('rename roto');
    expect(archivos.has('backups/backup-y.json.gz')).toBe(false);
    expect(archivos.has('backups/backup-y.json.gz.tmp')).toBe(false);
  });

  it('rotar limpia los temporales huérfanos de escrituras interrumpidas', async () => {
    archivos.set('backups/backup-viejo.json.gz.tmp', { data: 'xx' });
    archivos.set('backups/backup-2026-01-01-0000.json.gz', { data: 'yy' });
    await BackupFolder.rotar(30);
    expect(archivos.has('backups/backup-viejo.json.gz.tmp')).toBe(false);
    expect(archivos.has('backups/backup-2026-01-01-0000.json.gz')).toBe(true);
  });
});

describe('esErrorCuota', () => {
  it('detecta QuotaExceededError por nombre, por código y por mensaje', () => {
    const porNombre = new Error('x');
    porNombre.name = 'QuotaExceededError';
    expect(esErrorCuota(porNombre)).toBe(true);
    expect(esErrorCuota({ code: 22 })).toBe(true);
    expect(esErrorCuota(new Error('QuotaExceededError: The quota has been exceeded.'))).toBe(true);
    expect(esErrorCuota(new Error('no space left on device'))).toBe(true);
    expect(esErrorCuota(new Error('disco roto'))).toBe(false);
    expect(esErrorCuota(null)).toBe(false);
    expect(esErrorCuota(undefined)).toBe(false);
  });
});
