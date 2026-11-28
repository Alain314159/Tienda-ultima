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

/**
 * Reglas del PIN nuevo: 4–6 dígitos, solo números. El mínimo de 4 se valida
 * al crear/cambiar el PIN (antes el placeholder decía «4 dígitos» pero se
 * aceptaba cualquier cadena de hasta 6 caracteres).
 */
export const PIN_MIN_DIGITOS = 4;
export const PIN_MAX_DIGITOS = 6;

/** Valida un PIN nuevo antes de guardarlo. */
export function validarPinNuevo(pin: string): { ok: true } | { ok: false; error: string } {
  const v = (pin ?? '').trim();
  if (!/^\d+$/.test(v)) return { ok: false, error: 'El PIN solo puede tener dígitos' };
  if (v.length < PIN_MIN_DIGITOS)
    return { ok: false, error: `El PIN debe tener al menos ${PIN_MIN_DIGITOS} dígitos` };
  if (v.length > PIN_MAX_DIGITOS)
    return { ok: false, error: `El PIN debe tener como máximo ${PIN_MAX_DIGITOS} dígitos` };
  return { ok: true };
}

// ============================================================
// Bloqueo por intentos fallidos (1.1)
// ============================================================
// El contador vive en localStorage (no solo en memoria): sobrevive a cerrar
// el modal, a recargar la app y a cambiar de vista. Tras 5 fallos el PIN se
// bloquea un tiempo que crece con cada fallo posterior (1, 2, 4… min, tope
// 15 min). Un acierto resetea el contador.
export const PIN_MAX_INTENTOS = 5;
const PIN_BLOQUEO_BASE_MS = 60_000;
const PIN_BLOQUEO_TOPE_MS = 15 * 60_000;
const CLAVE_BLOQUEO_PIN = 'tp_pin_bloqueo';

export interface EstadoBloqueoPin {
  /** Fallos acumulados desde el último acierto. */
  fallos: number;
  /** Epoch ms hasta el que el PIN está bloqueado (0 = sin bloqueo). */
  bloqueadoHasta: number;
}

function leerBloqueoPin(): EstadoBloqueoPin {
  try {
    const crudo = localStorage.getItem(CLAVE_BLOQUEO_PIN);
    if (!crudo) return { fallos: 0, bloqueadoHasta: 0 };
    const parsed = JSON.parse(crudo) as Partial<EstadoBloqueoPin>;
    return {
      fallos: typeof parsed.fallos === 'number' && parsed.fallos > 0 ? Math.floor(parsed.fallos) : 0,
      bloqueadoHasta:
        typeof parsed.bloqueadoHasta === 'number' && parsed.bloqueadoHasta > 0 ? parsed.bloqueadoHasta : 0,
    };
  } catch {
    return { fallos: 0, bloqueadoHasta: 0 };
  }
}

function guardarBloqueoPin(estado: EstadoBloqueoPin): void {
  try {
    localStorage.setItem(CLAVE_BLOQUEO_PIN, JSON.stringify(estado));
  } catch {
    // Sin almacenamiento: el bloqueo solo vive en memoria de esta sesión.
  }
}

/** Estado actual del bloqueo (fallos acumulados y hasta cuándo está bloqueado). */
export function estadoBloqueoPin(): EstadoBloqueoPin {
  return leerBloqueoPin();
}

/** ¿Está el PIN bloqueado ahora mismo? */
export function pinBloqueado(): boolean {
  return leerBloqueoPin().bloqueadoHasta > Date.now();
}

/** Milisegundos que quedan de bloqueo (0 si no hay bloqueo). */
export function msRestantesBloqueoPin(): number {
  return Math.max(0, leerBloqueoPin().bloqueadoHasta - Date.now());
}

/**
 * Registra un intento fallido. A partir del 5.º fallo bloquea el PIN un
 * tiempo creciente. Devuelve el estado resultante.
 */
export function registrarFalloPin(): EstadoBloqueoPin {
  const estado = leerBloqueoPin();
  estado.fallos += 1;
  if (estado.fallos >= PIN_MAX_INTENTOS) {
    const pasos = estado.fallos - PIN_MAX_INTENTOS;
    const duracion = Math.min(PIN_BLOQUEO_BASE_MS * 2 ** pasos, PIN_BLOQUEO_TOPE_MS);
    estado.bloqueadoHasta = Date.now() + duracion;
  }
  guardarBloqueoPin(estado);
  return estado;
}

/** Un acierto limpia fallos y bloqueo. */
export function registrarAciertoPin(): void {
  try {
    localStorage.removeItem(CLAVE_BLOQUEO_PIN);
  } catch {
    // Sin almacenamiento: nada que limpiar.
  }
}

/** Intentos que quedan antes del bloqueo (0 si ya está bloqueado). */
export function intentosPinRestantes(): number {
  const estado = leerBloqueoPin();
  if (estado.bloqueadoHasta > Date.now()) return 0;
  return Math.max(0, PIN_MAX_INTENTOS - estado.fallos);
}

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
