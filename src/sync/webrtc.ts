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
}

/** Sin servidores: solo candidatos de la red local. */
const CONFIG_RTC: RTCConfiguration = { iceServers: [] };

function canalDe(dc: RTCDataChannel): Canal {
  let avisarAbierto: () => void = () => undefined;
  const abierto = new Promise<void>((resolver) => {
    avisarAbierto = resolver;
  });
  const receptores: ((texto: string) => void)[] = [];
  if (dc.readyState === 'open') avisarAbierto();
  else dc.onopen = () => avisarAbierto();
  // El receptor se registra desde el principio: un mensaje que llegue antes de
  // que la sesión se suscriba no se pierde.
  dc.onmessage = (e: MessageEvent) => {
    const texto = String(e.data);
    for (const f of receptores) f(texto);
  };
  return {
    abierto,
    enviar: (texto) => dc.send(texto),
    alRecibir: (fn) => {
      receptores.push(fn);
    },
    cerrar: () => dc.close(),
  };
}

/** Espera a que estén todos los candidatos locales (sin trickle). Tope de 3 s. */
function esperarCandidatos(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolver) => {
    const listo = (): void => {
      pc.removeEventListener('icegatheringstatechange', listo);
      resolver();
    };
    // Pasados 3 s `listo()` repite el aviso: no hace falta cancelar el temporizador.
    setTimeout(listo, 3000);
    pc.addEventListener('icegatheringstatechange', listo);
  });
}

/** El teléfono que crea el enlace. Devuelve el código (oferta) para el otro. */
export async function crearOferta(): Promise<Enlace> {
  const pc = new RTCPeerConnection(CONFIG_RTC);
  const dc = pc.createDataChannel('sync', { ordered: true });
  const canal = canalDe(dc);
  await pc.setLocalDescription(await pc.createOffer());
  await esperarCandidatos(pc);
  return { pc, canal, codigo: await codificarCodigo(pc.localDescription?.sdp ?? '', 'oferta') };
}

/** El teléfono que se une, a partir del código (oferta) del otro. */
export async function aceptarOferta(codigo: string): Promise<Enlace> {
  const pc = new RTCPeerConnection(CONFIG_RTC);
  const dc = await new Promise<RTCDataChannel>((resolver, rechazar) => {
    pc.ondatachannel = (e: RTCDataChannelEvent) => resolver(e.channel);
    setTimeout(() => rechazar(new Error('sin-canal')), 10_000);
  });
  const canal = canalDe(dc);
  await pc.setRemoteDescription({ type: 'offer', sdp: await decodificarCodigo(codigo) });
  await pc.setLocalDescription(await pc.createAnswer());
  await esperarCandidatos(pc);
  return { pc, canal, codigo: await codificarCodigo(pc.localDescription?.sdp ?? '', 'respuesta') };
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
