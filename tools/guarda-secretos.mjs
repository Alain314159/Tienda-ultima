#!/usr/bin/env node
// Guarda de secretos, sin dependencias.
//
// Bloquea un commit si un archivo preparado contiene una credencial, y falla en
// CI a traves de tests/guarda-secretos.test.js, que pasa esta misma guarda por
// todos los archivos versionados. Nunca imprime el secreto: solo archivo, linea
// y tipo de hallazgo.
//
// Uso:
//   node tools/guarda-secretos.mjs               archivos preparados (gancho pre-commit)
//   node tools/guarda-secretos.mjs --todos       todos los archivos versionados
//   node tools/guarda-secretos.mjs <archivo>...  solo esos archivos
//
// Una linea que deba contener un valor de prueba con formato de credencial se
// marca al final con el comentario: guarda-secretos: permitir
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARCA = /guarda-secretos:\s*permitir/;

/** Formatos propios de cada proveedor: practicamente sin falsos positivos. */
const FORMATOS = [
  ['token de bot de Telegram', /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
  ['token de GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['clave de acceso AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['clave de API de Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token de Slack', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ['clave de Stripe', /\b[sr]k_live_[0-9A-Za-z]{16,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/** Constante o clave de entorno (en mayusculas) cuyo valor es un literal largo. */
const ASIGNADO = /\b((?:[A-Z][A-Z0-9_]*)?(?:APP_KEY|SECRET|TOKEN|PASSWORD|PASSWD|API_KEY)[A-Z0-9_]*)[ \t]*[:=][ \t]*["']([^"'\s]{12,})["']/g;

/** Valores que no son credenciales: ejemplos, mascaras, variables de shell. */
function esEjemplo(valor) {
  if (/^(?:tu[-_]|mi[-_]|xxx|\*+$|<[^>]+>$|\$\{[^}]+\}$|change[-_]?me|placeholder|example|redacted|dummy|fake|prueba)/i.test(valor)) return true;
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(valor)) return true; // $VARIABLE del entorno
  if (/^(.)\1*$/.test(valor)) return true; // un mismo caracter repetido
  return /^(.{1,6})\1+$/.test(valor); // patron corto repetido
}

/** Devuelve los hallazgos de un texto: { archivo, linea, tipo }, nunca el valor. */
export function escanearTexto(texto, archivo = '') {
  if (typeof texto !== 'string' || texto.includes('\0')) return []; // binario
  const hallazgos = [];
  texto.split('\n').forEach((linea, i) => {
    if (MARCA.test(linea)) return;
    for (const [tipo, re] of FORMATOS) if (re.test(linea)) hallazgos.push({ archivo, linea: i + 1, tipo });
    for (const m of linea.matchAll(ASIGNADO)) {
      if (!esEjemplo(m[2])) hallazgos.push({ archivo, linea: i + 1, tipo: `literal asignado a ${m[1]}` });
    }
  });
  return hallazgos;
}

/** Escanea una lista de rutas; las que no se puedan leer (p. ej. borradas) se omiten. */
export function escanearArchivos(rutas, leer) {
  const hallazgos = [];
  for (const ruta of rutas) {
    try {
      hallazgos.push(...escanearTexto(leer(ruta), ruta));
    } catch {
      // eliminado o ilegible: nada que comprobar
    }
  }
  return hallazgos;
}

export function archivosVersionados(raiz) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: raiz, maxBuffer: 64 << 20 }).toString().split('\0').filter(Boolean);
}

export function archivosPreparados(raiz) {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: raiz, maxBuffer: 64 << 20 })
    .toString()
    .split('\0')
    .filter(Boolean);
}

function main() {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const args = process.argv.slice(2);
  let rutas;
  let leer;
  if (args.includes('--todos')) {
    rutas = archivosVersionados(raiz);
    leer = (r) => readFileSync(`${raiz}${r}`, 'utf8');
  } else if (args.length) {
    rutas = args;
    leer = (r) => readFileSync(r, 'utf8');
  } else {
    // Gancho pre-commit: se comprueba lo que esta preparado, no el archivo en disco.
    rutas = archivosPreparados(raiz);
    leer = (r) => execFileSync('git', ['show', `:${r}`], { cwd: raiz, maxBuffer: 64 << 20 }).toString();
  }
  const hallazgos = escanearArchivos(rutas, leer);
  if (!hallazgos.length) return 0;
  console.error(`guarda de secretos: ${hallazgos.length} credencial(es) posible(s); el valor no se muestra:`);
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  ${h.tipo}`);
  console.error('Si es un valor de prueba con formato real, marca la linea con: guarda-secretos: permitir');
  return 1;
}

// Solo se ejecuta como comando; al importarlo desde un test no hace nada.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
