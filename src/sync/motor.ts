/**
 * Motor de sincronización (puro): exportar cambios locales y aplicar los
 * remotos. No sabe nada del transporte: lo usan igual la nube y el WiFi directo.
 *
 * Regla de conflicto: gana la fila con mayor (ts, dispositivo). `ts` es la marca
 * lógica del dispositivo que hizo el cambio; 0 significa «edad desconocida»
 * (existía antes de que hubiera seguimiento) y pierde contra cualquier cambio
 * real. Un borrado solo se aplica si es más nuevo que el último cambio local de
 * esa fila, y la versión local que pierde se guarda en `descartes` para que
 * nada se pierda sin rastro.
 *
 * Lo que se aplica desde aquí se anota con `propagar: 0` (nació en otro
 * dispositivo) y viaja igual: así el cambio de un tercer dispositivo sigue su
 * camino. En el que ya lo tenía no modifica nada (misma marca y contenido), así
 * que devolverlo no produce rebotes.
 */
import type Dexie from 'dexie';
import { ES_SYNC, TABLAS_SINCRONIZABLES } from './tipos';
import type { Cambio, Descarte, FilaRemota } from './tipos';
import type { Seguimiento } from './seguimiento';

export interface ContextoSync {
  db: Dexie;
  seg: Seguimiento;
}

export interface ResultadoAplicar {
  /** Filas insertadas, modificadas o borradas en este dispositivo. */
  aplicados: number;
  /** Filas que no cambiaron nada aquí (ya estaban igual, eran más viejas o no viajan). */
  ignorados: number;
  /** Versiones locales reemplazadas o borradas, guardadas en `descartes`. */
  descartes: number;
  /** Tablas tocadas: las que hay que recargar en los stores. */
  tablas: string[];
}

const clave = (tabla: string, id: string): string => tabla + '\u0000' + id;

/** ¿Debe imponerse la fila remota sobre la local? Empate: gana el dispositivo mayor. */
export function ganaRemoto(tsRemoto: number, dispRemoto: string, tsLocal: number, dispLocal: string): boolean {
  if (tsRemoto !== tsLocal) return tsRemoto > tsLocal;
  return dispRemoto > dispLocal;
}

function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  const o = v as Record<string, unknown>;
  const claves = Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined);
  return '{' + claves.map((k) => JSON.stringify(k) + ':' + canonico(o[k])).join(',') + '}';
}

/** Comparación de contenido independiente del orden de claves. */
export function mismoContenido(a: unknown, b: unknown): boolean {
  return canonico(a) === canonico(b);
}

function conDatos(f: FilaRemota): Record<string, unknown> {
  return { ...(f.datos as Record<string, unknown>), id: f.id };
}

function anotada(f: FilaRemota, tipo: Cambio['tipo'], origen: string): Cambio {
  return { tabla: f.tabla, registroId: f.id, tipo, ts: f.ts, dispositivo: f.dispositivo, propagar: 0, origen };
}

function esValida(f: FilaRemota): boolean {
  if (!ES_SYNC.has(f.tabla) || typeof f.id !== 'string' || !f.id) return false;
  if (f.borrado) return true;
  return typeof f.ts === 'number' && !!f.datos && typeof f.datos === 'object';
}

/**
 * Estado completo: todas las filas vivas con su marca (0 si no hay seguimiento
 * de ellas) y todas las lápidas. Es lo que se envía la primera vez que se une
 * a un dispositivo o a una cuenta.
 */
export async function obtenerEstadoCompleto(ctx: ContextoSync): Promise<FilaRemota[]> {
  const { db } = ctx;
  const ultima = new Map<string, Cambio>();
  for (const e of await db.table<Cambio, number>('cambios').toArray()) {
    const k = clave(e.tabla, e.registroId);
    const anterior = ultima.get(k);
    if (!anterior || (e.id ?? 0) > (anterior.id ?? 0)) ultima.set(k, e);
  }

  const filas: FilaRemota[] = [];
  const vivas = new Set<string>();
  for (const tabla of TABLAS_SINCRONIZABLES) {
    for (const fila of await db.table(tabla).toArray()) {
      const id = String(fila.id);
      const k = clave(tabla, id);
      vivas.add(k);
      const e = ultima.get(k);
      const seguida = e !== undefined && e.tipo === 'put';
      filas.push({
        tabla,
        id,
        datos: fila,
        borrado: false,
        ts: seguida ? e.ts : 0,
        dispositivo: seguida ? e.dispositivo : '',
      });
    }
  }
  for (const [k, e] of ultima) {
    if (e.tipo === 'delete' && !vivas.has(k)) {
      filas.push({
        tabla: e.tabla,
        id: e.registroId,
        datos: null,
        borrado: true,
        ts: e.ts,
        dispositivo: e.dispositivo,
      });
    }
  }
  return filas;
}

/**
 * Cambios propios posteriores al cursor, con una entrada por fila (la última).
 * `hasta` es el nuevo cursor del emisor. Con `sinOrigen` se saltan los que
 * llegaron de ese transporte: no tiene sentido devolverlos al mismo sitio.
 */
export async function obtenerCambiosDesde(
  ctx: ContextoSync,
  desde: number,
  opciones: { sinOrigen?: string } = {}
): Promise<{ filas: FilaRemota[]; hasta: number }> {
  const { db, seg } = ctx;
  const entradas = await db.table<Cambio, number>('cambios').where('id').above(desde).toArray();

  const ultima = new Map<string, Cambio>();
  let hasta = desde;
  for (const e of entradas) {
    if (opciones.sinOrigen && e.origen === opciones.sinOrigen) continue;
    const k = clave(e.tabla, e.registroId);
    const anterior = ultima.get(k);
    if (!anterior || (e.id ?? 0) > (anterior.id ?? 0)) ultima.set(k, e);
    if ((e.id ?? 0) > hasta) hasta = e.id ?? hasta;
  }

  const filas: FilaRemota[] = [];
  for (const e of ultima.values()) {
    const fila = e.tipo === 'put' ? await db.table(e.tabla).get(e.registroId) : undefined;
    if (e.tipo === 'put' && fila) {
      // La fila puede tener después una versión aplicada desde otro dispositivo:
      // la marca que la describe es la de esa versión, no la de la entrada propia.
      const real = await seg.ultima(e.tabla, e.registroId);
      filas.push({
        tabla: e.tabla,
        id: e.registroId,
        datos: fila,
        borrado: false,
        ts: real?.ts ?? e.ts,
        dispositivo: real?.dispositivo ?? e.dispositivo,
      });
    } else {
      // Borrado, o fila que ya no existe: viaja como lápida.
      filas.push({
        tabla: e.tabla,
        id: e.registroId,
        datos: null,
        borrado: true,
        ts: e.ts,
        dispositivo: e.dispositivo,
      });
    }
  }
  return { filas, hasta };
}

/** Aplica filas remotas con la regla de conflicto. Ver cabecera del archivo. */
export async function aplicarRemotas(
  ctx: ContextoSync,
  filas: FilaRemota[],
  origen: string
): Promise<ResultadoAplicar> {
  const { db, seg } = ctx;
  const res: ResultadoAplicar = { aplicados: 0, ignorados: 0, descartes: 0, tablas: [] };
  const tocadas = new Set<string>();
  const cambios = db.table<Cambio, number>('cambios');
  const descartes = db.table<Descarte, number>('descartes');

  await db.transaction('rw', [...TABLAS_SINCRONIZABLES, 'cambios', 'descartes'], () =>
    seg.sinRegistrar(async () => {
      for (const f of filas) {
        if (!esValida(f)) {
          res.ignorados++;
          continue;
        }
        seg.ver(f.ts);
        const tabla = db.table(f.tabla);
        const local = await tabla.get(f.id);
        const ult = await seg.ultima(f.tabla, f.id);
        const tsLocal = local ? (ult?.tipo === 'put' ? ult.ts : 0) : -1;
        const dispLocal = ult?.tipo === 'put' ? ult.dispositivo : seg.idDispositivo;

        if (!local) {
          // Hay lápida local: una fila que llegue solo entra si es más nueva que el borrado.
          if (ult?.tipo === 'delete' && !f.borrado && !ganaRemoto(f.ts, f.dispositivo, ult.ts, ult.dispositivo)) {
            res.ignorados++;
            continue;
          }
          if (f.borrado) {
            if (ult?.tipo !== 'delete') {
              // Se anota la lápida para que una copia vieja que llegue después no resucite la fila.
              await cambios.add(anotada(f, 'delete', origen));
            }
            res.ignorados++;
            continue;
          }
          await tabla.put(conDatos(f));
          await cambios.add(anotada(f, 'put', origen));
          res.aplicados++;
          tocadas.add(f.tabla);
          continue;
        }

        if (!ganaRemoto(f.ts, f.dispositivo, tsLocal, dispLocal)) {
          res.ignorados++;
          continue;
        }

        if (!f.borrado && mismoContenido(local, conDatos(f))) {
          // Mismo contenido: solo se anota la marca, sin tocar la fila ni alarmar con un descarte.
          if (ult?.tipo !== 'put' || ult.ts !== f.ts || ult.dispositivo !== f.dispositivo) {
            await cambios.add(anotada(f, 'put', origen));
          }
          res.ignorados++;
          continue;
        }

        await descartes.add({
          tabla: f.tabla,
          registroId: f.id,
          ts: Date.now(),
          origen,
          motivo: f.borrado ? 'borrado-remoto' : 'reemplazado',
          datos: local,
        });
        if (f.borrado) await tabla.delete(f.id);
        else await tabla.put(conDatos(f));
        await cambios.add(anotada(f, f.borrado ? 'delete' : 'put', origen));
        res.aplicados++;
        res.descartes++;
        tocadas.add(f.tabla);
      }
    })
  );

  res.tablas = [...tocadas];
  return res;
}
