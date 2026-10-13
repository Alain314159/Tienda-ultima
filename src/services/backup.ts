/**
 * Servicio de utilidades de respaldo: compresión gzip nativa,
 * hash de contenido, derivación de claves WebCrypto y guardado
 * en carpeta del dispositivo (File System Access API).
 */
import { db } from '../db';
import { hashContenido } from './hash';

export { hashContenido };

/** Comprime un Blob con gzip (CompressionStream nativo; sin soporte devuelve el original). */
export async function comprimirGzip(blob) {
  if (typeof CompressionStream === 'undefined') return blob;
  try {
    const cs = new CompressionStream('gzip');
    const stream = blob.stream().pipeThrough(cs);
    return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' });
  } catch (e) {
    return blob;
  }
}

/** Descomprime un Blob gzip (DecompressionStream nativo; sin soporte devuelve el original). */
export async function descomprimirGzip(blob) {
  if (typeof DecompressionStream === 'undefined') return blob;
  try {
    const ds = new DecompressionStream('gzip');
    const stream = blob.stream().pipeThrough(ds);
    return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/json' });
  } catch (e) {
    return blob;
  }
}

/** Deriva una clave AES-256-GCM desde una contraseña (PBKDF2, 100k iteraciones). */
export async function derivarClave(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Handle de carpeta persistido (File System Access API)
let _carpetaHandle: FileSystemDirectoryHandle | null = null;

/** Guarda un Blob en la carpeta configurada del teléfono. Devuelve true si tuvo éxito. */
export async function guardarEnCarpeta(fileName, contenidoBlob) {
  // 1. Verificar handle guardado
  if (!_carpetaHandle) {
    try {
      const rec = await db.config.get('carpetaHandle');
      if (rec && rec.value) _carpetaHandle = rec.value as FileSystemDirectoryHandle;
    } catch (e) {}
  }
  if (!_carpetaHandle) return false;
  // 2. Verificar permiso
  try {
    const handle = _carpetaHandle as FileSystemDirectoryHandle & {
      queryPermission?: (d: { mode: string }) => Promise<string>;
      requestPermission?: (d: { mode: string }) => Promise<string>;
    };
    const perm = (await handle.queryPermission?.({ mode: 'readwrite' })) || 'denied';
    if (perm !== 'granted') {
      const req = (await handle.requestPermission?.({ mode: 'readwrite' })) || 'denied';
      if (req !== 'granted') return false;
    }
  } catch (e) {
    return false;
  }
  // 3. Escribir archivo
  try {
    const fh = await _carpetaHandle.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(contenidoBlob);
    await w.close();
    return true;
  } catch (e) {
    console.error('guardarEnCarpeta', e);
    return false;
  }
}

/** Carga el handle de carpeta guardado (al iniciar la app). */
export async function cargarCarpetaHandle() {
  try {
    const rec = await db.config.get('carpetaHandle');
    if (rec && rec.value) {
      _carpetaHandle = rec.value as FileSystemDirectoryHandle;
      return rec;
    }
  } catch (e) {}
  return null;
}
