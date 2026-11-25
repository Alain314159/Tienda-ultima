/**
 * Código de enlace: el texto que viaja en el QR (o que se copia y pega).
 *
 * Es la descripción de la conexión (el SDP de WebRTC) comprimida y codificada
 * en base45, que usa el alfabeto alfanumérico de los QR: en un código del mismo
 * tamaño cabe el doble que con base64.
 *
 * Formato: `TP1` + C/R (comprimido o tal cual) + O/A/U (oferta, respuesta o sin
 * especificar) + base45.
 */
const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const PREFIJO = 'TP1';
const POSICION = new Map<string, number>();
for (let i = 0; i < ALFABETO.length; i++) POSICION.set(ALFABETO.charAt(i), i);

export type RolCodigo = 'oferta' | 'respuesta' | '';

const letraDeRol = (rol: RolCodigo): string => (rol === 'oferta' ? 'O' : rol === 'respuesta' ? 'A' : 'U');

/** 3 bytes → 5 caracteres; el resto final va en grupos de 2 (→3) o 1 (→2). */
export function aBase45(bytes: Uint8Array): string {
  let salida = '';
  for (let i = 0; i < bytes.length;) {
    const resto = bytes.length - i;
    if (resto >= 3) {
      let n = (bytes[i] ?? 0) + (bytes[i + 1] ?? 0) * 256 + (bytes[i + 2] ?? 0) * 65536;
      for (let k = 0; k < 5; k++) {
        salida += ALFABETO.charAt(n % 45);
        n = Math.floor(n / 45);
      }
      i += 3;
    } else if (resto === 2) {
      const n = (bytes[i] ?? 0) + (bytes[i + 1] ?? 0) * 256;
      salida +=
        ALFABETO.charAt(n % 45) + ALFABETO.charAt(Math.floor(n / 45) % 45) + ALFABETO.charAt(Math.floor(n / 2025));
      i += 2;
    } else {
      const n = bytes[i] ?? 0;
      salida += ALFABETO.charAt(n % 45) + ALFABETO.charAt(Math.floor(n / 45));
      i += 1;
    }
  }
  return salida;
}

/** Inverso de `aBase45`. Lanza `codigo-invalido` si el texto no es base45 válido. */
export function desdeBase45(texto: string): Uint8Array {
  const v: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const p = POSICION.get(texto.charAt(i));
    if (p === undefined) throw new Error('codigo-invalido');
    v.push(p);
  }
  const salida: number[] = [];
  let i = 0;
  while (i < v.length) {
    const resto = v.length - i;
    const c = (k: number): number => v[i + k] ?? 0;
    if (resto >= 5) {
      let n = 0;
      for (let k = 4; k >= 0; k--) n = n * 45 + c(k);
      if (n > 16777215) throw new Error('codigo-invalido');
      salida.push(n & 255, (n >> 8) & 255, (n >> 16) & 255);
      i += 5;
    } else if (resto === 3) {
      const n = c(0) + c(1) * 45 + c(2) * 2025;
      if (n > 65535) throw new Error('codigo-invalido');
      salida.push(n & 255, n >> 8);
      i += 3;
    } else if (resto === 2) {
      const n = c(0) + c(1) * 45;
      if (n > 255) throw new Error('codigo-invalido');
      salida.push(n);
      i += 2;
    } else {
      throw new Error('codigo-invalido');
    }
  }
  return Uint8Array.from(salida);
}

/** Deja el código como lo genera la app, aunque venga pegado con saltos de línea. */
export function limpiarCodigo(texto: string): string {
  return texto
    .replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase();
}

export function esCodigoEnlace(texto: string, rol: RolCodigo = ''): boolean {
  // Hace falta al menos un carácter de contenido además de los 5 de cabecera.
  if (!texto.startsWith(PREFIJO) || texto.length < PREFIJO.length + 3) return false;
  if (!'CR'.includes(texto.charAt(PREFIJO.length))) return false;
  const r = texto.charAt(PREFIJO.length + 1);
  if (!'OAU'.includes(r)) return false;
  if (rol !== '' && r !== letraDeRol(rol)) return false;
  for (let i = PREFIJO.length + 2; i < texto.length; i++) {
    if (!POSICION.has(texto.charAt(i))) return false;
  }
  return true;
}

/** Rol que declara el código, o null si no es un código de enlace. */
export function rolDe(codigo: string): RolCodigo | null {
  if (!esCodigoEnlace(codigo)) return null;
  const r = codigo.charAt(PREFIJO.length + 1);
  return r === 'O' ? 'oferta' : r === 'A' ? 'respuesta' : '';
}

async function comprimir(bruto: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined' || bruto.length === 0) return bruto;
  const flujo = new Blob([bruto as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function descomprimir(datos: Uint8Array): Promise<string> {
  const flujo = new Blob([datos as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(flujo).text();
}

export async function codificarCodigo(texto: string, rol: RolCodigo = ''): Promise<string> {
  const bruto = new TextEncoder().encode(texto);
  const compacto = await comprimir(bruto);
  const usarCompacto = compacto.length < bruto.length;
  return PREFIJO + (usarCompacto ? 'C' : 'R') + letraDeRol(rol) + aBase45(usarCompacto ? compacto : bruto);
}

/** Inverso de `codificarCodigo`. Lanza `codigo-invalido` si no se puede leer. */
export async function decodificarCodigo(codigo: string): Promise<string> {
  const texto = limpiarCodigo(codigo);
  if (!esCodigoEnlace(texto)) throw new Error('codigo-invalido');
  const datos = desdeBase45(texto.slice(PREFIJO.length + 2));
  if (texto.charAt(PREFIJO.length) === 'R') return new TextDecoder().decode(datos);
  if (typeof DecompressionStream === 'undefined') throw new Error('sin-descompresion');
  try {
    return await descomprimir(datos);
  } catch {
    throw new Error('codigo-invalido');
  }
}
