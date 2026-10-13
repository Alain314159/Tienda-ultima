/**
 * Hash de contenido para detectar cambios en los backups.
 * Usa SHA-256 nativo (crypto.subtle) con fallback defensivo.
 */

/** Devuelve un hash corto (16 chars hex) del texto. */
export async function hashContenido(texto: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder().encode(texto);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
  } catch (e) {
    console.warn('hash fallback:', e);
  }
  return 'len_' + String(texto.length);
}
