/**
 * Seguimiento de cambios sobre Dexie.
 *
 * Registra en la tabla `cambios` cada alta, modificación y borrado de las
 * tablas sincronizables, sin tocar los stores. Los ganchos de Dexie corren
 * dentro de la misma transacción que la escritura, así que no puede haber un
 * cambio sin su entrada. Un borrado deja una lápida (`tipo: 'delete'`): sin
 * ella el otro dispositivo nunca se enteraría y la fila resucitaría al sincronizar.
 *
 * Marca lógica: `ahora()` devuelve siempre «hora del reloj» o «última marca
 * vista + 1», el mayor de los dos. Así un teléfono con el reloj atrasado no
 * pierde todos los conflictos contra otro adelantado, y dos cambios en el
 * mismo milisegundo no comparten marca.
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import { genId } from '../utils/id';
import { TABLAS_SINCRONIZABLES } from './tipos';
import type { Cambio, TipoCambio } from './tipos';

const CLAVE_DISPOSITIVO = 'tp_dispositivo';

/**
 * Identificador estable del dispositivo. Se guarda en localStorage porque los
 * ganchos lo necesitan de forma síncrona; IndexedDB solo responde con promesas.
 */
function leerDispositivo(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_DISPOSITIVO);
    if (guardado) return guardado;
    const nuevo = genId('dev');
    localStorage.setItem(CLAVE_DISPOSITIVO, nuevo);
    return nuevo;
  } catch {
    return genId('dev');
  }
}

export interface Seguimiento {
  /** Identificador estable de este dispositivo (decide los empates). */
  readonly idDispositivo: string;
  /** Marca lógica para un cambio nuevo: estrictamente creciente. */
  ahora(): number;
  /** Da a conocer una marca remota para que la siguiente marca local la supere. */
  ver(ts: number): void;
  /** Ejecuta `fn` sin registrar cambios (se aplican filas que ya vienen de otro sitio). */
  sinRegistrar<T>(fn: () => Promise<T>): Promise<T>;
  /** Última entrada (propia o aplicada) de una fila, si existe. */
  ultima(tabla: string, registroId: string): Promise<Cambio | undefined>;
  /** Quita entradas obsoletas dejando la última de cada fila. Devuelve cuántas quitó. */
  compactar(hasta: number): Promise<number>;
}

/** Una instancia por base de datos: instalar dos veces no duplica los ganchos. */
const INSTALADOS = new WeakMap<Dexie, Seguimiento>();

export function instalarSeguimiento(db: Dexie, opciones: { dispositivo?: string } = {}): Seguimiento {
  const previa = INSTALADOS.get(db);
  if (previa) return previa;

  const idDispositivo = opciones.dispositivo ?? leerDispositivo();
  const cambios = (): Table<Cambio, number> => db.table<Cambio, number>('cambios');
  let reloj = 0;
  // > 0 mientras se aplican filas remotas: esos escritos no deben volver a propagarse.
  let saltando = 0;

  function ahora(): number {
    reloj = Math.max(Date.now(), reloj + 1);
    return reloj;
  }

  function ver(ts: number): void {
    if (ts > reloj) reloj = ts;
  }

  function registrar(trans: Transaction, tabla: string, registroId: string, tipo: TipoCambio): void {
    if (saltando > 0) return;
    const entrada: Cambio = { tabla, registroId, tipo, ts: ahora(), dispositivo: idDispositivo, propagar: 1 };

    // La entrada va en la misma transacción de IndexedDB que la escritura: si la
    // escritura se deshace, se deshace también su entrada. Se escribe directo en
    // el almacén (sin pasar por Table) porque el gancho no admite abrir tablas
    // fuera del alcance de la transacción.
    const aparte = (): void => {
      // Fuera de la transacción en curso y sin esperarla: la nueva espera a que
      // termine la otra, así que ninguna bloquea a la otra.
      try {
        Dexie.ignoreTransaction(() => db.transaction('rw', ['cambios'], () => cambios().add(entrada))).catch(
          (e: unknown) => {
            console.error('[sync] no se pudo registrar el cambio', e);
          }
        );
      } catch (e) {
        console.error('[sync] no se pudo registrar el cambio', e);
      }
    };

    try {
      const peticion = trans.idbtrans.objectStore('cambios').add(entrada);
      // Un fallo de la entrada no debe deshacer la escritura del usuario.
      peticion.onerror = (evento) => {
        evento.preventDefault();
        aparte();
      };
    } catch {
      aparte();
    }
  }

  for (const tabla of TABLAS_SINCRONIZABLES) {
    const t = db.table(tabla);
    // Orden de los argumentos de Dexie: creating(clave, objeto, trans).
    t.hook('creating', (primKey: unknown, _obj: unknown, trans: Transaction) => {
      registrar(trans, tabla, String(primKey), 'put');
    });
    t.hook('updating', (_modificaciones: unknown, primKey: unknown, _obj: unknown, trans: Transaction) => {
      registrar(trans, tabla, String(primKey), 'put');
    });
    t.hook('deleting', (primKey: unknown, _obj: unknown, trans: Transaction) => {
      registrar(trans, tabla, String(primKey), 'delete');
    });
  }

  const seg: Seguimiento = {
    idDispositivo,
    ahora,
    ver,
    async sinRegistrar<T>(fn: () => Promise<T>): Promise<T> {
      saltando++;
      try {
        return await fn();
      } finally {
        saltando--;
      }
    },
    async ultima(tabla: string, registroId: string): Promise<Cambio | undefined> {
      return cambios().where('[tabla+registroId]').equals([tabla, registroId]).last();
    },
    async compactar(hasta: number): Promise<number> {
      const viejas = await cambios().where('id').below(hasta).toArray();
      const ultimaPorFila = new Map<string, number>();
      for (const e of viejas) {
        const k = e.tabla + '\u0000' + e.registroId;
        const anterior = ultimaPorFila.get(k);
        if (anterior === undefined || (e.id ?? 0) > anterior) ultimaPorFila.set(k, e.id ?? 0);
      }
      const sobran = viejas
        .filter((e) => ultimaPorFila.get(e.tabla + '\u0000' + e.registroId) !== e.id)
        .map((e) => e.id as number);
      await cambios().bulkDelete(sobran);
      return sobran.length;
    },
  };

  INSTALADOS.set(db, seg);
  return seg;
}
