import { Filesystem, Directory } from '@capacitor/filesystem';
import { esNativo } from './platform';
import { textoDesdeBytes } from './backup';

const CARPETA = 'backups';
const MAX_BACKUPS = 30;

// Comprimir texto a Blob (gzip si el navegador lo soporta)
async function comprimirGzip(texto: string) {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(stream).blob();
    } catch (e) {
      console.warn('gzip fallo, sin comprimir:', e);
    }
  }
  return new Blob([texto]);
}

// Convertir Blob a base64 (formato que espera Filesystem)
async function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const b64 = String(result).split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const BackupFolder = {
  // En web no hay carpeta persistente: usar descarga
  async guardar(datos: unknown, nombrePersonalizado: string | null = null) {
    const fecha = new Date();
    const iso = fecha.toISOString().slice(0, 10);
    const hora = String(fecha.getHours()).padStart(2, '0') + String(fecha.getMinutes()).padStart(2, '0');
    const nombre = nombrePersonalizado || `backup-${iso}-${hora}.json.gz`;

    const json = JSON.stringify(datos);

    if (!esNativo()) {
      // Web: descargar como JSON PLANO. Antes se descargaba el blob gzip con
      // el nombre sin ".gz": un .json binario que la propia app no podía
      // re-importar (readAsText → basura → "Datos invalidos").
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre.replace('.gz', '');
      a.click();
      URL.revokeObjectURL(url);
      return nombre;
    }

    // Nativo: comprimir y escribir en Directory.Documents
    const blob = await comprimirGzip(json);
    const b64 = await blobABase64(blob);
    await Filesystem.writeFile({
      path: `${CARPETA}/${nombre}`,
      data: b64,
      directory: Directory.Documents,
      recursive: true,
    });
    return nombre;
  },

  async listar() {
    if (!esNativo()) return [];
    try {
      const r = await Filesystem.readdir({
        path: CARPETA,
        directory: Directory.Documents,
      });
      return (r.files || []).filter((f) => f.name.endsWith('.json.gz')).sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  },

  async leer(nombre: string) {
    if (!esNativo()) return null;
    try {
      const r = await Filesystem.readFile({
        path: `${CARPETA}/${nombre}`,
        directory: Directory.Documents,
      });
      // r.data es base64. Convertir a bytes y dejar que el helper compartido
      // decida gzip-vs-plano por magic bytes (mismo criterio que el import
      // de Ajustes — por si un .json.gz viejo fue renombrado a mano).
      const bin = atob(String(r.data));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const texto = await textoDesdeBytes(bytes);
      return JSON.parse(texto);
    } catch (e) {
      console.error('BackupFolder.leer', e);
      return null;
    }
  },

  async eliminar(nombre: string) {
    if (!esNativo()) return;
    try {
      await Filesystem.deleteFile({
        path: `${CARPETA}/${nombre}`,
        directory: Directory.Documents,
      });
    } catch {}
  },

  async rotar(max = MAX_BACKUPS) {
    const archivos = await this.listar();
    const sobrantes = archivos.slice(max);
    for (const a of sobrantes) {
      await this.eliminar(a.name);
    }
    return sobrantes.length;
  },

  async info() {
    const archivos = await this.listar();
    return {
      cantidad: archivos.length,
      ultimo: archivos[0] ? archivos[0].name : null,
      archivos: archivos.map((a) => a.name),
    };
  },
};
