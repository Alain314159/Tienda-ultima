/**
 * Señalización WiFi por código corto (src/sync/webrtc.ts + canalSenalWifi en
 * nube.ts).
 *
 * Contrato: el creador y quien se une intercambian la oferta y la respuesta
 * WebRTC por la señalización sin QR; el creador atiende a un solo teléfono;
 * quien se une ignora ofertas que no van dirigidas a él; sin sala, el que se
 * une recibe `sala-no-encontrada` y el creador `sala-tiempo-agotado`; y si la
 * conexión ICE fracasa, el canal avisa en lugar de quedarse esperando.
 *
 * Como en este entorno no hay RTCPeerConnection real, se usa una falsa con
 * ofertas/respuestas de mentira y un canal de datos que se abre a mano.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { crearOferta, esperarUnionPorSenal, generarCodigoEmparejamiento, unirseASala } from '../src/sync/webrtc';
import { canalSenalWifi } from '../src/sync/nube';

/** Canal de datos falso: empieza cerrándose y se abre a mano. */
class CanalFalso {
  constructor() {
    this.readyState = 'connecting';
    this.onopen = null;
    this.onmessage = null;
    this.enviados = [];
  }

  abrir() {
    this.readyState = 'open';
    this.onopen?.();
  }

  send(texto) {
    this.enviados.push(texto);
  }

  close() {
    this.readyState = 'closed';
  }
}

/** RTCPeerConnection falsa: ofertas/respuestas con SDP de mentira. */
class PcFalsa {
  constructor() {
    this.iceGatheringState = 'complete';
    this.iceConnectionState = 'new';
    this.connectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.ondatachannel = null;
    this.canal = null;
    this.escuchas = new Map();
  }

  addEventListener(tipo, fn) {
    if (!this.escuchas.has(tipo)) this.escuchas.set(tipo, []);
    this.escuchas.get(tipo).push(fn);
  }

  removeEventListener(tipo, fn) {
    this.escuchas.set(
      tipo,
      (this.escuchas.get(tipo) ?? []).filter((f) => f !== fn)
    );
  }

  emitir(tipo) {
    for (const fn of this.escuchas.get(tipo) ?? []) fn();
  }

  async createOffer() {
    return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=falsa-oferta\r\n' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=falsa-respuesta\r\n' };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  createDataChannel() {
    this.canal = new CanalFalso();
    return this.canal;
  }

  close() {
    this.connectionState = 'closed';
  }
}

/**
 * Sala de señalización en memoria: cada lado escucha a los demás (pero no a
 * sí mismo, como el Broadcast con `self: false`) y la entrega es diferida,
 * como en la red.
 */
function salaFalsa() {
  const lados = [];
  const crearLado = () => {
    const receptores = [];
    const lado = {
      enviados: [],
      enviar(evento, datos) {
        this.enviados.push({ evento, datos });
        setTimeout(() => {
          for (const otro of lados) {
            if (otro === lado) continue;
            for (const fn of otro._receptores) fn(evento, { ...datos });
          }
        }, 0);
      },
      alRecibir(fn) {
        receptores.push(fn);
      },
      cerrar() {},
      /** Simula un mensaje que llega a este lado (p. ej. de otro teléfono). */
      inyectar(evento, datos) {
        for (const fn of receptores) fn(evento, { ...datos });
      },
      _receptores: receptores,
    };
    lados.push(lado);
    return lado;
  };
  return { crearLado };
}

/** Cliente de Supabase falso, solo con lo que usa canalSenalWifi. */
function clienteSupabaseFalso(estadoSuscripcion = 'SUBSCRIBED') {
  const canales = [];
  const cliente = {
    canales,
    channel(nombre, opciones) {
      const canal = {
        nombre,
        opciones,
        manejadores: [],
        suscrito: false,
        enviados: [],
        on(tipo, filtro, fn) {
          this.manejadores.push({ tipo, filtro, fn });
          return this;
        },
        subscribe(cb) {
          this.suscrito = true;
          setTimeout(() => cb(estadoSuscripcion), 0);
          return this;
        },
        async unsubscribe() {
          this.suscrito = false;
          return 'ok';
        },
        async send(mensaje) {
          this.enviados.push(mensaje);
          return 'ok';
        },
        emitir(evento, payload) {
          for (const m of this.manejadores) {
            if (m.tipo === 'broadcast' && m.filtro.event === evento) m.fn({ event: evento, payload });
          }
        },
      };
      canales.push(canal);
      return canal;
    },
  };
  return cliente;
}

beforeAll(() => {
  vi.stubGlobal('RTCPeerConnection', PcFalsa);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('intercambio por señalización', () => {
  it('el creador y quien se une intercambian oferta y respuesta sin QR', async () => {
    const sala = salaFalsa();
    const enlaceCreador = await crearOferta();
    const espera = esperarUnionPorSenal(enlaceCreador, sala.crearLado());
    const enlaceUnion = await unirseASala(sala.crearLado());
    await espera;

    expect(enlaceUnion.pc.remoteDescription.type).toBe('offer');
    expect(enlaceUnion.pc.remoteDescription.sdp).toBe(enlaceCreador.pc.localDescription.sdp);
    expect(enlaceCreador.pc.remoteDescription.type).toBe('answer');
    expect(enlaceCreador.pc.remoteDescription.sdp).toBe(enlaceUnion.pc.localDescription.sdp);
    // El código de emparejamiento sigue siendo el de la sala: no hay otro.
    expect(generarCodigoEmparejamiento()).toMatch(/^[1-9]\d{5}$/);
  });

  it('quien se une a una sala que no existe recibe sala-no-encontrada', async () => {
    const sala = salaFalsa();
    await expect(unirseASala(sala.crearLado(), { esperaMs: 120, reintentoMs: 30 })).rejects.toThrow(
      'sala-no-encontrada'
    );
  });

  it('el creador sin nadie que se una agota el tiempo', async () => {
    const sala = salaFalsa();
    const enlace = await crearOferta();
    await expect(esperarUnionPorSenal(enlace, sala.crearLado(), { esperaMs: 120 })).rejects.toThrow(
      'sala-tiempo-agotado'
    );
  });

  it('el creador atiende a un solo teléfono: el segundo queda fuera', async () => {
    const sala = salaFalsa();
    const enlaceCreador = await crearOferta();
    const espera = esperarUnionPorSenal(enlaceCreador, sala.crearLado());
    await unirseASala(sala.crearLado());
    await espera;
    await expect(unirseASala(sala.crearLado(), { esperaMs: 150, reintentoMs: 30 })).rejects.toThrow(
      'sala-no-encontrada'
    );
  });

  it('quien se une ignora una oferta que no va dirigida a él', async () => {
    const sala = salaFalsa();
    const ladoUnion = sala.crearLado();
    const oferta = await crearOferta();
    const promesa = unirseASala(ladoUnion, { esperaMs: 500, reintentoMs: 50 });
    // Una oferta para otro teléfono: debe ignorarla y seguir esperando.
    ladoUnion.inyectar('oferta', { de: 'otro-creador', para: 'otro-telefono', sdp: oferta.codigo });
    await new Promise((r) => setTimeout(r, 50));
    let resuelta = false;
    void promesa.then(() => {
      resuelta = true;
    });
    expect(resuelta).toBe(false);
    // La oferta buena, dirigida a él (su id es el `de` de su pide-oferta).
    const pide = ladoUnion.enviados.find((m) => m.evento === 'pide-oferta');
    expect(pide).toBeDefined();
    ladoUnion.inyectar('oferta', { de: 'creador-x', para: pide.datos.de, sdp: oferta.codigo });
    const enlace = await promesa;
    expect(enlace.pc.remoteDescription.sdp).toBe(oferta.pc.localDescription.sdp);
  });

  it('abortar la espera termina con cancelado', async () => {
    const sala = salaFalsa();
    const enlace = await crearOferta();
    const controlador = new AbortController();
    const promesa = esperarUnionPorSenal(enlace, sala.crearLado(), {
      esperaMs: 5000,
      abortar: controlador.signal,
    });
    controlador.abort();
    await expect(promesa).rejects.toThrow('cancelado');
  });
});

describe('canal WebRTC', () => {
  it('si la conexión ICE fracasa, el canal avisa en lugar de quedarse esperando', async () => {
    const enlace = await crearOferta();
    const fallo = expect(enlace.canal.abierto).rejects.toThrow('conexion-webrtc-fallida');
    enlace.pc.iceConnectionState = 'failed';
    enlace.pc.emitir('iceconnectionstatechange');
    await fallo;
  });

  it('el canal avisa cuando se abre', async () => {
    const enlace = await crearOferta();
    let abierta = false;
    void enlace.canal.abierto.then(() => {
      abierta = true;
    });
    expect(abierta).toBe(false);
    enlace.pc.canal.abrir();
    await enlace.canal.abierto;
    expect(abierta).toBe(true);
  });
});

describe('canalSenalWifi (Supabase Realtime Broadcast)', () => {
  it('crea un canal por sala y reenvía los mensajes en los dos sentidos', async () => {
    const cliente = clienteSupabaseFalso();
    const senal = await canalSenalWifi('123456', cliente);
    expect(cliente.canales).toHaveLength(1);
    expect(cliente.canales[0].nombre).toBe('tp-wifi-123456');
    // No recibe sus propios mensajes (self: false).
    expect(cliente.canales[0].opciones.config.broadcast.self).toBe(false);

    const recibidos = [];
    senal.alRecibir((evento, datos) => recibidos.push([evento, datos]));
    cliente.canales[0].emitir('oferta', { sdp: 'TP1X' });
    expect(recibidos).toEqual([['oferta', { sdp: 'TP1X' }]]);

    senal.enviar('respuesta', { sdp: 'TP1Y' });
    await new Promise((r) => setTimeout(r, 0));
    expect(cliente.canales[0].enviados).toEqual([{ type: 'broadcast', event: 'respuesta', payload: { sdp: 'TP1Y' } }]);

    senal.cerrar();
    expect(cliente.canales[0].suscrito).toBe(false);
  });

  it('si no se suscribe, lanza senal-no-disponible', async () => {
    const cliente = clienteSupabaseFalso('TIMED_OUT');
    await expect(canalSenalWifi('123456', cliente)).rejects.toThrow('senal-no-disponible');
  });
});
