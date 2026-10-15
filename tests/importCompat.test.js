/**
 * Compatibilidad de respaldos históricos — regresión de los DOS archivos
 * reales pre-migración que subió el dueño:
 * 1. backup-YYYY-MM-DD-HHMM.json.gz  (backup automático de la carpeta)
 * 2. backup-YYYY-MM-DD-HHMM.json     (export de Ajustes de una versión con
 *    el bug del exportador: contenido GZIP con nombre .json)
 *
 * Los fixtures (tests/fixtures/) se generan con scripts/gen-fixture-backups.mjs
 * a partir de esos archivos reales, sanitizados (token TG, nombres) y
 * recortados a 15 productos — las FORMAS de los registros son las originales.
 *
 * Regresiones cubiertas:
 * - Import desde Ajustes no soportaba gzip (readAsText + JSON.parse → basura)
 * - ejecutarImport re-leía el archivo SIN descifrar: los respaldos cifrados
 *   exportados por la propia app jamás podían importarse ("Archivo invalido")
 * - Export nativo usaba descarga blob: (el WebView de Android no la soporta)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));

import { leerArchivoRespaldo, derivarClave, aBase64 } from '../src/services/backup';
import { balanzaDeComprobacion } from '../src/services/libroDiario';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useConfigStore } from '../src/stores/useConfigStore';
import { useCajaStore } from '../src/stores/useCajaStore';
import { useUIStore } from '../src/stores/useUIStore';
import { db } from '../src/db';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FX = (n) => readFileSync(resolve(AQUI, 'fixtures', n));
const FX_BYTES = (n) => new Uint8Array(FX(n));

/** gzip de un string (el compresor nativo, como hace la app al exportar). */
async function gzipTexto(texto) {
  const cs = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(cs).arrayBuffer());
}

/** File sintético como el que entrega el <input type="file">. */
function comoFile(bytes, nombre) {
  return new File([bytes], nombre);
}

/** Evento sintético con la forma que onImportFile espera de un input. */
function eventoInput(file) {
  return { target: { files: [file], value: 'cualquiera' } };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===== Lector de archivos: los 3 formatos históricos =====

describe('leerArchivoRespaldo (3 formatos históricos)', () => {
  it('lee JSON plano (export actual de Ajustes en web)', async () => {
    const d = await leerArchivoRespaldo(comoFile(FX_BYTES('backup-v9-plano.json'), 'respaldo.json'));
    expect(d.version).toBe(9);
    expect(d.productos).toHaveLength(15);
  });

  it('lee .json.gz (backup automático de la carpeta)', async () => {
    const d = await leerArchivoRespaldo(comoFile(FX_BYTES('backup-v9-auto.json.gz'), 'backup-2026-10-02-1958.json.gz'));
    expect(d.version).toBe(9);
    expect(d.ventas).toHaveLength(71);
  });

  it('lee .json que es gzip por dentro (export pre-migración — LA regresión)', async () => {
    // El nombre miente: magic bytes 0x1f 0x8b bajo extensión .json
    const bytes = FX_BYTES('backup-v9-manual-premigracion.json');
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    const d = await leerArchivoRespaldo(comoFile(bytes, 'backup-2026-10-09-0853.json'));
    expect(d.version).toBe(9);
    expect(d.cfg.nombre).toBe('Tienda Prueba');
  });

  it('lee un sobre cifrado envuelto en gzip (dos capas)', async () => {
    const sobre = { version: 2, cifrado: true, salt: 'AA', iv: 'BB', data: 'CC' };
    const gz = await gzipTexto(JSON.stringify(sobre));
    const d = await leerArchivoRespaldo(comoFile(gz, 'respaldo-cifrado.json'));
    expect(d.cifrado).toBe(true);
  });

  it('error claro si es gzip y el entorno no tiene DecompressionStream', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      await expect(leerArchivoRespaldo(comoFile(FX_BYTES('backup-v9-auto.json.gz'), 'backup.json.gz'))).rejects.toThrow(
        'no puede descomprimirlo'
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('JSON corrupto (ni plano ni gzip) → error de parseo', async () => {
    await expect(leerArchivoRespaldo(comoFile(new Uint8Array([123, 34, 34]), 'x.json'))).rejects.toThrow();
  });
});

// ===== Import completo de datos REALES pre-migración =====

describe('importarData con respaldo real v9', () => {
  async function importarFixture(nombre) {
    const b = useBackupStore();
    const d = await leerArchivoRespaldo(comoFile(FX_BYTES(nombre), nombre));
    await b.importarData(d);
    return d;
  }

  it('restaura el .json.gz de la carpeta: conteos, cfg y contabilidad', async () => {
    const d = await importarFixture('backup-v9-auto.json.gz');

    expect(await db.productos.count()).toBe(d.productos.length);
    expect(await db.lotes.count()).toBe(d.lotes.length);
    expect(await db.ventas.count()).toBe(d.ventas.length);
    expect(await db.compras.count()).toBe(d.compras.length);
    expect(await db.socios.count()).toBe(2);
    expect(await db.cierres.count()).toBe(5);

    // cfg del respaldo aplicada sobre los defaults (sin claves nuevas → intactas)
    const configStore = useConfigStore();
    expect(configStore.cfg.nombre).toBe('Tienda Prueba');
    expect(configStore.cfg.tema).toBe('dark');
    expect(configStore.cfg.stockMinDefault).toBe(5); // default, no venía en el respaldo

    // La contabilidad se REGENERA desde los datos base (los respaldos viejos
    // no traen asientos) y la ecuación debe cuadrar
    const asientos = await db.asientos.toArray();
    expect(asientos.length).toBeGreaterThan(0);
    const balanza = balanzaDeComprobacion(asientos);
    const debe = balanza.reduce((s, f) => s + f.debe, 0);
    const haber = balanza.reduce((s, f) => s + f.haber, 0);
    expect(debe).toBeCloseTo(haber, 2);

    // Caja viva con el histórico completo
    const caja = useCajaStore();
    expect(caja.saldoCaja).toBeGreaterThan(0);
  });

  it('el .json tramposo (gzip por dentro) importa idéntico al .json.gz', async () => {
    const d = await importarFixture('backup-v9-manual-premigracion.json');
    expect(await db.ventas.count()).toBe(d.ventas.length);
    expect(await db.productos.count()).toBe(15);

    const asientos = await db.asientos.toArray();
    const balanza = balanzaDeComprobacion(asientos);
    const debe = balanza.reduce((s, f) => s + f.debe, 0);
    const haber = balanza.reduce((s, f) => s + f.haber, 0);
    expect(debe).toBeCloseTo(haber, 2);
  });

  it('round-trip: exportar los datos importados y re-importarlos no pierde nada', async () => {
    await importarFixture('backup-v9-auto.json.gz');
    const antes = {
      productos: await db.productos.count(),
      ventas: await db.ventas.count(),
      lotes: await db.lotes.count(),
      compras: await db.compras.count(),
    };
    // Re-exportar a gzip y volver a entrar (como haría un usuario real)
    const { datosDeStores } = await import('../src/stores/exportar');
    const gz = await gzipTexto(JSON.stringify(datosDeStores()));
    const b = useBackupStore();
    await b.importarData(await leerArchivoRespaldo(comoFile(gz, 'ida-y-vuelta.json.gz')));
    expect(await db.productos.count()).toBe(antes.productos);
    expect(await db.ventas.count()).toBe(antes.ventas);
    expect(await db.lotes.count()).toBe(antes.lotes);
    expect(await db.compras.count()).toBe(antes.compras);
  });
});

// ===== Flujo UI completo: onImportFile → preview → confirmar → ejecutarImport =====

describe('flujo de importación desde Ajustes (onImportFile → ejecutarImport)', () => {
  function espiarUI() {
    const ui = useUIStore();
    let onOkCapturado = null;
    const confirmarSpy = vi.spyOn(ui, 'confirmar').mockImplementation(({ onOk }) => {
      onOkCapturado = onOk;
    });
    const preguntarSpy = vi.spyOn(ui, 'preguntar');
    return { ui, confirmarSpy, preguntarSpy, onOk: () => onOkCapturado };
  }

  it('el .json tramposo pasa por todo el flujo de UI', async () => {
    const b = useBackupStore();
    const { confirmarSpy, onOk } = espiarUI();

    b.onImportFile(
      eventoInput(comoFile(FX_BYTES('backup-v9-manual-premigracion.json'), 'backup-2026-10-09-0853.json'))
    );

    await vi.waitFor(() => expect(confirmarSpy).toHaveBeenCalled());
    expect(b.importPreview).toBeTruthy();
    expect(b.importPreview.nuevos.productos).toBe(15);

    await onOk()(); // el usuario confirma
    await vi.waitFor(async () => expect((await db.productos.toArray()).length).toBe(15));
    expect(await db.ventas.count()).toBe(71);
    expect(b.importPreview).toBe(null);
  });

  it('respaldo CIFRADO envuelto en gzip: pide contraseña, descifra e importa (regresión)', async () => {
    // Construir un sobre cifrado real con el esquema de la app
    const datos = JSON.parse(new TextDecoder().decode(FX_BYTES('backup-v9-plano.json')));
    const pass = 'secreto123';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derivarClave(pass, salt, 100000); // iteraciones bajas: el test no debe tardar
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(datos))
    );
    const sobre = {
      version: 2,
      cifrado: true,
      kdf: { algo: 'PBKDF2-SHA256', iter: 100000 },
      salt: aBase64(salt),
      iv: aBase64(iv),
      data: aBase64(new Uint8Array(cipher)),
    };
    const gz = await gzipTexto(JSON.stringify(sobre));

    const b = useBackupStore();
    const { confirmarSpy, preguntarSpy, onOk } = espiarUI();
    preguntarSpy.mockResolvedValue(pass);

    b.onImportFile(eventoInput(comoFile(gz, 'respaldo-cifrado.json')));

    await vi.waitFor(() => expect(confirmarSpy).toHaveBeenCalled());
    expect(preguntarSpy).toHaveBeenCalled();
    expect(b.importPreview.nuevos.productos).toBe(15); // descifró para el preview

    // ANTES del fix: ejecutarImport re-leía el archivo SIN descifrar y moría
    // con "Archivo invalido" aunque la contraseña fuera correcta
    await onOk()();
    await vi.waitFor(async () => expect((await db.productos.toArray()).length).toBe(15));
    expect(await db.ventas.count()).toBe(71);
  });

  it('contraseña incorrecta → toast de error y NO pide confirmación', async () => {
    const datos = { version: 2, productos: [{ id: 'p1', nombre: 'X', precio: 1 }] };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derivarClave('correcta', salt, 100000);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(datos))
    );
    const sobre = { cifrado: true, salt: aBase64(salt), iv: aBase64(iv), data: aBase64(new Uint8Array(cipher)) };

    const b = useBackupStore();
    const { confirmarSpy, preguntarSpy } = espiarUI();
    preguntarSpy.mockResolvedValue('incorrecta');

    b.onImportFile(eventoInput(comoFile(new TextEncoder().encode(JSON.stringify(sobre)), 'r.json')));
    await vi.waitFor(() => expect(preguntarSpy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(confirmarSpy).not.toHaveBeenCalled();
  });

  it('archivo que no es respaldo → toast de error, sin confirmación', async () => {
    const b = useBackupStore();
    const { confirmarSpy } = espiarUI();

    b.onImportFile(eventoInput(comoFile(new TextEncoder().encode('{"hola": 1}'), 'no-respaldo.json')));
    await new Promise((r) => setTimeout(r, 50));
    expect(confirmarSpy).not.toHaveBeenCalled();
  });
});
