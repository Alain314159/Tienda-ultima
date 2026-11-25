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

/**
 * Hash ESTABLE de un respaldo para dedup de subidas: excluye los campos
 * que cambian solos sin que cambien los datos de negocio —
 *  · `fecha`: timestamp del snapshot (nuevo en cada llamada)
 *  · cfg.tgUltimoBackup / tg.tgUltimoHash: marcadores del propio envío
 *  · cfg.ultimoBackupAuto: reloj del intervalo de backup
 * Sin esto los hashes NUNCA coincidían entre corridas y la app re-subía
 * el mismo respaldo a Telegram cada 2 horas aunque no hubiera cambios.
 */
export async function hashRespaldoEstable(datos: Record<string, unknown>): Promise<string> {
  const copia: Record<string, unknown> = { ...datos };
  delete copia.fecha;
  if (copia.cfg && typeof copia.cfg === 'object') {
    const cfg = { ...(copia.cfg as Record<string, unknown>) };
    delete cfg.tgUltimoBackup;
    delete cfg.tgUltimoHash;
    delete cfg.ultimoBackupAuto;
    copia.cfg = cfg;
  }
  return hashContenido(JSON.stringify(copia));
}
