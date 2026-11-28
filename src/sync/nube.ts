/**
 * Transporte de nube (Supabase) sobre el mismo motor que el WiFi directo.
 *
 * Sube lo que nació en este teléfono o llegó por WiFi, y baja lo nuevo de la
 * cuenta. En la nube cada fila se guarda una vez por usuario con su marca
 * `(ts, dispositivo)`; una función SQL aplica allí la misma regla «gana la más
 * nueva», así que dos teléfonos que escribieron sin conexión acaban iguales.
 *
 * El acceso es con Google. En la app instalada se abre en el navegador del
 * teléfono y vuelve por un enlace profundo (`tiendapro://auth`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { aplicarRemotas, obtenerCambiosDesde, obtenerEstadoCompleto } from './motor';
import type { ContextoSync, ResultadoAplicar } from './motor';
import { CLAVE_PUBLICA_NUBE, ENLACE_DE_REGRESO, URL_NUBE } from './config';
import { TABLAS_SINCRONIZABLES } from './tipos';
import type { Cambio, FilaRemota, RegistroSync } from './tipos';
import type { SenalWifi } from './webrtc';
import { Log } from '../services/logger';

/** Punto local hasta el que ya se subió (`cambios.id`) y punto de la nube hasta el que se leyó. */
export const CLAVE_ENVIADO = 'nube_enviado_hasta';
export const CLAVE_TIRADO = 'nube_tirado_desde';
export const LOTE_NUBE = 500;

export interface FilaNube extends FilaRemota {
  version: number;
}

/** Lo mínimo que se le pide a la nube; las pruebas usan una versión en memoria. */
export interface ClienteNube {
  empujar(filas: FilaRemota[]): Promise<number>;
  tirar(desde: number, limite: number): Promise<FilaNube[]>;
}

export interface ResultadoNube {
  enviado: number;
  aplicados: number;
  ignorados: number;
  descartes: number;
  tablas: string[];
}

export interface SesionNube {
  correo: string | null;
}

let enCurso: Promise<ResultadoNube> | null = null;

/** Sube y baja con el mismo motor del WiFi. Si ya hay otra vuelta en marcha, se une a ella. */
export function sincronizarNube(ctx: ContextoSync, cliente: ClienteNube): Promise<ResultadoNube> {
  enCurso ??= unaVuelta(ctx, cliente).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function unaVuelta(ctx: ContextoSync, cliente: ClienteNube): Promise<ResultadoNube> {
  // Reintento con backoff (3.4): un error de red transitorio no aborta la
  // vuelta. Los cursores son reanudables y el push es idempotente en el
  // servidor, así que repetir la vuelta entera es seguro: lo ya subido no
  // se vuelve a subir (el cursor solo avanza al completar el push) y lo ya
  // bajado no se vuelve a bajar (el cursor avanza por ventana).
  return reintentarConBackoff(() => unaVueltaSinReintento(ctx, cliente), {
    intentos: 3,
    soloSi: esErrorTransitorio,
  });
}

async function unaVueltaSinReintento(ctx: ContextoSync, cliente: ClienteNube): Promise<ResultadoNube> {
  const cambios = ctx.db.table<Cambio, number>('cambios');
  const meta = ctx.db.table<RegistroSync, string>('syncMeta');
  const res: ResultadoNube = { enviado: 0, aplicados: 0, ignorados: 0, descartes: 0, tablas: [] };
  const tocadas = new Set<string>();

  // 1. Subir. La primera vez va todo (también lo anterior al registro de cambios);
  //    después solo lo nuevo. Lo que llegó de la nube no vuelve a subir.
  const guardado = (await meta.get(CLAVE_ENVIADO))?.value;
  const enviado = typeof guardado === 'number' ? guardado : -1;
  const maximo = (await cambios.orderBy('id').last())?.id ?? 0;
  if (enviado < 0 || maximo > enviado) {
    const { filas, hasta } =
      enviado < 0
        ? { filas: await obtenerEstadoCompleto(ctx), hasta: maximo }
        : await obtenerCambiosDesde(ctx, enviado, { sinOrigen: 'nube' });
    for (let i = 0; i < filas.length; i += LOTE_NUBE) {
      await cliente.empujar(filas.slice(i, i + LOTE_NUBE));
      res.enviado += Math.min(LOTE_NUBE, filas.length - i);
    }
    await meta.put({ clave: CLAVE_ENVIADO, value: hasta });
  }

  // 2. Bajar por ventanas hasta que no quede nada posterior al punto de lectura.
  const leido = (await meta.get(CLAVE_TIRADO))?.value;
  let desde = typeof leido === 'number' ? leido : 0;
  for (;;) {
    const traidas = await cliente.tirar(desde, LOTE_NUBE);
    if (traidas.length === 0) break;
    const r: ResultadoAplicar = await aplicarRemotas(ctx, traidas, 'nube');
    res.aplicados += r.aplicados;
    res.ignorados += r.ignorados;
    res.descartes += r.descartes;
    for (const tabla of r.tablas) tocadas.add(tabla);
    desde = Math.max(...traidas.map((f) => f.version));
    await meta.put({ clave: CLAVE_TIRADO, value: desde });
    if (traidas.length < LOTE_NUBE) break;
  }
  res.tablas = [...tocadas];

  // 3. Compactar el registro de cambios hasta lo ya subido (3.5): la tabla
  // `cambios` crecía sin límite porque nadie llamaba a compactar().
  // Solo se compacta hasta el cursor de subida, nunca más allá: lo que aún
  // no se subió debe seguir ahí. Si compactar falla, la vuelta sigue siendo
  // correcta; solo se deja constancia.
  try {
    const enviadoFinal = (await meta.get(CLAVE_ENVIADO))?.value;
    if (typeof enviadoFinal === 'number' && enviadoFinal > 0) {
      await ctx.seg.compactar(enviadoFinal);
    }
  } catch (e) {
    Log.warn('nube: compactar tras sync falló', e);
  }
  return res;
}

// ============================================================
// Reintento con backoff (3.4)
// ============================================================

export interface OpcionesReintento {
  /** Intentos totales (incluido el primero). Por defecto 3. */
  intentos?: number;
  /** Espera base en ms; se duplica en cada reintento. Por defecto 1000. */
  esperaBaseMs?: number;
  /** Si se pasa, solo se reintenta cuando devuelve true para el error. */
  soloSi?: (e: unknown) => boolean;
  /** Espera inyectable (tests). Por defecto setTimeout. */
  esperar?: (ms: number) => Promise<void>;
}

const esperarReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reintenta `fn` con espera creciente. Lanza el último error si se agotan los intentos. */
export async function reintentarConBackoff<T>(fn: () => Promise<T>, opciones: OpcionesReintento = {}): Promise<T> {
  const intentos = Math.max(1, opciones.intentos ?? 3);
  const base = opciones.esperaBaseMs ?? 1000;
  const esperar = opciones.esperar ?? esperarReal;
  let ultimoError: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimoError = e;
      if (opciones.soloSi && !opciones.soloSi(e)) throw e;
      if (i === intentos - 1) throw e;
      await esperar(base * 2 ** i);
    }
  }
  throw ultimoError;
}

function mensajeDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return [o.message, o.code, o.error_description].filter((x) => typeof x === 'string').join(' ');
  }
  return String(e);
}

/**
 * ¿El error es de red/transitorio y merece reintento? Sí: fallos de fetch,
 * timeouts y 5xx del servidor. No: errores 4xx ni de autenticación (reintentar
 * un 401 no arregla nada y solo gasta datos).
 */
export function esErrorTransitorio(e: unknown): boolean {
  if (e instanceof TypeError) return true; // «Failed to fetch» y familia
  const o = (e ?? {}) as Record<string, unknown>;
  const status = typeof o.status === 'number' ? o.status : typeof o.code === 'number' ? o.code : undefined;
  if (status !== undefined) return status >= 500;
  return /network|fetch|timeout|timed out|temporal|econn|eai_again|503|502|504|500/i.test(mensajeDe(e));
}

/**
 * ¿El error dice que la sesión es inválida (refresh token revocado, caducado
 * o desconocido)? Solo en ese caso la sesión se cierra: un fallo de red al
 * refrescar NO es una sesión inválida y no debe desconectar al usuario.
 */
export function esSesionInvalida(e: unknown): boolean {
  const o = (e ?? {}) as Record<string, unknown>;
  if (o.code === 'refresh_token_not_found' || o.error_code === 'refresh_token_not_found') return true;
  return /refresh_token_not_found|invalid refresh token|invalid_grant|refresh token (not found|expired|invalid)/i.test(
    mensajeDe(e)
  );
}

let cliente: Promise<SupabaseClient> | null = null;

/** Cliente de Supabase, creado la primera vez que hace falta (no pesa en el arranque). */
export function supabase(): Promise<SupabaseClient> {
  cliente ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_NUBE, CLAVE_PUBLICA_NUBE, {
      // La sesión DEBE sobrevivir a reinicios de la app: se persiste en
      // localStorage (clave 'tp-nube-sesion') y el cliente refresca el
      // access token solo antes de que caduque. Se dejan explícitos aunque
      // sean los valores por defecto, para que nadie los quite sin saber.
      auth: {
        detectSessionInUrl: false,
        storageKey: 'tp-nube-sesion',
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  );
  return cliente;
}

/** El mismo contrato de `ClienteNube` sobre un cliente real de Supabase. */
export function clienteNubeDe(s: SupabaseClient): ClienteNube {
  return {
    async empujar(filas) {
      const { data, error } = await s.rpc('sync_empujar', { filas });
      if (error) throw error;
      return data ?? 0;
    },
    async tirar(desde, limite) {
      const { data, error } = await s.rpc('sync_tirar', { desde, limite });
      if (error) throw error;
      return (data ?? []) as FilaNube[];
    },
  };
}

function sesionDe(s: SupabaseClient): Promise<SesionNube | null> {
  return s.auth
    .getSession()
    .then(({ data }) => (data.session?.user ? { correo: data.session.user.email ?? null } : null));
}

// ============================================================
// Señalización WiFi por Realtime Broadcast (sin tabla ni migración)
// ============================================================
// Decisión: Broadcast y no una tabla. El intercambio de oferta/respuesta
// es efímero (dura segundos) y no necesita guardarse: un canal Broadcast
// por sala (`tp-wifi-<código>`) basta, no hace falta migración ni RLS, y
// no se escribe nada en la base de datos. Por el canal solo viajan las
// descripciones SDP; los datos de la tienda siguen yendo directos entre
// los teléfonos por WebRTC, y el código de la sala es el mismo código de
// emparejamiento de 6 dígitos (no hay otro código que dictar).
//
// No hace falta haber entrado con Google: el canal se abre con la clave
// publicable y el código de la sala es el secreto. Si Realtime está
// desactivado en el proyecto o no hay internet, la suscripción falla y
// la app avisa que se use el QR en su lugar (ver SyncWifi.vue).
const EVENTOS_SENAL_WIFI = ['pide-oferta', 'oferta', 'respuesta'] as const;

/**
 * Canal de señalización para una sala WiFi con el código dado. Lanza
 * `senal-no-disponible` si no se puede suscribir (sin internet, Realtime
 * desactivado…). El `clienteSupabase` opcional es solo para las pruebas.
 */
export async function canalSenalWifi(codigo: string, clienteSupabase?: SupabaseClient): Promise<SenalWifi> {
  const s = clienteSupabase ?? (await supabase());
  const canal = s.channel(`tp-wifi-${codigo}`, { config: { broadcast: { self: false } } });
  let receptor: ((evento: string, datos: Record<string, unknown>) => void) | null = null;
  for (const evento of EVENTOS_SENAL_WIFI) {
    canal.on('broadcast', { event: evento }, (mensaje) => {
      receptor?.(evento, (mensaje.payload ?? {}) as Record<string, unknown>);
    });
  }
  // subscribe() no devuelve promesa: avisa por callback. Si no se suscribe
  // en 15 s, la sala no sirve.
  const estado = await new Promise<string>((resolver) => {
    const tope = setTimeout(() => resolver('TIMED_OUT'), 15_000);
    canal.subscribe((status) => {
      clearTimeout(tope);
      resolver(status);
    });
  });
  if (estado !== 'SUBSCRIBED') {
    await canal.unsubscribe().catch(() => undefined);
    throw new Error('senal-no-disponible');
  }
  return {
    enviar(evento, datos) {
      void canal.send({ type: 'broadcast', event: evento, payload: datos }).catch(() => undefined);
    },
    alRecibir(fn) {
      receptor = fn;
    },
    cerrar() {
      void canal.unsubscribe().catch(() => undefined);
    },
  };
}

export async function sesionNube(): Promise<SesionNube | null> {
  return sesionDe(await supabase());
}

/**
 * Resultado de restaurar la sesión al arrancar.
 * - `sesion`: hay sesión válida (restaurada del almacenamiento o refrescada).
 * - `sin-sesion`: nunca se entró con Google (o se cerró sesión): nada que restaurar.
 * - `transitorio`: no se pudo comprobar (sin red, servidor caído…): la sesión
 *   NO se cierra; se reintenta más tarde. Un fallo de refresh no desconecta.
 * - `invalida`: Supabase dice explícitamente que el refresh token no vale
 *   (revocado/caducado): solo entonces se cierra la sesión y hay que volver
 *   a entrar con Google.
 */
export type ResultadoRestaurar =
  { sesion: SesionNube } | { error: 'sin-sesion' } | { error: 'transitorio' } | { error: 'invalida' };

/**
 * Restaura la sesión guardada al arrancar la app. Lee la sesión persistida
 * (`tp-nube-sesion` en localStorage); si el access token caducó, el cliente
 * la refresca solo con el refresh token. Ante un fallo transitorio reintenta
 * con backoff y NO cierra la sesión; solo la cierra si Supabase dice que el
 * refresh token es inválido. Se llama una vez al arrancar (App.vue) y la
 * sync de fondo la reintenta mientras siga pendiente.
 */
export async function restaurarSesionNube(
  clienteSupabase?: SupabaseClient,
  opciones: OpcionesReintento = {}
): Promise<ResultadoRestaurar> {
  const s = clienteSupabase ?? (await supabase());
  // Nota: no se usa sesionDe() aquí porque traga el error de getSession y
  // un refresh fallido parecería «sin sesión». Se lee { data, error } para
  // distinguir «sin sesión», «fallo transitorio» y «sesión inválida».
  let resultado: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
  try {
    resultado = await reintentarConBackoff(() => s.auth.getSession(), {
      intentos: opciones.intentos ?? 3,
      esperaBaseMs: opciones.esperaBaseMs ?? 1000,
      esperar: opciones.esperar,
      soloSi: esErrorTransitorio,
    });
  } catch (e) {
    if (esSesionInvalida(e)) {
      await cerrarSesionLocal(s);
      return { error: 'invalida' };
    }
    Log.warn('nube: no se pudo restaurar la sesión (se reintentará)', e);
    return { error: 'transitorio' };
  }
  const { data, error } = resultado;
  if (error) {
    if (esSesionInvalida(error)) {
      await cerrarSesionLocal(s);
      return { error: 'invalida' };
    }
    Log.warn('nube: getSession devolvió error (se reintentará)', error);
    return { error: 'transitorio' };
  }
  if (!data.session?.user) return { error: 'sin-sesion' };
  return { sesion: { correo: data.session.user.email ?? null } };
}

/** Cierra la sesión en el cliente sin tocar la BD (best-effort: nunca lanza). */
async function cerrarSesionLocal(s: SupabaseClient): Promise<void> {
  try {
    await s.auth.signOut();
  } catch (e) {
    Log.warn('nube: signOut al invalidar la sesión falló', e);
  }
}

/** Si el proyecto ya tiene Google conectado; sin eso el acceso con Google no funciona. */
export async function googleListo(): Promise<boolean> {
  try {
    const r = await fetch(`${URL_NUBE}/auth/v1/settings`, {
      headers: { apikey: CLAVE_PUBLICA_NUBE, Authorization: `Bearer ${CLAVE_PUBLICA_NUBE}` },
    });
    if (!r.ok) return false;
    const datos = (await r.json()) as { external?: { google?: boolean } };
    return datos.external?.google === true;
  } catch {
    return false;
  }
}

/** Abre el acceso con Google en el navegador del teléfono; el regreso llega por `alVolverDeGoogle`. */
export async function entrarConGoogle(): Promise<void> {
  const s = await supabase();
  // state/nonce anti-CSRF (1.6): se genera al iniciar el flujo y se verifica
  // al volver; sin flujo iniciado no se acepta ningún token. Se pasa a
  // Google como parámetro de la URL de autorización.
  const state = iniciarFlujoAuth();
  const { data, error } = await s.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: ENLACE_DE_REGRESO, skipBrowserRedirect: true, queryParams: { state } },
  });
  if (error) {
    limpiarEstadoAuth();
    throw error;
  }
  if (!data.url) {
    limpiarEstadoAuth();
    throw new Error('sin-url');
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

// ============================================================
// state/nonce del flujo de Google (1.6)
// ============================================================
// El regreso `tiendapro://auth` aceptaba cualquier access_token/
// refresh_token sin comprobar nada: una app o enlace malicioso podía
// vincular la cuenta del atacante. Ahora el flujo deja un `state`
// aleatorio guardado (localStorage: la app pasa a segundo plano mientras
// el navegador está abierto) y al volver solo se aceptan tokens si hay un
// flujo iniciado y, cuando la URL trae `state`, coincide con el guardado.
// El state es de un solo uso y caduca a los 10 minutos.
const CLAVE_ESTADO_AUTH = 'tp_nube_estado_auth';
const ESTADO_AUTH_TTL_MS = 10 * 60_000;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Genera y guarda el state del flujo que empieza; devuelve el state. */
export function iniciarFlujoAuth(): string {
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  try {
    localStorage.setItem(CLAVE_ESTADO_AUTH, JSON.stringify({ state, creado: Date.now() }));
  } catch {
    // Sin almacenamiento no se puede verificar el regreso: el flujo se
    // rechaza al volver (fail-closed).
  }
  return state;
}

/** State del flujo en curso, o null si no hay ninguno o caducó. */
export function estadoAuthPendiente(): { state: string; creado: number } | null {
  try {
    const crudo = localStorage.getItem(CLAVE_ESTADO_AUTH);
    if (!crudo) return null;
    const parsed = JSON.parse(crudo) as { state?: unknown; creado?: unknown };
    if (typeof parsed.state !== 'string' || typeof parsed.creado !== 'number') return null;
    if (Date.now() - parsed.creado > ESTADO_AUTH_TTL_MS) {
      localStorage.removeItem(CLAVE_ESTADO_AUTH);
      return null;
    }
    return { state: parsed.state, creado: parsed.creado };
  } catch {
    return null;
  }
}

/** Borra el state guardado (al completar o abortar el flujo). */
export function limpiarEstadoAuth(): void {
  try {
    localStorage.removeItem(CLAVE_ESTADO_AUTH);
  } catch {
    // Sin almacenamiento: nada que borrar.
  }
}

/** Los dos datos de sesión que trae la dirección de regreso, o null si no los trae. */
export function leerTokens(url: string): { access_token: string; refresh_token: string; state?: string | null } | null {
  const crudo = url.includes('#') ? (url.split('#')[1] ?? '') : (url.split('?')[1] ?? '');
  const params = new URLSearchParams(crudo);
  const acceso = params.get('access_token');
  const refresco = params.get('refresh_token');
  if (!acceso || !refresco) return null;
  // El state puede venir en el fragmento o en la query (depende de si el
  // callback de Supabase lo preserva); se lee de ambos.
  const query = url.includes('?') ? (url.split('?')[1]?.split('#')[0] ?? '') : '';
  const state = params.get('state') ?? new URLSearchParams(query).get('state');
  return { access_token: acceso, refresh_token: refresco, state };
}

/** Avisa cuando el acceso con Google termina y vuelve a la app. Devuelve cómo dejar de escuchar. */
export function alVolverDeGoogle(alEntrar: (sesion: SesionNube | null) => void): () => void {
  let quitar: (() => void) | undefined;
  let terminado = false;
  void (async () => {
    const { App } = await import('@capacitor/app');
    const s = await supabase();
    const escucha = await App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(ENLACE_DE_REGRESO)) return;
      // Sin flujo iniciado, el regreso se rechaza: nadie puede vincular una
      // cuenta con un enlace fabricado (1.6).
      const pendiente = estadoAuthPendiente();
      if (!pendiente) {
        console.warn('[nube] regreso sin flujo de acceso iniciado: tokens rechazados');
        return;
      }
      const tokens = leerTokens(url);
      if (!tokens) return;
      // Si la URL trae state, debe coincidir con el guardado. (El callback
      // de Supabase puede no preservar el state: en ese caso la garantía es
      // el flujo iniciado y vigente, de un solo uso.)
      if (tokens.state && tokens.state !== pendiente.state) {
        console.warn('[nube] state no coincide: tokens rechazados');
        limpiarEstadoAuth();
        return;
      }
      limpiarEstadoAuth();
      const { error } = await s.auth.setSession(tokens);
      if (error) {
        console.error('[nube] sesion no aceptada', error.message);
        return;
      }
      const { Browser } = await import('@capacitor/browser');
      await Browser.close().catch(() => undefined);
      alEntrar(await sesionDe(s));
    });
    if (terminado) await escucha.remove();
    else quitar = () => void escucha.remove();
  })();
  return () => {
    terminado = true;
    quitar?.();
  };
}

/**
 * Borra los datos locales de la tienda (tablas de datos, registro de
 * cambios, descartes y cursores de sync, más los respaldos guardados en
 * config). La configuración (nombre, tema, PIN…) se conserva: el teléfono
 * sigue protegido por su PIN y no queda abierto sin más.
 */
export async function borrarDatosLocales(ctx: ContextoSync): Promise<void> {
  const tablas = [...TABLAS_SINCRONIZABLES, 'asientos', 'cambios', 'descartes', 'syncMeta'];
  await ctx.db.transaction('rw', tablas, async () => {
    for (const t of tablas) await ctx.db.table(t).clear();
  });
  await ctx.db.table('config').bulkDelete(['preImportBackup', 'backupAuto']);
}

/**
 * Cierra la sesión de la nube. Siempre borra los cursores de sync (subida y
 * bajada) para que la próxima cuenta empiece desde cero y no se mezcle con
 * los datos locales de la anterior.
 *
 * Con `borrarDatosLocales: true` además borra los datos locales de la
 * tienda: es lo que debe ofrecer la pantalla «Nube y cuenta» al salir
 * (con confirmación + PIN), porque si no la IndexedDB completa queda en el
 * teléfono y se mezcla con la siguiente cuenta (1.10).
 */
export async function salirDeNube(ctx: ContextoSync, opciones: { borrarDatosLocales?: boolean } = {}): Promise<void> {
  const s = await supabase();
  const { error } = await s.auth.signOut();
  if (error) throw error;
  // La próxima cuenta que entre en este teléfono recibe todo lo suyo desde el principio.
  const meta = ctx.db.table<RegistroSync, string>('syncMeta');
  await meta.delete(CLAVE_TIRADO);
  await meta.delete(CLAVE_ENVIADO);
  if (opciones.borrarDatosLocales) await borrarDatosLocales(ctx);
}
