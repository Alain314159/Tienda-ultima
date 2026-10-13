/**
 * Generación de IDs únicos y helpers de persistencia.
 */
import type { Table } from 'dexie';

const ABC36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Sufijo aleatorio base36 a partir de crypto (impredecible, sin sesgo práctico). */
function sufijo(largo: number): string {
  const buf = new Uint8Array(largo);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // Entornos sin Web Crypto (no deberían darse en WebView modernas)
    for (let i = 0; i < largo; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < largo; i++) out += ABC36[buf[i] % 36];
  return out;
}

/**
 * ID único con prefijo legible y ordenable por tiempo de creación
 * (Date.now en base36 va primero). El sufijo usa crypto.getRandomValues:
 * ~41 bits de entropía (8 chars), colisiones despreciables.
 */
export const genId = (prefix: string): string => prefix + '_' + Date.now().toString(36) + sufijo(8);

/** ¿Es un objeto plano (no Date, Map, Array...)? Solo a estos se les quitan claves undefined. */
function esPojo(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Elimina recursivamente claves con valor undefined (contrato histórico de clean). */
function sinUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => sinUndefined(x)) as unknown as T;
  if (esPojo(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = sinUndefined(val);
    }
    return out as T;
  }
  return v;
}

/**
 * Clona profundamente. Usa structuredClone() nativo (preserva Date, Map,
 * Set, RegExp, ArrayBuffer y es más rápido que JSON) y elimina las claves
 * undefined para mantener el contrato histórico requerido por IndexedDB.
 * Fallback a JSON si el clon falla (p.ej. funciones en el objeto).
 */
export const clean = <T>(obj: T): T => {
  try {
    return sinUndefined(structuredClone(obj));
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
};

/** Put helper: guarda un objeto limpio en la tabla. */
export const P = <T>(table: Table<T, string>, obj: T): Promise<unknown> => table.put(clean(obj));
