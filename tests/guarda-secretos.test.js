/**
 * tools/guarda-secretos.mjs: guarda sin dependencias que bloquea commits con
 * credenciales. Los valores de prueba se construyen troceados para que el propio
 * archivo de test no contenga ningun formato de credencial completo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { escanearTexto, escanearArchivos, archivosVersionados } from '../tools/guarda-secretos.mjs';

const RAIZ = process.cwd() + '/';

const CASOS = [
  ['token de bot de Telegram', `tg = ${'9'.repeat(9)}:${'A'.repeat(35)}`],
  ['token de GitHub', `gh = gh${'p_'}${'a'.repeat(36)}`],
  ['clave de acceso AWS', `aws = AK${'IA'}${'A'.repeat(16)}`],
  ['clave de API de Google', `g = AI${'za'}${'a'.repeat(35)}`],
  ['token de Slack', `s = xo${'xb-'}${'a'.repeat(12)}`],
  ['clave de Stripe', `st = s${'k_live_'}${'a'.repeat(20)}`],
  ['JWT', `j = ey${'J' + 'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(12)}`],
  ['clave privada', `k = -----BEGIN ${'RSA '}PRIVATE KEY-----`],
  ['literal asignado a TG_SECRET', `const TG_SECRET = '${'clave-' + 'Q7'.repeat(8)}'`],
  ['literal asignado a TG_APP_KEY', `const TG_APP_KEY = '${'worker-' + 'z3'.repeat(9)}'`],
];

describe('guarda de secretos', () => {
  it.each(CASOS)('detecta %s', (tipo, linea) => {
    expect(escanearTexto(linea, 'f.txt')).toEqual([{ archivo: 'f.txt', linea: 1, tipo }]);
  });

  it('indica la linea exacta y acumula varios hallazgos', () => {
    const texto = ['primera', CASOS[0][1], 'tercera', CASOS[8][1]].join('\n');
    expect(escanearTexto(texto, 'a.js').map((h) => h.linea)).toEqual([2, 4]);
  });

  it('el resultado nunca contiene el valor', () => {
    for (const [, linea] of CASOS) {
      expect(JSON.stringify(escanearTexto(linea, 'f'))).not.toContain(linea.split(/[:=] */)[1]);
    }
  });

  it.each([
    ['referencia a entorno', 'const TG_APP_KEY = import.meta.env.VITE_TG_APP_KEY'],
    ['variable de shell', 'TIENDA_RELEASE_STORE_PASSWORD="$TIENDA_STORE_PASS"'],
    ['ejemplo en .env', 'VITE_TG_APP_KEY=tu-clave-del-worker'],
    ['mascara', 'PASSWORD=****************'],
    ['caracter repetido', "const API_TOKEN = 'AAAAAAAAAAAAAAAAAAAA'"],
    ['patron repetido', "const SECRETO = 'abcabcabcabcabcabcabc'"],
    ['placeholder', 'APP_KEY=<pon-aqui-tu-clave>'],
    ['valor corto', "const PASSWORD = '1234'"],
    ['binario', `a\0b ${'9'.repeat(9)}:${'A'.repeat(35)}`],
    ['linea marcada', "const TOKEN_BOT = 'valor-de-prueba-1234567890' // guarda-secretos: permitir"],
  ])('no marca: %s', (_nombre, linea) => {
    expect(escanearTexto(linea, 'f.txt')).toEqual([]);
  });

  it('sigue marcando un literal largo sin marcar', () => {
    // Troceado para que esta linea de test no contenga ella misma el literal.
    const linea = ['const TOKEN_BOT = ', "'valor-de-prueba-", "1234567890'"].join('');
    expect(escanearTexto(linea, 'f.txt')).toHaveLength(1);
  });

  it('omite las rutas que no se pueden leer', () => {
    expect(escanearArchivos(['no-existe'], () => { throw new Error('ENOENT'); })).toEqual([]);
    expect(escanearArchivos(['ok'], () => CASOS[0][1]).map((h) => h.archivo)).toEqual(['ok']);
  });

  it('ningun archivo versionado del repositorio contiene una credencial', () => {
    const rutas = archivosVersionados(RAIZ);
    expect(rutas.length).toBeGreaterThan(50);
    const hallazgos = escanearArchivos(rutas, (r) => readFileSync(RAIZ + r, 'utf8'));
    // Solo archivo, linea y tipo: nunca el valor.
    expect(hallazgos.map((h) => `${h.archivo}:${h.linea} ${h.tipo}`)).toEqual([]);
  });
});
