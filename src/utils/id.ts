/**
 * Generación de IDs únicos y helpers de persistencia.
 */
import type { Table } from 'dexie';

/** ID único con prefijo legible. */
export const genId = (prefix: string): string =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Clona profundamente eliminando valores undefined (requerido por IndexedDB). */
export const clean = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

/** Put helper: guarda un objeto limpio en la tabla. */
export const P = <T>(table: Table<T, string>, obj: T): Promise<unknown> => table.put(clean(obj));
