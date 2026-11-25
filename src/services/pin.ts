/**
 * PIN de seguridad: hash PBKDF2-SHA256 en reposo.
 *
 * El PIN es un secreto de baja entropía (4-6 dígitos), por lo que se
 * estira con PBKDF2 (600k iteraciones, sal aleatoria de 16 bytes) y
 * jamás se persiste en claro. Formato almacenado:
 *   pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>
 *
 * Compatibilidad: los PIN legacy guardados en claro (versiones previas
 * de la app) siguen verificándose y se migran a hash en el primer guardado.
 */
const PREFIJO = 'pbkdf2$';
const ITERACIONES = 600000;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function desdeB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivar(pin: string, salt: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

/** ¿El valor almacenado es un PIN con hash (formato nuevo)? */
export function esPinHasheado(valor: string | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIJO);
}

/** Devuelve el hash del PIN listo para persistir. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(pin, salt, ITERACIONES);
  return `${PREFIJO}${ITERACIONES}$${b64(salt)}$${b64(hash)}`;
}

/**
 * Verifica un PIN introducido contra el valor almacenado.
 * Soporta hash (formato nuevo) y texto plano legacy.
 */
export async function verificarPin(input: string, almacenado: string | undefined): Promise<boolean> {
  if (!almacenado) return false;
  if (!esPinHasheado(almacenado)) {
    // Legacy en claro: comparación directa (se migrará al guardar)
    return input === almacenado;
  }
  try {
    const [, iterStr, saltB64, hashB64] = almacenado.split('$');
    const iteraciones = Number(iterStr);
    if (!Number.isFinite(iteraciones) || iteraciones < 1) return false;
    const hash = await derivar(input, desdeB64(saltB64), iteraciones);
    // Comparación en tiempo ~constante
    const esperado = desdeB64(hashB64);
    if (esperado.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ esperado[i];
    return diff === 0;
  } catch {
    return false;
  }
}
