// Devuelve un hash corto (16 chars hex) del texto.
// Usa SHA-256 si crypto.subtle esta disponible, sino fallback al tamano.
export async function hashContenido(texto) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder().encode(texto);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
  } catch (e) {
    console.warn('hash fallback:', e);
  }
  return 'len_' + String(texto.length);
}

// Hash rapido (no criptografico) para detectar cambios grandes
export function hashRapido(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) - h + texto.charCodeAt(i)) | 0;
  }
  return 'h_' + Math.abs(h).toString(36) + '_' + texto.length;
}
