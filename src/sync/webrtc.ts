/**
 * Enlace directo entre dos teléfonos con WebRTC (el mismo mecanismo que usan las
 * llamadas por internet), limitado a la red local: los datos van directos
 * entre los dos teléfonos, sin pasar por ningún servidor.
 *
 * Para verse necesitan intercambiar dos descripciones (SDP): la oferta y la
 * respuesta. Hay dos formas de intercambiarlas:
 * - Por código corto de 6 dígitos: el intercambio viaja por Supabase Realtime
 *   Broadcast (solo la señalización; los datos siguen yendo directos entre
 *   los teléfonos). Es la vía principal cuando hay internet.
 * - Por QR o copiando y pegando el código: sin internet, como antes.
 * Ver `codigo.ts`.
 *
 * El canal de datos va cifrado de extremo a extremo (DTLS) y solo puede
 * completarse quien tiene las dos descripciones.
 */
import { codificarCodigo, decodificarCodigo } from './codigo';
import type { Canal } from './enlace';

export interface Enlace {
  pc: RTCPeerConnection;
  canal: Canal;
  /** Código para el otro teléfono (oferta al crear, respuesta al unirse). */
  codigo: string;
  /** Código de emparejamiento (6 dígitos) que muestra el creador del enlace:
   * el otro teléfono debe escribirlo para que se acepte la conexión (1.7).
   * Solo lo tiene quien crea; al unirse va vacío. */
  codigoEmparejamiento: string;
}

/**
 * Un servidor STUN público solo para descubrir candidatos: si los dos
 * teléfonos no se ven con sus direcciones locales (router con aislamiento
 * de clientes, varias subredes…), el STUN les dice su dirección pública
 * para intentarlo por ahí. Por el STUN no pasa ningún dato de la tienda:
 * solo la pregunta «¿cuál es mi dirección?» y su respuesta. Sin STUN, en
 * esas redes el enlace no se podía abrir y no había forma de saber por qué.
 */
const CONFIG_RTC: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** El canal existe ya en el teléfono que crea; en el que se une llega después. */
type CanalEntrante = RTCDataChannel | Promise<RTCDataChannel>;

function canalDe(entrante: CanalEntrante, pc?: RTCPeerConnection): Canal {
  let dc: RTCDataChannel | undefined;
  let avisarAbierto: () => void = () => undefined;
  let avisarFallo: (e: Error) => void = () => undefined;
  const abierto = new Promise<void>((resolver, rechazar) => {
    avisarAbierto = resolver;
    avisarFallo = rechazar;
  });
  const receptores: ((texto: string) => void)[] = [];
  const recibir = (c: RTCDataChannel): void => {
    dc = c;
    if (c.readyState === 'open') avisarAbierto();
    else c.onopen = () => avisarAbierto();
    // El receptor se registra desde el principio: un mensaje que llegue antes de
    // que la sesión se suscriba no se pierde.
    c.onmessage = (e: MessageEvent) => {
      const texto = String(e.data);
      for (const f of receptores) f(texto);
    };
  };
  if (typeof (entrante as RTCDataChannel).readyState === 'string') recibir(entrante as RTCDataChannel);
  // Si el canal nunca llega, `abierto` queda sin resolver y la sesión da el
  // tiempo por agotado (no se queda colgada).
  else void (entrante as Promise<RTCDataChannel>).then(recibir, () => undefined);
  if (pc) {
    // Si la conexión ICE fracasa, `abierto` rechaza en lugar de quedarse
    // esperando hasta el tiempo agotado: la sesión puede decir qué pasó
    // («los teléfonos no se ven en la red») en vez de un error genérico.
    const alCambiarEstado = (): void => {
      if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
        avisarFallo(new Error('conexion-webrtc-fallida'));
      }
    };
    pc.addEventListener('iceconnectionstatechange', alCambiarEstado);
    pc.addEventListener('connectionstatechange', alCambiarEstado);
  }
  return {
    abierto,
    enviar: (texto) => dc?.send(texto),
    alRecibir: (fn) => {
      receptores.push(fn);
    },
    cerrar: () => dc?.close(),
  };
}

/** Espera a que estén todos los candidatos locales (sin trickle). Tope de 5 s. */
function esperarCandidatos(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolver) => {
    let pendiente = true;
    const terminar = (): void => {
      // Solo cuenta la primera vez: por el aviso o por el tope de tiempo.
      if (!pendiente) return;
      pendiente = false;
      resolver();
    };
    const listo = (): void => {
      // El aviso también llega al empezar a buscar: solo vale cuando terminó.
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', listo);
      terminar();
    };
    // Si a los 5 s sigue buscando, se sigue con las direcciones que haya.
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', listo);
      terminar();
    }, 5000);
    pc.addEventListener('icegatheringstatechange', listo);
  });
}

/** Código de emparejamiento de 6 dígitos (100000–999999), aleatorio. */
export function generarCodigoEmparejamiento(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const n = new DataView(bytes.buffer).getUint32(0, false);
  return String(100000 + (n % 900000));
}

/** El teléfono que crea el enlace. Devuelve el código (oferta) para el otro. */
export async function crearOferta(): Promise<Enlace> {
  const pc = new RTCPeerConnection(CONFIG_RTC);
  const canal = canalDe(pc.createDataChannel('sync', { ordered: true }), pc);
  await pc.setLocalDescription(await pc.createOffer());
  await esperarCandidatos(pc);
  return {
    pc,
    canal,
    codigo: await codificarCodigo(pc.localDescription?.sdp ?? '', 'oferta'),
    codigoEmparejamiento: generarCodigoEmparejamiento(),
  };
}

/** El teléfono que se une, a partir del código (oferta) del otro. */
export async function aceptarOferta(codigo: string): Promise<Enlace> {
  const pc = new RTCPeerConnection(CONFIG_RTC);
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: await decodificarCodigo(codigo) });
    // El canal lo crea el otro teléfono y puede no aparecer hasta que la
    // conexión esté hecha, es decir, hasta que el otro aplique esta respuesta.
    // Por eso no se espera aquí: `canal.abierto` se resuelve cuando llegue.
    const canalRemoto = new Promise<RTCDataChannel>((resolver) => {
      pc.ondatachannel = (e) => resolver(e.channel);
    });
    await pc.setLocalDescription(await pc.createAnswer());
    await esperarCandidatos(pc);
    return {
      pc,
      canal: canalDe(canalRemoto, pc),
      codigo: await codificarCodigo(pc.localDescription?.sdp ?? '', 'respuesta'),
      codigoEmparejamiento: '',
    };
  } catch (e) {
    pc.close();
    throw e;
  }
}

/** El teléfono que creó el enlace, al recibir el código (respuesta) del otro. */
export async function aceptarRespuesta(enlace: Enlace, codigo: string): Promise<void> {
  await enlace.pc.setRemoteDescription({ type: 'answer', sdp: await decodificarCodigo(codigo) });
}

export function cerrarEnlace(enlace: Enlace | null): void {
  if (!enlace) return;
  try {
    enlace.canal.cerrar();
    enlace.pc.close();
  } catch {
    // Ya estaba cerrado.
  }
}

// ============================================================
// Señalización por código corto (Supabase Realtime Broadcast)
// ============================================================

/**
 * Transporte mínimo de señalización: solo lleva la oferta y la respuesta
 * WebRTC entre los dos teléfonos. En la app es un canal de Supabase
 * Realtime Broadcast (ver `canalSenalWifi` en nube.ts); en las pruebas,
 * un par de canales de memoria.
 *
 * Los mensajes son: `pide-oferta` (quien se une pide la oferta),
 * `oferta` (el creador responde con su SDP) y `respuesta` (quien se une
 * devuelve su SDP). Cada mensaje lleva `de` (quién lo envía) y, cuando va
 * dirigido a un solo teléfono, `para` (a quién va). La sala la identifica
 * el código de 6 dígitos: es el mismo código de emparejamiento, no otro.
 *
 * Por la señalización solo viajan las descripciones SDP (que no contienen
 * datos de la tienda); la sincronización en sí sigue yendo directa por
 * WebRTC, y el handshake de emparejamiento del canal (`auth` en enlace.ts)
 * sigue siendo obligatorio: conocer el código de la sala no basta para
 * recibir datos, hay que demostrarlo además por el canal cifrado.
 */
export interface SenalWifi {
  enviar(evento: string, datos: Record<string, unknown>): void;
  alRecibir(fn: (evento: string, datos: Record<string, unknown>) => void): void;
  cerrar(): void;
}

export interface OpcionesSenal {
  /** Milisegundos de espera antes de dar la sala por perdida. */
  esperaMs?: number;
  /** Milisegundos entre reintentos de `pide-oferta` (solo al unirse). */
  reintentoMs?: number;
  /** Si se aborta, la espera termina con `cancelado`. */
  abortar?: AbortSignal;
}

/** Identificador aleatorio del teléfono dentro de la sala (no es el id del dispositivo). */
function idAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function textoDe(datos: Record<string, unknown>, clave: string): string | undefined {
  const v = datos[clave];
  return typeof v === 'string' ? v : undefined;
}

function errorDe(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * El creador del enlace espera a que otro teléfono se una a la sala con el
 * código de 6 dígitos. Cuando llega `pide-oferta` le envía su oferta por la
 * señalización; cuando llega la `respuesta` la aplica y la promesa se
 * resuelve: el canal WebRTC ya puede abrirse. Rechaza con
 * `sala-tiempo-agotado` si nadie se une en `esperaMs` (por defecto 5 min).
 * Solo se atiende a un teléfono: si otro pide después, se le ignora. Si el
 * mismo teléfono repite `pide-oferta` (su primer intento se perdió), se le
 * vuelve a enviar la oferta.
 */
export async function esperarUnionPorSenal(
  enlace: Enlace,
  senal: SenalWifi,
  opciones: OpcionesSenal = {}
): Promise<void> {
  const esperaMs = opciones.esperaMs ?? 300_000;
  const idCreador = idAleatorio();
  let idUnion: string | undefined;
  // La respuesta puede llegar dos veces (quien se une la reenvía por si se
  // perdió la primera): solo se aplica la primera.
  let respuestaRecibida = false;
  return new Promise<void>((resolver, rechazar) => {
    let terminado = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined = undefined;
    const terminar = (e?: Error): void => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      senal.cerrar();
      if (e) rechazar(e);
      else resolver();
    };
    const alAbortar = (): void => terminar(new Error('cancelado'));
    if (opciones.abortar?.aborted) {
      terminar(new Error('cancelado'));
      return;
    }
    opciones.abortar?.addEventListener('abort', alAbortar, { once: true });
    temporizador = setTimeout(() => terminar(new Error('sala-tiempo-agotado')), esperaMs);
    senal.alRecibir((evento, datos) => {
      if (terminado) return;
      if (evento === 'pide-oferta') {
        const de = textoDe(datos, 'de');
        if (!de) return;
        if (idUnion && de !== idUnion) return;
        idUnion = de;
        senal.enviar('oferta', { de: idCreador, para: de, sdp: enlace.codigo });
      } else if (evento === 'respuesta') {
        const sdp = textoDe(datos, 'sdp');
        if (!sdp || textoDe(datos, 'para') !== idCreador || respuestaRecibida) return;
        respuestaRecibida = true;
        void aceptarRespuesta(enlace, sdp).then(
          () => terminar(),
          (e: unknown) => terminar(errorDe(e))
        );
      }
    });
  });
}

/**
 * Quien se une a una sala con el código de 6 dígitos: pide la oferta por la
 * señalización (reintentando cada `reintentoMs` por si el creador aún no
 * estaba escuchando), aplica la que va dirigida a él y devuelve el enlace
 * con su respuesta ya enviada. La respuesta se reenvía dos veces por si el
 * primer envío se perdió. Rechaza con `sala-no-encontrada` si en `esperaMs`
 * (por defecto 60 s) ningún creador responde: el código puede estar mal
 * escrito o el otro teléfono aún no creó la sala.
 *
 * La señalización (`senal`) ya identifica la sala: se crea con el código
 * (ver `canalSenalWifi` en nube.ts).
 */
export async function unirseASala(senal: SenalWifi, opciones: OpcionesSenal = {}): Promise<Enlace> {
  const esperaMs = opciones.esperaMs ?? 60_000;
  const reintentoMs = opciones.reintentoMs ?? 5000;
  const idUnion = idAleatorio();
  // Solo se aplica la primera oferta dirigida a este teléfono: una repetida
  // (el creador la reenvía si pidió de nuevo) no crea un segundo enlace.
  let ofertaRecibida = false;
  return new Promise<Enlace>((resolver, rechazar) => {
    let terminado = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined = undefined;
    let reintentos: ReturnType<typeof setInterval> | undefined = undefined;
    let reenvio1: ReturnType<typeof setTimeout> | undefined = undefined;
    let reenvio2: ReturnType<typeof setTimeout> | undefined = undefined;
    const pedir = (): void => {
      senal.enviar('pide-oferta', { de: idUnion });
    };
    const terminar = (e?: Error, enlace?: Enlace): void => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      clearInterval(reintentos);
      if (e) {
        clearTimeout(reenvio1);
        clearTimeout(reenvio2);
        senal.cerrar();
        rechazar(e);
      } else if (enlace) {
        // La señalización se cierra tras los reenvíos, no ahora: si se
        // cerrara ya, los reenvíos de la respuesta no saldrían.
        resolver(enlace);
      } else {
        senal.cerrar();
        rechazar(new Error('sala-no-encontrada'));
      }
    };
    const alAbortar = (): void => terminar(new Error('cancelado'));
    if (opciones.abortar?.aborted) {
      terminar(new Error('cancelado'));
      return;
    }
    opciones.abortar?.addEventListener('abort', alAbortar, { once: true });
    temporizador = setTimeout(() => terminar(new Error('sala-no-encontrada')), esperaMs);
    reintentos = setInterval(pedir, reintentoMs);
    pedir();
    senal.alRecibir((evento, datos) => {
      if (terminado || evento !== 'oferta') return;
      const sdp = textoDe(datos, 'sdp');
      if (!sdp || textoDe(datos, 'para') !== idUnion || ofertaRecibida) return;
      ofertaRecibida = true;
      clearInterval(reintentos);
      void aceptarOferta(sdp).then(
        (enlace) => {
          const respuesta = { de: idUnion, para: textoDe(datos, 'de') ?? '', sdp: enlace.codigo };
          senal.enviar('respuesta', respuesta);
          reenvio1 = setTimeout(() => senal.enviar('respuesta', respuesta), 2000);
          reenvio2 = setTimeout(() => senal.cerrar(), 5000);
          terminar(undefined, enlace);
        },
        (e: unknown) => terminar(errorDe(e))
      );
    });
  });
}
