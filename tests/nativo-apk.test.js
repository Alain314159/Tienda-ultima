/**
 * Tests de las rutas NATIVAS de la app instalada (APK — Android WebView):
 * - enviarNotif via LocalNotifications con ícono de status bar REAL
 * - notificarAgotado sin window.Notification (el WebView no lo define)
 * - cero fetch a api.telegram.org (rama muerta pre-proxy eliminada)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';

const capState = vi.hoisted(() => ({ nativo: false }));
const mockCheckPerms = vi.fn();
const mockRequestPerms = vi.fn();
const mockSchedule = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capState.nativo,
    getPlatform: () => (capState.nativo ? 'android' : 'web'),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: (...a) => mockCheckPerms(...a),
    requestPermissions: (...a) => mockRequestPerms(...a),
    schedule: (...a) => mockSchedule(...a),
  },
}));

import { useNotificacionesStore } from '../src/stores/useNotificacionesStore';

beforeEach(() => {
  setActivePinia(createPinia());
  capState.nativo = false;
  mockCheckPerms.mockReset().mockResolvedValue({ display: 'granted' });
  mockRequestPerms.mockReset().mockResolvedValue({ display: 'granted' });
  mockSchedule.mockReset().mockResolvedValue({ notifications: [{ id: 1 }] });
  // El WebView de Android NO define window.Notification: simularlo así
  // garantiza que el guard de notificarAgotado no dependa de la API web.
  delete globalThis.Notification;
});

describe('enviarNotif en APK instalado', () => {
  it('usa LocalNotifications con el ícono de status bar real (ic_stat_notif)', async () => {
    capState.nativo = true;
    const s = useNotificacionesStore();
    const r = await s.enviarNotif('Titulo', 'Cuerpo');

    expect(r).toEqual({ ok: true, via: 'native' });
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const notif = mockSchedule.mock.calls[0][0].notifications[0];
    expect(notif.title).toBe('Titulo');
    expect(notif.body).toBe('Cuerpo');
    // ic_stat_notif EXISTE en res/drawable/ — el nombre anterior
    // (ic_stat_icon_config_sample) era el ejemplo de la documentación y no
    // existía como recurso.
    expect(notif.smallIcon).toBe('ic_stat_notif');
    expect(notif.iconColor).toBe('#2196F3');
  });

  it('sin permiso concedido no programa nada', async () => {
    capState.nativo = true;
    mockCheckPerms.mockResolvedValue({ display: 'denied' });
    const s = useNotificacionesStore();
    const r = await s.enviarNotif('Titulo', 'Cuerpo');

    expect(r).toEqual({ ok: false, motivo: 'sin-permiso' });
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe('notificarAgotado en APK instalado', () => {
  it('notifica por LocalNotifications aunque NO exista window.Notification', async () => {
    capState.nativo = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    const s = useNotificacionesStore();
    await s.notificarAgotado({ id: 'p1', nombre: 'Leche', precio: 10 });

    // Antes el guard era solo web ('Notification' in window) → en el WebView
    // los agotados JAMÁS notificaban. Ahora llega a LocalNotifications.
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].notifications[0].body).toContain('Leche');

    // La rama muerta de api.telegram.org (bloqueada por CSP + token 'proxy')
    // fue eliminada: no debe salir NINGÚN fetch de este flujo.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('en WEB sin permiso no toca LocalNotifications (no fugas de plataforma)', async () => {
    const s = useNotificacionesStore();
    await s.notificarAgotado({ id: 'p1', nombre: 'Leche', precio: 10 });
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
