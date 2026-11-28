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

// ============================================================
// Validación de contenido remoto (1.8)
// ============================================================
// Antes solo se comprobaban tabla, id, ts numérico y datos objeto: montos
// negativos, fechas imposibles o una lápida con ts futuro se aplicaban sin
// más. Ahora cada fila pasa por su especificación de tabla (montos finitos
// y >= 0 donde aplica, fechas en rango 2000–2100, ids válidos) y lo que no
// la cumple se descarta a `descartes` con motivo 'remoto-invalido' en vez
// de aplicarse. La validación es deliberadamente laxa en lo que no es
// peligroso (no exige los schemas de formulario: una fila vieja sin un
// campo opcional sigue siendo válida).

/** Marca lógica máxima aceptable: ahora + 1 día (relojes desajustados). */
const TS_FUTURO_MAX_MS = 24 * 60 * 60 * 1000;

const fechaEnRango = (v: unknown): boolean => {
  if (v === undefined || v === null || v === '') return true; // ausente: no es su campo
  const t = new Date(v as string | number | Date).getTime();
  if (isNaN(t)) return false;
  const anio = new Date(t).getUTCFullYear();
  return anio >= 2000 && anio <= 2100;
};

/** Número (o texto numérico) finito, o null/undefined si el campo no viene. */
const esNumero = (v: unknown): boolean => {
  if (v === undefined || v === null || v === '') return true;
  const x = typeof v === 'number' ? v : Number(v);
  return typeof x === 'number' && isFinite(x);
};

const esNoNegativo = (v: unknown): boolean => {
  if (v === undefined || v === null || v === '') return true;
  const x = typeof v === 'number' ? v : Number(v);
  return typeof x === 'number' && isFinite(x) && x >= 0;
};

const esPorcentaje = (v: unknown): boolean => {
  if (v === undefined || v === null || v === '') return true;
  const x = typeof v === 'number' ? v : Number(v);
  return typeof x === 'number' && isFinite(x) && x >= 0 && x <= 100;
};

interface EspecTabla {
  fechas?: string[];
  /** Campos numéricos que deben ser finitos y >= 0 si vienen. */
  noNeg?: string[];
  /** Campos numéricos que deben ser finitos (pueden ser negativos). */
  finitos?: string[];
  /** Campos de porcentaje 0–100 si vienen. */
  porcentajes?: string[];
  /** El campo `nombre` (si la tabla lo tiene) no puede venir vacío. */
  nombreObligatorio?: boolean;
}

const ESPEC_TABLAS: Record<string, EspecTabla> = {
  productos: { fechas: ['fechaCreacion'], noNeg: ['precio', 'stockMinimo', 'stockMin'], nombreObligatorio: true },
  lotes: { fechas: ['fecha'], noNeg: ['cantidadInicial', 'cantidadVendida', 'costo'] },
  ventas: { fechas: ['fecha', 'fechaAnulacion'], noNeg: ['total'], finitos: ['ganancia'] },
  compras: { fechas: ['fecha', 'fechaAnulacion'], noNeg: ['cantidad', 'costo', 'total'] },
  ajustes: { fechas: ['fecha'], finitos: ['cantidad'], noNeg: ['costoPerdida'] },
  arqueos: { fechas: ['fecha'] },
  movCaja: { fechas: ['fecha'], noNeg: ['monto'] },
  cierres: {
    fechas: ['fechaCierre', 'periodoInicio', 'periodoFin', 'fecha'],
    noNeg: ['totalVentas', 'cogs', 'gastos', 'mermas', 'numVentas', 'ventas', 'compras', 'gananciaBruta', 'valorInventario', 'cajaFinal'],
    finitos: ['ganancia'],
  },
  capital: { fechas: ['fecha'], noNeg: ['monto'] },
  retiros: { fechas: ['fecha'], noNeg: ['monto'] },
  socios: { fechas: ['fecha'], noNeg: ['aporte'], porcentajes: ['porcentaje'], nombreObligatorio: true },
  distribuciones: { fechas: ['fecha'], noNeg: ['monto', 'montoTotal'], porcentajes: ['porcentaje'] },
  gastos: { fechas: ['fecha'], noNeg: ['monto'] },
  pasivos: { fechas: ['fecha', 'vencimiento'], noNeg: ['monto'] },
  auditorias: { fechas: ['fechaInicio', 'fecha'] },
};

/** Valida el contenido de una fila remota. Devuelve el motivo o null si es válida. */
export function validarFilaRemota(f: FilaRemota): string | null {
  if (!ES_SYNC.has(f.tabla)) return 'tabla no sincronizable';
  if (typeof f.id !== 'string' || !f.id) return 'id inválido';
  if (typeof f.ts !== 'number' || !isFinite(f.ts) || f.ts < 0) return 'marca temporal inválida';
  if (f.ts > Date.now() + TS_FUTURO_MAX_MS) return 'marca temporal en el futuro';
  if (typeof f.dispositivo !== 'string') return 'dispositivo inválido';
  if (f.ts !== 0 && !f.dispositivo) return 'dispositivo vacío con marca temporal';
  if (f.borrado) return null; // la lápida solo necesita tabla, id y marca válidos
  if (!f.datos || typeof f.datos !== 'object' || Array.isArray(f.datos)) return 'datos inválidos';
  const datos = f.datos as Record<string, unknown>;
  const espec = ESPEC_TABLAS[f.tabla];
  if (!espec) return 'tabla sin especificación de validación';
  if (espec.nombreObligatorio && 'nombre' in datos) {
    if (typeof datos.nombre !== 'string' || !datos.nombre.trim()) return 'nombre vacío';
  }
  for (const campo of espec.fechas ?? []) {
    if (!fechaEnRango(datos[campo])) return `fecha inválida en "${campo}"`;
  }
  for (const campo of espec.noNeg ?? []) {
    if (!esNoNegativo(datos[campo])) return `monto inválido en "${campo}"`;
  }
  for (const campo of espec.finitos ?? []) {
    if (!esNumero(datos[campo])) return `número no finito en "${campo}"`;
  }
  for (const campo of espec.porcentajes ?? []) {
    if (!esPorcentaje(datos[campo])) return `porcentaje inválido en "${campo}"`;
  }
  if (f.tabla === 'ventas') {
    if (!Array.isArray(datos.items)) return 'items no es un array';
    for (const item of datos.items as unknown[]) {
      if (!item || typeof item !== 'object') return 'ítem de venta inválido';
      const it = item as Record<string, unknown>;
      if (!esNoNegativo(it.precio) || !esNoNegativo(it.cantidad) || !esNoNegativo(it.costo)) {
        return 'ítem de venta con precio/cantidad/costo inválidos';
      }
      if (typeof it.nombre !== 'string' || !it.nombre.trim()) return 'ítem de venta sin nombre';
    }
  }
  if (f.tabla === 'productos') {
    if (Array.isArray(datos.preciosEscalonados)) {
      for (const e of datos.preciosEscalonados as unknown[]) {
        if (!e || typeof e !== 'object') return 'escalón de precio inválido';
        const esc = e as Record<string, unknown>;
        if (!esNoNegativo(esc.precio) || !esNoNegativo(esc.min)) return 'escalón de precio inválido';
      }
    }
    if (Array.isArray(datos.empaques)) {
      for (const e of datos.empaques as unknown[]) {
        if (!e || typeof e !== 'object') return 'empaque inválido';
        if (!esNoNegativo((e as Record<string, unknown>).unidades)) return 'empaque con unidades inválidas';
      }
    }
  }
  if (f.tabla === 'distribuciones' && Array.isArray(datos.detalles)) {
    for (const d of datos.detalles as unknown[]) {
      if (!d || typeof d !== 'object') return 'detalle de distribución inválido';
      const det = d as Record<string, unknown>;
      if (!esNoNegativo(det.monto) || !esPorcentaje(det.porcentaje)) {
        return 'detalle de distribución inválido';
      }
    }
  }
  return null;
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
  // Precarga por tabla (3.6): antes cada fila costaba un get() + un
  // ultima() secuenciales; ahora son un bulkGet y una consulta por tabla.
  const porTabla = new Map<string, Cambio[]>();
  for (const e of ultima.values()) {
    if (e.tipo !== 'put') continue;
    const lista = porTabla.get(e.tabla);
    if (lista) lista.push(e);
    else porTabla.set(e.tabla, [e]);
  }
  const vivas = new Map<string, Record<string, unknown> | undefined>();
  const marcas = new Map<string, Cambio | undefined>();
  for (const [tabla, lista] of porTabla) {
    const ids = lista.map((e) => e.registroId);
    const leidas = await db.table(tabla).bulkGet(ids);
    lista.forEach((e, i) => vivas.set(clave(tabla, e.registroId), leidas[i] as Record<string, unknown> | undefined));
    const ult = await seg.ultimas(tabla, ids);
    for (const e of lista) marcas.set(clave(tabla, e.registroId), ult.get(e.registroId));
  }
  for (const e of ultima.values()) {
    if (e.tipo !== 'put') {
      // Borrado: viaja como lápida.
      filas.push({
        tabla: e.tabla,
        id: e.registroId,
        datos: null,
        borrado: true,
        ts: e.ts,
        dispositivo: e.dispositivo,
      });
      continue;
    }
    const fila = vivas.get(clave(e.tabla, e.registroId));
    if (fila) {
      // La fila puede tener después una versión aplicada desde otro dispositivo:
      // la marca que la describe es la de esa versión, no la de la entrada propia.
      const real = marcas.get(clave(e.tabla, e.registroId));
      filas.push({
        tabla: e.tabla,
        id: e.registroId,
        datos: fila,
        borrado: false,
        ts: real?.ts ?? e.ts,
        dispositivo: real?.dispositivo ?? e.dispositivo,
      });
    } else {
      // Fila que ya no existe: viaja como lápida.
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
      // Precarga por tabla (3.6): antes cada fila remota costaba un get() +
      // un ultima() secuenciales; ahora son un bulkGet y una consulta por
      // tabla al registro de cambios. Las escrituras siguen siendo por fila
      // porque dependen del resultado del conflicto de cada una.
      // Solo se precargan las filas válidas: una fila de una tabla que no
      // viaja no tiene almacén en esta transacción y su bulkGet la rompería
      // (el bucle las sigue contando como ignoradas, como antes).
      const porTabla = new Map<string, FilaRemota[]>();
      for (const f of filas) {
        if (!esValida(f)) continue;
        const lista = porTabla.get(f.tabla);
        if (lista) lista.push(f);
        else porTabla.set(f.tabla, [f]);
      }
      const locales = new Map<string, Record<string, unknown> | undefined>();
      const ultimas = new Map<string, Cambio | undefined>();
      for (const [tabla, lista] of porTabla) {
        const ids = [...new Set(lista.map((f) => f.id))];
        const leidas = await db.table(tabla).bulkGet(ids);
        ids.forEach((id, i) => locales.set(clave(tabla, id), leidas[i] as Record<string, unknown> | undefined));
        const ult = await seg.ultimas(tabla, ids);
        for (const id of ids) ultimas.set(clave(tabla, id), ult.get(id));
      }

      for (const f of filas) {
        if (!esValida(f)) {
          res.ignorados++;
          continue;
        }
        // Contenido hostil o corrupto: no se aplica; se guarda en
        // `descartes` con motivo 'remoto-invalido' para que quede rastro
        // (1.8). No se ofrece para restaurar desde la UI.
        const motivoInvalido = validarFilaRemota(f);
        if (motivoInvalido) {
          await descartes.add({
            tabla: f.tabla,
            registroId: f.id,
            ts: Date.now(),
            origen,
            motivo: 'remoto-invalido',
            datos: { motivo: motivoInvalido, fila: f },
          });
          res.descartes++;
          continue;
        }
        seg.ver(f.ts);
        const tabla = db.table(f.tabla);
        const local = locales.get(clave(f.tabla, f.id));
        const ult = ultimas.get(clave(f.tabla, f.id));
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
              const lapida = anotada(f, 'delete', origen);
              await cambios.add(lapida);
              ultimas.set(clave(f.tabla, f.id), lapida);
            }
            res.ignorados++;
            continue;
          }
          const datosNuevos = conDatos(f);
          await tabla.put(datosNuevos);
          const entradaNueva = anotada(f, 'put', origen);
          await cambios.add(entradaNueva);
          locales.set(clave(f.tabla, f.id), datosNuevos);
          ultimas.set(clave(f.tabla, f.id), entradaNueva);
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
            const entradaIgual = anotada(f, 'put', origen);
            await cambios.add(entradaIgual);
            ultimas.set(clave(f.tabla, f.id), entradaIgual);
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
        const datosFinales = f.borrado ? undefined : conDatos(f);
        if (f.borrado) await tabla.delete(f.id);
        else await tabla.put(datosFinales as Record<string, unknown>);
        const entradaFinal = anotada(f, f.borrado ? 'delete' : 'put', origen);
        await cambios.add(entradaFinal);
        locales.set(clave(f.tabla, f.id), datosFinales);
        ultimas.set(clave(f.tabla, f.id), entradaFinal);
        res.aplicados++;
        res.descartes++;
        tocadas.add(f.tabla);
      }
    })
  );

  res.tablas = [...tocadas];
  return res;
}
