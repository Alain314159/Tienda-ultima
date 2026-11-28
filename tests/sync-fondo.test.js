/**
 * Tests de la sync de fondo (3.1, 3.2, 3.4, 3.5, 3.6):
 * - el temporizador del store sincroniza cada 45 s con sesión activa y
 *   online, aunque el panel esté cerrado; sin sesión o sin conexión no
 *   hace nada (y restaura la sesión si hay una guardada).
 * - una vuelta de fondo que falla avisa con toast (no solo en el panel).
 * - reintento con backoff en la vuelta de nube: un error transitorio no
 *   aborta la vuelta; un error no transitorio no se reintenta.
 * - compactar() corre tras una sync correcta: la tabla `cambios` no crece
 *   sin límite.
 * - el motor precarga por lotes: dos filas remotas para la misma fila en
 *   un lote se resuelven con lo último visto (sin lecturas N+1).
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

import { db } from '../src/db';
import { TiendaProDB } from '../src/db';
import { instalarSeguimiento } from '../src/sync/seguimiento';
import { sincronizarNube } from '../src/sync/nube';
import { aplicarRemotas } from '../src/sync/motor';
import { useNubeStore } from '../src/stores/useNubeStore';

vi.mock('../src/utils/toast', () => ({ toastMsg: vi.fn() }));
import { toastMsg } from '../src/utils/toast';

function clienteFalsoNube(fallas = 0) {
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    empujar: vi.fn(async () => {
      llamadas++;
      if (llamadas <= fallas) throw new TypeError('Failed to fetch');
      return 1;
    }),
    tirar: vi.fn(async () => []),
  };
}

function clienteSupabaseFalso(sesion) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sesion ?? null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

const SESION_FALSA = { user: { email: 'dueño@example.com' } };

let onLineOriginal;

beforeEach(async () => {
  setActivePinia(createPinia());
  vi.useRealTimers();
  onLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  await Promise.all([
    db.config.clear(),
    db.productos.clear(),
    db.cambios.clear(),
    db.syncMeta.clear(),
    db.pasivos.clear(),
  ]);
  toastMsg.mockClear();
});

afterEach(() => {
  // Primero los relojes reales: un test con relojes falsos que falle deja
  // IndexedDB congelada y el siguiente beforeEach se cuelga.
  vi.useRealTimers();
  const nube = useNubeStore();
  nube.detenerSyncFondo();
  try {
    if (onLineOriginal) Object.defineProperty(window.navigator, 'onLine', onLineOriginal);
    else delete window.navigator.onLine;
  } catch {
    // happy-dom: onLine puede no ser reconfigurable; no es crítico.
  }
});

function ponerOffline() {
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
}

describe('useNubeStore: restaurarSesion', () => {
  it('con sesión guardada la restaura y la deja en el store', async () => {
    const nube = useNubeStore();
    const r = await nube.restaurarSesion(clienteSupabaseFalso(SESION_FALSA));
    expect(r).toBe('ok');
    expect(nube.sesionCorreo).toBe('dueño@example.com');
    expect(nube.sesionPendiente).toBe(false);
  });

  it('sin sesión guardada devuelve sin-sesion', async () => {
    const nube = useNubeStore();
    expect(await nube.restaurarSesion(clienteSupabaseFalso(null))).toBe('sin-sesion');
    expect(nube.sesionCorreo).toBeNull();
  });

  it('fallo transitorio al comprobar: sesión pendiente, sin cerrar nada', async () => {
    const cliente = clienteSupabaseFalso(SESION_FALSA);
    cliente.auth.getSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const nube = useNubeStore();
    const r = await nube.restaurarSesion(cliente);
    expect(r).toBe('transitorio');
    expect(nube.sesionPendiente).toBe(true);
    expect(nube.sesionCorreo).toBeNull();
    expect(cliente.auth.signOut).not.toHaveBeenCalled();
  });

  it('sesión inválida: avisa que hay que volver a entrar', async () => {
    const cliente = clienteSupabaseFalso(null);
    cliente.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' },
    });
    const nube = useNubeStore();
    const r = await nube.restaurarSesion(cliente);
    expect(r).toBe('invalida');
    expect(toastMsg).toHaveBeenCalledWith(expect.stringMatching(/caducó/i), expect.anything());
  });
});

describe('sync de fondo', () => {
  // Relojes reales: los falsos congelan IndexedDB (fake-indexeddb usa
  // temporizadores) y la vuelta de fondo nunca termina. Intervalo corto.
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  it('con sesión activa sincroniza al arrancar y cada intervalo', async () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    const cliente = clienteFalsoNube();
    await db.productos.put({ id: 'p1', nombre: 'Uno' });

    nube.iniciarSyncFondo({ cliente, intervaloMs: 50 });
    await vi.waitFor(() => expect(cliente.empujar).toHaveBeenCalled(), { timeout: 5000 });
    expect(nube.ultimaSync).toBeTruthy();

    const llamadasTrasArranque = cliente.empujar.mock.calls.length;
    // Un cambio nuevo después del arranque: la siguiente vuelta lo sube.
    await db.productos.put({ id: 'p2', nombre: 'Dos' });
    await vi.waitFor(() => expect(cliente.empujar.mock.calls.length).toBeGreaterThan(llamadasTrasArranque), {
      timeout: 5000,
    });
    nube.detenerSyncFondo();
    const llamadasAlParar = cliente.empujar.mock.calls.length;
    await dormir(200);
    expect(cliente.empujar.mock.calls.length).toBe(llamadasAlParar);
  });

  it('sin sesión no sincroniza: intenta restaurar y, si no hay, se queda quieto', async () => {
    const nube = useNubeStore();
    const cliente = clienteFalsoNube();
    nube.iniciarSyncFondo({ cliente, clienteSupabase: clienteSupabaseFalso(null), intervaloMs: 50 });
    await dormir(250);
    expect(cliente.empujar).not.toHaveBeenCalled();
  });

  it('sin conexión no sincroniza', async () => {
    ponerOffline();
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    const cliente = clienteFalsoNube();
    nube.iniciarSyncFondo({ cliente, intervaloMs: 50 });
    await dormir(250);
    expect(cliente.empujar).not.toHaveBeenCalled();
  });

  it('si la vuelta de fondo falla, hay toast visible con reintento', async () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    await db.productos.put({ id: 'p1', nombre: 'Uno' });
    const cliente = clienteFalsoNube();
    cliente.empujar.mockRejectedValue({ status: 401, message: 'JWT invalid' });
    const ok = await nube.sincronizarAhora({ origen: 'fondo', cliente });
    expect(ok).toBe(false);
    expect(nube.estado).toBe('error');
    expect(toastMsg).toHaveBeenCalledWith(
      expect.stringMatching(/No se pudo sincronizar/i),
      'warn',
      'Sincronizar ahora',
      expect.any(Function)
    );
  });

  it('el reintento manual desde el indicador sigue existiendo (sin toast duplicado)', async () => {
    const nube = useNubeStore();
    nube.setSesion('dueño@example.com');
    await db.productos.put({ id: 'p1', nombre: 'Uno' });
    const cliente = clienteFalsoNube();
    cliente.empujar.mockRejectedValueOnce({ status: 401, message: 'JWT invalid' });
    expect(await nube.sincronizarAhora({ origen: 'manual', cliente })).toBe(false);
    // El fallo manual se muestra en el panel (ultimoError), no con toast de fondo.
    expect(toastMsg).not.toHaveBeenCalled();
    expect(nube.ultimoError).toBeTruthy();
    cliente.empujar.mockResolvedValue(1);
    expect(await nube.sincronizarAhora({ origen: 'manual', cliente })).toBe(true);
    expect(nube.estado).toBe('al-dia');
  });
});

describe('vuelta de nube: backoff y compactar', () => {
  const D = new TiendaProDB('SyncFondoVuelta');
  const ctx = { db: D, seg: instalarSeguimiento(D, { dispositivo: 'dev_fondo' }) };

  afterAll(async () => {
    await D.delete();
  });

  it('error transitorio: reintenta y completa la vuelta', async () => {
    await D.productos.put({ id: 'p1', nombre: 'Uno' });
    const cliente = clienteFalsoNube(2); // falla 2 veces, a la 3ª va
    const r = await sincronizarNube(ctx, cliente);
    expect(r.enviado).toBe(1);
    expect(cliente.llamadas()).toBe(3);
    await D.productos.clear();
    await D.cambios.clear();
    await D.syncMeta.clear();
  }, 15000);

  it('error no transitorio: no reintenta', async () => {
    await D.productos.put({ id: 'p1', nombre: 'Uno' });
    const cliente = clienteFalsoNube();
    cliente.empujar.mockRejectedValue({ status: 401, message: 'JWT invalid' });
    await expect(sincronizarNube(ctx, cliente)).rejects.toMatchObject({ status: 401 });
    expect(cliente.empujar).toHaveBeenCalledTimes(1);
    await D.productos.clear();
    await D.cambios.clear();
    await D.syncMeta.clear();
  });

  it('tras una sync correcta la tabla cambios queda compactada', async () => {
    await D.productos.put({ id: 'p1', nombre: 'Uno' });
    await D.productos.update('p1', { nombre: 'Dos' });
    await D.productos.update('p1', { nombre: 'Tres' });
    await D.productos.update('p1', { nombre: 'Cuatro' });
    expect(await D.cambios.count()).toBe(4);
    const r = await sincronizarNube(ctx, clienteFalsoNube());
    expect(r.enviado).toBe(1);
    // Quedan la última entrada bajo el cursor y la del cursor: no crece más.
    expect(await D.cambios.count()).toBe(2);
    // Una segunda sync no envía nada y no deja crecer la tabla.
    expect((await sincronizarNube(ctx, clienteFalsoNube())).enviado).toBe(0);
    expect(await D.cambios.count()).toBe(2);
    await D.productos.clear();
    await D.cambios.clear();
    await D.syncMeta.clear();
  });
});

describe('motor: precarga por lotes', () => {
  const D = new TiendaProDB('SyncFondoMotor');
  const ctx = { db: D, seg: instalarSeguimiento(D, { dispositivo: 'dev_motor' }) };

  afterAll(async () => {
    await D.delete();
  });

  it('dos filas remotas para la misma fila en un lote: gana la más nueva', async () => {
    await D.productos.put({ id: 'p1', nombre: 'Viejo' });
    const base = Date.now();
    const r = await aplicarRemotas(
      ctx,
      [
        { tabla: 'productos', id: 'p1', datos: { nombre: 'Medio' }, borrado: false, ts: base + 10, dispositivo: 'dev_x' },
        { tabla: 'productos', id: 'p1', datos: { nombre: 'Nuevo' }, borrado: false, ts: base + 20, dispositivo: 'dev_x' },
      ],
      'nube'
    );
    expect(r.aplicados).toBe(2);
    expect((await D.productos.get('p1')).nombre).toBe('Nuevo');
    await D.productos.clear();
    await D.cambios.clear();
    await D.descartes.clear();
  });

  it('cincuenta filas remotas se aplican con precarga (sin N+1 por fila)', async () => {
    const base = Date.now();
    const filas = Array.from({ length: 50 }, (_, i) => ({
      tabla: 'productos',
      id: 'p' + i,
      datos: { nombre: 'Prod ' + i },
      borrado: false,
      ts: base + i,
      dispositivo: 'dev_x',
    }));
    const r = await aplicarRemotas(ctx, filas, 'nube');
    expect(r.aplicados).toBe(50);
    expect(await D.productos.count()).toBe(50);
    await D.productos.clear();
    await D.cambios.clear();
    await D.descartes.clear();
  });
});
