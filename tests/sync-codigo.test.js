/**
 * Código de enlace (src/sync/codigo.ts) y QR (src/sync/qr.ts).
 *
 * Contrato: lo que se codifica se decodigue idéntico, el código solo usa el
 * alfabeto denso de los QR, cabe en uno (4.296 caracteres como máximo) con el
 * tamaño real de una descripción WebRTC, y un QR dibujado se lee de vuelta.
 */
import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import {
  aBase45,
  codificarCodigo,
  decodificarCodigo,
  desdeBase45,
  esCodigoEnlace,
  limpiarCodigo,
  rolDe,
} from '../src/sync/codigo';
import { leerQr } from '../src/sync/qr';

const CANDIDATO = 'a=candidate:4234997325 1 udp 2043278322 192.168.1.%d 54400 typ generation 0 ufrag 4ZcD network-cost 999';
const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:4ZcD',
  'a=ice-pwd:2/1muCWoOi3uLifh0NuRHlLH',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 19:E2:1C:3B:4B:9F:81:E6:B8:5C:F4:A5:A8:D8:73:04:BB:05:2F:70:78:01:37:59:1A:32:8D:93:ED:33',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  ...Array.from({ length: 14 }, (_, i) => CANDIDATO.replace('%d', String(i + 10))),
].join('\r\n');

function determinista(n) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 197 + 11) % 256;
  return b;
}

/** Convierte los módulos del QR en píxeles RGBA, como los entregaría una cámara. */
function pixeles(qr, margen = 4, escala = 4) {
  const lado = (qr.modules.size + margen * 2) * escala;
  const data = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const f = Math.floor(y / escala) - margen;
      const c = Math.floor(x / escala) - margen;
      if (f >= 0 && c >= 0 && f < qr.modules.size && c < qr.modules.size && qr.modules.get(f, c)) {
        const i = (y * lado + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }
  return { data, width: lado, height: lado };
}

describe('base45', () => {
  it('ida y vuelta con cualquier cantidad de bytes', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 300]) {
      const original = determinista(n);
      expect(Uint8Array.from(desdeBase45(aBase45(original)))).toEqual(original);
    }
  });

  it('usa 5 caracteres por cada 3 bytes y solo el alfabeto de los QR', () => {
    const texto = aBase45(determinista(3));
    expect(texto).toHaveLength(5);
    expect([...texto].every((c) => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'.includes(c))).toBe(true);
  });

  it('rechaza caracteres ajenos y grupos incompletos', () => {
    expect(() => desdeBase45('ab')).toThrow('codigo-invalido');
    expect(() => desdeBase45('ABCD')).toThrow('codigo-invalido');
  });
});

describe('código de enlace', () => {
  it('ida y vuelta conservando el texto y el rol', async () => {
    const codigo = await codificarCodigo(SDP, 'oferta');
    expect(codigo).toMatch(/^TP1CO/);
    expect(await decodificarCodigo(codigo)).toBe(SDP);
    expect(rolDe(codigo)).toBe('oferta');
    expect(esCodigoEnlace(codigo)).toBe(true);
    expect(esCodigoEnlace(codigo, 'oferta')).toBe(true);
    expect(esCodigoEnlace(codigo, 'respuesta')).toBe(false);
  });

  it('cabe en un QR y es más corto que el texto original', async () => {
    const codigo = await codificarCodigo(SDP, 'respuesta');
    expect(codigo.length).toBeLessThan(SDP.length);
    expect(codigo.length).toBeLessThan(4296);
    expect(codigo).toMatch(/^TP1CA/);
  });

  it('tolera minúsculas, saltos de línea y espacios alrededor', async () => {
    const codigo = await codificarCodigo(SDP, 'oferta');
    const feo = '  ' + codigo.toLowerCase().replace(/.{40}/g, '$&\n') + '\n';
    expect(limpiarCodigo(feo)).toBe(codigo);
    expect(await decodificarCodigo(feo)).toBe(SDP);
  });

  it('rechaza lo que no es un código de enlace', async () => {
    expect(esCodigoEnlace('hola')).toBe(false);
    expect(esCodigoEnlace('TP1CO')).toBe(false);
    expect(esCodigoEnlace('TP1XOABC')).toBe(false);
    expect(esCodigoEnlace('TP1COab_c')).toBe(false);
    await expect(decodificarCodigo('TP1RUññ')).rejects.toThrow('codigo-invalido');
    await expect(decodificarCodigo('TP1COABC')).rejects.toThrow();
  });

  it('un QR dibujado con el código se lee de vuelta', async () => {
    const codigo = await codificarCodigo(SDP, 'oferta');
    const qr = QRCode.create(codigo, { errorCorrectionLevel: 'L' });
    expect(await leerQr(pixeles(qr))).toBe(codigo);
    expect(await leerQr(pixeles(qr, 4, 2))).toBe(codigo);
    expect(await leerQr({ data: new Uint8ClampedArray(64), width: 4, height: 4 })).toBeNull();
  });
});
