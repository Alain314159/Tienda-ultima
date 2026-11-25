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
import type { Cambio, FilaRemota, RegistroSync } from './tipos';

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
  return res;
}

let cliente: Promise<SupabaseClient> | null = null;

/** Cliente de Supabase, creado la primera vez que hace falta (no pesa en el arranque). */
export function supabase(): Promise<SupabaseClient> {
  cliente ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_NUBE, CLAVE_PUBLICA_NUBE, {
      auth: { detectSessionInUrl: false, storageKey: 'tp-nube-sesion' },
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

export async function sesionNube(): Promise<SesionNube | null> {
  return sesionDe(await supabase());
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
  const { data, error } = await s.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: ENLACE_DE_REGRESO, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('sin-url');
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

/** Los dos datos de sesión que trae la dirección de regreso, o null si no los trae. */
export function leerTokens(url: string): { access_token: string; refresh_token: string } | null {
  const crudo = url.includes('#') ? (url.split('#')[1] ?? '') : (url.split('?')[1] ?? '');
  const params = new URLSearchParams(crudo);
  const acceso = params.get('access_token');
  const refresco = params.get('refresh_token');
  return acceso && refresco ? { access_token: acceso, refresh_token: refresco } : null;
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
      const tokens = leerTokens(url);
      if (!tokens) return;
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

export async function salirDeNube(ctx: ContextoSync): Promise<void> {
  const s = await supabase();
  const { error } = await s.auth.signOut();
  if (error) throw error;
  // La próxima cuenta que entre en este teléfono recibe todo lo suyo desde el principio.
  await ctx.db.table<RegistroSync, string>('syncMeta').delete(CLAVE_TIRADO);
}
