/**
 * Sincronización por un canal directo (WiFi, cable, lo que sea). No sabe cómo
 * viajan los mensajes: solo pide un `Canal` que los entregue en orden. Usa el
 * mismo motor que la nube.
 *
 * Protocolo, idéntico en los dos extremos:
 * 1. `hola`: quién soy y desde qué punto quiero que me envíen (-1 = todo).
 * 2. `cab` + `lote`*: lo que envío; cada lote se confirma con un `ack`.
 * 3. `fin` / `fin-ok`: cierre de cada sentido; quien recibe guarda el punto
 *    hasta el que le enviaron, para que la próxima vez viaje solo lo nuevo.
 *
 * Las dos direcciones van a la vez y no se esperan entre sí: por eso el envío
 * no corre dentro de la cola de recepción (si no, un `ack` nunca se procesaría).
 */
import type { Cambio, FilaRemota, RegistroSync } from './tipos';
import { aplicarRemotas, obtenerCambiosDesde, obtenerEstadoCompleto } from './motor';
import type { ContextoSync } from './motor';

export interface Canal {
  /** Se resuelve cuando el canal puede enviar y recibir. */
  abierto: Promise<void>;
  enviar(texto: string): void;
  alRecibir(fn: (texto: string) => void): void;
  cerrar(): void;
}

export type FaseSync = 'conectando' | 'preparando' | 'enviando';

export interface ProgresoSync {
  fase: FaseSync;
  /** Filas que este teléfono ha enviado. */
  enviadas: number;
  porEnviar: number;
  /** Filas que este teléfono ha recibido. */
  recibidas: number;
  porRecibir: number;
}

export interface ResultadoSesion {
  dispositivoRemoto: string;
  /** Filas enviadas al otro teléfono. */
  enviado: number;
  /** Filas que cambiaron algo aquí. */
  aplicados: number;
  /** Versiones locales que perdieron y quedaron guardadas en `descartes`. */
  descartes: number;
  /** Tablas tocadas: las que hay que recargar en los stores. */
  tablas: string[];
}

export interface OpcionesSesion {
  enProgreso?: (p: ProgresoSync) => void;
  /** Milisegundos sin recibir nada antes de dar el enlace por perdido. */
  sinActividadMs?: number;
  filasPorLote?: number;
}

/** Clave en `syncMeta` donde se guarda hasta qué punto envió `dispositivo`. */
export const cursorDe = (dispositivo: string): string => `wifi_desde:${dispositivo}`;

interface Hola {
  t: 'hola';
  dispositivo: string;
  desde: number;
}
interface Cab {
  t: 'cab';
  filas: number;
  hasta: number;
}
interface Lote {
  t: 'lote';
  n: number;
  filas: FilaRemota[];
}
type Mensaje = Hola | Cab | Lote | { t: 'ack'; n: number } | { t: 'fin' } | { t: 'fin-ok' };

export async function sincronizarPorCanal(
  ctx: ContextoSync,
  canal: Canal,
  opciones: OpcionesSesion = {}
): Promise<ResultadoSesion> {
  const meta = ctx.db.table<RegistroSync, string>('syncMeta');
  const cambios = ctx.db.table<Cambio, number>('cambios');
  const sinActividad = opciones.sinActividadMs ?? 60_000;
  const filasPorLote = opciones.filasPorLote ?? 200;
  const avisar = opciones.enProgreso ?? (() => undefined);

  return new Promise<ResultadoSesion>((resolver, rechazar) => {
    const progreso: ProgresoSync = { fase: 'conectando', enviadas: 0, porEnviar: 0, recibidas: 0, porRecibir: 0 };
    avisar({ ...progreso });

    const publicar = (cambio: Partial<ProgresoSync>): void => {
      Object.assign(progreso, cambio);
      avisar({ ...progreso });
    };

    let remoto: Hola | undefined;
    let cabRemota: Cab | undefined;
    let confirmacion: ((n: number) => void) | undefined;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let cola: Promise<unknown> = Promise.resolve();
    let recepcionCerrada = false;
    let envioConfirmado = false;
    const propio = { filas: 0 };
    const aplicado = { filas: 0, descartes: 0, tablas: new Set<string>() };

    const fallar = (e: unknown): void => {
      clearTimeout(temporizador);
      canal.cerrar();
      rechazar(e instanceof Error ? e : new Error(String(e)));
    };
    const armar = (): void => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => fallar(new Error('tiempo-agotado')), sinActividad);
    };
    const comprobar = (): void => {
      // Cada sentido cierra por su lado: el mío cuando el otro confirma (`fin-ok`)
      // y el suyo cuando me dice que terminó (`fin`). La sesión acaba con los dos.
      if (!recepcionCerrada || !envioConfirmado || !remoto) return;
      clearTimeout(temporizador);
      canal.cerrar();
      resolver({
        dispositivoRemoto: remoto.dispositivo,
        enviado: propio.filas,
        aplicados: aplicado.filas,
        descartes: aplicado.descartes,
        tablas: [...aplicado.tablas],
      });
    };
    const enviar = (m: Mensaje): void => {
      canal.enviar(JSON.stringify(m));
    };

    async function emitir(hola: Hola): Promise<void> {
      publicar({ fase: 'preparando' });
      const maximo = (await cambios.orderBy('id').last())?.id ?? 0;
      let filas: FilaRemota[];
      let hasta: number;
      if (hola.desde >= 0 && hola.desde <= maximo) {
        const incremental = await obtenerCambiosDesde(ctx, hola.desde);
        filas = incremental.filas;
        hasta = incremental.hasta;
      } else {
        filas = await obtenerEstadoCompleto(ctx);
        hasta = maximo;
      }
      publicar({ fase: 'enviando', porEnviar: filas.length });
      enviar({ t: 'cab', filas: filas.length, hasta });
      for (let n = 0, i = 0; i < filas.length; n++, i += filasPorLote) {
        const lote = filas.slice(i, i + filasPorLote);
        const confirmado = new Promise<number>((resolverAck) => {
          confirmacion = resolverAck;
        });
        enviar({ t: 'lote', n, filas: lote });
        if ((await confirmado) !== n) throw new Error('confirmacion-invalida');
        propio.filas += lote.length;
        publicar({ enviadas: propio.filas });
      }
      enviar({ t: 'fin' });
      comprobar();
    }

    async function procesar(texto: string): Promise<void> {
      const m = JSON.parse(texto) as Mensaje;
      switch (m.t) {
        case 'hola':
          if (remoto) return;
          remoto = m;
          void emitir(m).catch(fallar);
          break;
        case 'cab':
          cabRemota = m;
          publicar({ porRecibir: m.filas });
          break;
        case 'lote': {
          const r = await aplicarRemotas(ctx, m.filas, `wifi:${remoto?.dispositivo ?? '?'}`);
          aplicado.filas += r.aplicados;
          aplicado.descartes += r.descartes;
          for (const tabla of r.tablas) aplicado.tablas.add(tabla);
          progreso.recibidas += m.filas.length;
          publicar({});
          enviar({ t: 'ack', n: m.n });
          break;
        }
        case 'ack':
          if (confirmacion) {
            confirmacion(m.n);
            confirmacion = undefined;
          }
          break;
        case 'fin':
          if (cabRemota && remoto) {
            await meta.put({ clave: cursorDe(remoto.dispositivo), value: cabRemota.hasta });
          }
          enviar({ t: 'fin-ok' });
          recepcionCerrada = true;
          comprobar();
          break;
        case 'fin-ok':
          envioConfirmado = true;
          comprobar();
          break;
      }
    }

    armar();
    canal.abierto
      .then(async () => {
        const guardado = await meta.get(cursorDe(ctx.seg.idDispositivo));
        enviar({
          t: 'hola',
          dispositivo: ctx.seg.idDispositivo,
          desde: typeof guardado?.value === 'number' ? guardado.value : -1,
        });
      })
      .catch(fallar);
    canal.alRecibir((texto) => {
      armar();
      cola = cola.then(() => procesar(texto)).catch(fallar);
    });
  });
}
