/**
 * Actualizaciones OTA manuales (sin Capgo Cloud).
 *
 * La app instalada (APK) comprueba si hay un paquete nuevo en GitHub Pages,
 * lo descarga con el plugin @capgo/capacitor-updater y lo deja listo para
 * aplicar al reiniciar. No hay nube de por medio: el manifiesto
 * `updates.json` y los zips viven en GitHub Pages y los genera el workflow
 * de despliegue.
 *
 * Módulo de lógica pura, sin UI: nunca muestra toasts; quien llama decide
 * qué mostrar según el `OtaResultado` que recibe.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { useConfigStore } from '../stores/useConfigStore';

/** Manifiesto servido desde GitHub Pages (lo genera el workflow). */
export const OTA_MANIFIESTO_URL = 'https://alain314159.github.io/Tienda-ultima/updates.json';

/** Carpeta de GitHub Pages donde viven los zips de actualización. */
const OTA_ZIPS_BASE = 'https://alain314159.github.io/Tienda-ultima/updates/';

/** Tiempo máximo esperando el manifiesto (ms). */
const TIMEOUT_MANIFIESTO_MS = 10_000;

export interface OtaManifiesto {
  version: string;
  url: string;
  sha256: string;
}

export type OtaResultado =
  | { estado: 'actualizado'; version: string }
  | { estado: 'disponible'; version: string }
  | { estado: 'lista'; version: string }
  | { estado: 'sin-internet' }
  | { estado: 'error'; mensaje: string };

/** `X.Y.Z-<sha corto hex, 7-40 caracteres>` (p. ej. `6.0.1-a1b2c3d`). */
const RE_VERSION = /^\d+\.\d+\.\d+-[0-9a-fA-F]{7,40}$/;
const RE_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Valida un manifiesto descargado. Cualquier cosa que no cumpla el contrato
 * estricto (versión con formato, url https dentro de GitHub Pages terminada
 * en .zip, sha256 de 64 hex) se rechaza con `null`: nunca se descarga un
 * paquete de un origen no esperado.
 */
export function validarManifiesto(datos: unknown): OtaManifiesto | null {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const { version, url, sha256 } = datos as Record<string, unknown>;
  if (typeof version !== 'string' || !RE_VERSION.test(version)) return null;
  if (typeof url !== 'string' || !url.startsWith(OTA_ZIPS_BASE) || !url.endsWith('.zip')) return null;
  if (typeof sha256 !== 'string' || !RE_SHA256.test(sha256)) return null;
  return { version, url, sha256 };
}

/**
 * Versión activa de la app: la guardada en cfg si existe; si no, la que
 * inyecta el workflow en `VITE_APP_BUILD`; si tampoco está, 'desconocida'.
 * Si el store aún no está disponible (sin Pinia activa), usa el env.
 */
export function versionActiva(): string {
  try {
    const guardada = useConfigStore().cfg.versionApp;
    if (guardada) return guardada;
  } catch {
    // Sin Pinia activa: se sigue con el valor del build.
  }
  return import.meta.env.VITE_APP_BUILD || 'desconocida';
}

/** Descarga el manifiesto con timeout; lanza Error con mensaje en español. */
async function descargarManifiesto(): Promise<OtaManifiesto> {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), TIMEOUT_MANIFIESTO_MS);
  try {
    const res = await fetch(OTA_MANIFIESTO_URL, { signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`El servidor de actualizaciones respondió con un error (HTTP ${res.status}).`);
    }
    let datos: unknown;
    try {
      datos = await res.json();
    } catch {
      throw new Error('El manifiesto de actualización no es válido.');
    }
    const manifiesto = validarManifiesto(datos);
    if (!manifiesto) throw new Error('El manifiesto de actualización no es válido.');
    return manifiesto;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('La comprobación de actualización tardó demasiado. Inténtalo de nuevo.');
    }
    // Fallo de red (fetch rechaza con TypeError): mensaje propio en español,
    // no el texto crudo del motor ("Failed to fetch").
    if (e instanceof TypeError) {
      throw new Error('No se pudo descargar el manifiesto de actualización. Revisa tu conexión e inténtalo de nuevo.');
    }
    if (e instanceof Error) throw e;
    throw new Error('No se pudo descargar el manifiesto de actualización. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Comprueba si hay actualización y, si la hay, la descarga y la deja lista.
 * - En web no hace nada: la PWA se actualiza al recargar.
 * - Sin internet devuelve `sin-internet` en silencio (sin fetch ni errores).
 * - Si la descarga o `next()` fallan, la app sigue con la versión actual:
 *   nunca se toca la versión activa ni se deja la app rota.
 */
export async function comprobarActualizacion(opciones?: { silencioso?: boolean }): Promise<OtaResultado> {
  const silencioso = opciones?.silencioso ?? false;
  const activa = versionActiva();
  if (!Capacitor.isNativePlatform()) {
    return { estado: 'actualizado', version: activa };
  }
  if (!navigator.onLine) {
    return { estado: 'sin-internet' };
  }

  let manifiesto: OtaManifiesto;
  try {
    manifiesto = await descargarManifiesto();
  } catch (e) {
    const mensaje =
      e instanceof Error
        ? e.message
        : 'No se pudo descargar el manifiesto de actualización. Revisa tu conexión e inténtalo de nuevo.';
    if (!silencioso) console.warn('[OTA] comprobación fallida:', mensaje);
    return { estado: 'error', mensaje };
  }

  if (manifiesto.version === activa) {
    return { estado: 'actualizado', version: activa };
  }

  try {
    const bundle = await CapacitorUpdater.download({
      url: manifiesto.url,
      version: manifiesto.version,
      checksum: manifiesto.sha256,
    });
    await CapacitorUpdater.next({ id: bundle.id });
  } catch (e) {
    const detalle = e instanceof Error && e.message ? `: ${e.message}` : '';
    const mensaje = `No se pudo descargar la actualización ${manifiesto.version}${detalle}. La app sigue con la versión actual.`;
    if (!silencioso) console.warn('[OTA] descarga fallida:', mensaje);
    return { estado: 'error', mensaje };
  }

  // La versión queda pendiente hasta que la app se reinicie con el
  // paquete nuevo; inicializarOTA() la promueve a versionApp al arrancar.
  try {
    const config = useConfigStore();
    config.cfg.versionPendiente = manifiesto.version;
    await config.guardarCfg();
  } catch (e) {
    if (!silencioso) console.warn('[OTA] no se pudo guardar la versión pendiente:', e);
  }
  return { estado: 'lista', version: manifiesto.version };
}

/** Reinicia la app para aplicar el paquete descargado y listo. */
export async function reiniciarParaAplicar(): Promise<void> {
  await CapacitorUpdater.reload();
}

/**
 * Arranque nativo de OTA: avisa al plugin de que la app arrancó bien,
 * promueve una versión pendiente (descargada en el arranque anterior) a
 * versión activa y hace una comprobación silenciosa en segundo plano.
 * Nunca rompe el arranque: cualquier fallo se traga en silencio.
 */
export async function inicializarOTA(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady().catch((e) => {
      console.warn('[OTA] notifyAppReady falló:', e);
    });

    // La cfg puede no estar cargada aún al arrancar (cargarTodoStores corre
    // después); leerla de Dexie garantiza no perder la promoción.
    const config = useConfigStore();
    try {
      await config.cargarCfg();
    } catch (e) {
      console.warn('[OTA] no se pudo cargar la configuración:', e);
    }
    if (config.cfg.versionPendiente) {
      config.cfg.versionApp = config.cfg.versionPendiente;
      delete config.cfg.versionPendiente;
      await config.guardarCfg();
    }

    // Comprobación silenciosa: sin internet o con error, no pasa nada.
    try {
      await comprobarActualizacion({ silencioso: true });
    } catch {
      // Tragado a propósito: el arranque no depende de la OTA.
    }
  } catch (e) {
    console.warn('[OTA] inicialización fallida:', e);
  }
}
