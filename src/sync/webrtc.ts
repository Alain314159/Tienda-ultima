/**
 * Enlace directo entre dos teléfonos con WebRTC (el mismo mecanismo que usan las
 * llamadas por internet), limitado a la red local: no hay servidores STUN/TURN,
 * así que solo se conectan equipos que se alcanzan por la misma WiFi.
 *
 * Para Verse necesitan intercambiar dos descripciones (SDP): la oferta y la
 * respuesta. Van en códigos QR o copiadas y pegadas; ver `codigo.ts`.
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

/** Sin servidores: solo candidatos de la red local. */
const CONFIG_RTC: RTCConfiguration = { iceServers: [] };

/** El canal existe ya en el teléfono que crea; en el que se une llega después. */
type CanalEntrante = RTCDataChannel | Promise<RTCDataChannel>;

function canalDe(entrante: CanalEntrante): Canal {
  let dc: RTCDataChannel | undefined;
  let avisarAbierto: () => void = () => undefined;
  const abierto = new Promise<void>((resolver) => {
    avisarAbierto = resolver;
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
  const canal = canalDe(pc.createDataChannel('sync', { ordered: true }));
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
      canal: canalDe(canalRemoto),
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
