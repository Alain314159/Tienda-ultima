/**
 * Tests de services/backupFolder.ts — antes 4.8% cubierto.
 * Cubre: descarga web como JSON plano (regresión: se descargaba gzip con
 * nombre .json, irreimportable), escritura nativa gzip + round-trip de
 * lectura, listado filtrado/ordenado, rotación y borrado.
 *
 * @capacitor/filesystem se mockea con un Map en memoria; platform.esNativo
 * se alterna por test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const archivos = new Map();

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(async (o) => {
      archivos.set(o.path, { data: o.data, encoding: o.encoding });
    }),
    readFile: vi.fn(async (o) => {
      const f = archivos.get(o.path);
      if (!f) throw new Error('ENOENT');
      return { data: f.data };
    }),
    readdir: vi.fn(async () => ({
      // readdir real devuelve solo NOMBRES dentro de la carpeta
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
import { BackupFolder } from '../src/services/backupFolder';

vi.mock('../src/services/platform', () => ({ esNativo: vi.fn(() => false) }));

beforeEach(() => {
  archivos.clear();
  vi.restoreAllMocks(); // restaura esNativo al default del mock (false)
});

function b64ABin(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

describe('BackupFolder (web)', () => {
  it('guardar descarga JSON PLANO reimportable (regresión gzip)', async () => {
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const clicks = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      // llamado como método del <a>: this es el ancla
      clicks.push(this.download);
    });
    const datos = { productos: [{ id: 'p1' }], version: 9 };

    const nombre = await BackupFolder.guardar(datos, null);

    expect(nombre).toMatch(/^backup-\d{4}-\d{2}-\d{2}-\d{4}\.json\.gz$/);
    expect(clicks).toEqual([nombre.replace('.gz', '')]); // descarga SIN .gz
    // El blob entregado al navegador debe ser JSON texto (no gzip binario).
    // happy-dom Blob no tiene .text(): leer con FileReader
    const blob = urlSpy.mock.calls[0][0];
    const texto = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsText(blob);
    });
    expect(JSON.parse(texto)).toEqual(datos);
    clickSpy.mockRestore();
  });

  it('listar/leer en web devuelven vacío/null (no hay carpeta)', async () => {
    expect(await BackupFolder.listar()).toEqual([]);
    expect(await BackupFolder.leer('x.json.gz')).toBeNull();
  });
});

describe('BackupFolder (nativo)', () => {
  beforeEach(() => {
    vi.mocked(esNativo).mockReturnValue(true);
  });

  it('guardar escribe gzip y leer lo restaura (round-trip)', async () => {
    const datos = { productos: [{ id: 'p1', nombre: 'Café' }], ventas: [], version: 9 };
    const nombre = await BackupFolder.guardar(datos, null);

    const guardado = archivos.get('backups/' + nombre);
    expect(guardado).toBeTruthy();
    const bytes = b64ABin(guardado.data);
    if (typeof CompressionStream !== 'undefined') {
      // si el runtime soporta gzip, debe estar comprimido (magic 1f 8b)
      expect(bytes[0]).toBe(0x1f);
      expect(bytes[1]).toBe(0x8b);
    }
    const leido = await BackupFolder.leer(nombre);
    expect(leido).toEqual(datos);
  });

  it('guardar respeta nombre personalizado', async () => {
    await BackupFolder.guardar({ a: 1 }, 'mi-backup.json.gz');
    expect(archivos.has('backups/mi-backup.json.gz')).toBe(true);
    expect(await BackupFolder.leer('mi-backup.json.gz')).toEqual({ a: 1 });
  });

  it('listar devuelve solo .json.gz ordenados descendente', async () => {
    await BackupFolder.guardar({ n: 1 }, 'backup-2026-10-01-0900.json.gz');
    await BackupFolder.guardar({ n: 2 }, 'backup-2026-10-03-0900.json.gz');
    await BackupFolder.guardar({ n: 3 }, 'backup-2026-10-02-0900.json.gz');
    await BackupFolder.guardar({ n: 4 }, 'backup-2026-10-02-0900.json'); // sin .gz
    const lista = await BackupFolder.listar();
    expect(lista.map((f) => f.name)).toEqual([
      'backup-2026-10-03-0900.json.gz',
      'backup-2026-10-02-0900.json.gz',
      'backup-2026-10-01-0900.json.gz',
    ]);
  });

  it('rotar conserva como máximo N backups y elimina los sobrantes', async () => {
    await BackupFolder.guardar({ n: 1 }, 'backup-2026-10-01-0900.json.gz');
    await BackupFolder.guardar({ n: 2 }, 'backup-2026-10-02-0900.json.gz');
    await BackupFolder.guardar({ n: 3 }, 'backup-2026-10-03-0900.json.gz');
    const sobrantes = await BackupFolder.rotar(2);
    expect(sobrantes).toBe(1);
    expect(await BackupFolder.listar()).toHaveLength(2);
    expect(archivos.has('backups/backup-2026-10-01-0900.json.gz')).toBe(false);
  });

  it('eliminar borra el archivo', async () => {
    await BackupFolder.guardar({ n: 1 }, 'backup-x.json.gz');
    await BackupFolder.eliminar('backup-x.json.gz');
    expect(archivos.has('backups/backup-x.json.gz')).toBe(false);
  });

  it('info resume cantidad y el más reciente', async () => {
    await BackupFolder.guardar({ n: 1 }, 'backup-2026-10-01-0900.json.gz');
    await BackupFolder.guardar({ n: 2 }, 'backup-2026-10-02-0900.json.gz');
    const info = await BackupFolder.info();
    expect(info.cantidad).toBe(2);
    expect(info.ultimo).toBe('backup-2026-10-02-0900.json.gz');
  });
});
