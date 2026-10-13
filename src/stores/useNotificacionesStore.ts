/**
 * Store de Notificaciones (Pinia).
 * Responsable único de las notificaciones nativas (web y Capacitor)
 * y de los chequeos periódicos: stock bajo, arqueo pendiente,
 * anomalías críticas, cierre pendiente y fallos de backup.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { n } from '../utils/numero';
import { vib } from '../utils/formato';
import { TOAST } from '../constants';
import { toastMsg } from '../utils/toast';
import { useConfigStore } from './useConfigStore';
import { useProductosStore } from './useProductosStore';
import { useCajaStore } from './useCajaStore';
import { useCierresStore } from './useCierresStore';
import { useInsightsStore } from './useInsightsStore';
import { useTelegramStore } from './useTelegramStore';

export const useNotificacionesStore = defineStore('notificaciones', () => {
  const configStore = useConfigStore();
  const productosStore = useProductosStore();
  const cajaStore = useCajaStore();
  const cierresStore = useCierresStore();

  let _notifTimer: ReturnType<typeof setInterval> | null = null;

  const soportaNotif = computed(() => {
    if (Capacitor.isNativePlatform()) return true;
    return typeof window !== 'undefined' && 'Notification' in window;
  });

  // ===== ENVÍO =====
  async function enviarNotif(titulo, cuerpo) {
    try {
      // NATIVO: usar LocalNotifications
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') return { ok: false, motivo: 'sin-permiso' };
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 100000),
              title: titulo,
              body: cuerpo,
              schedule: { at: new Date(Date.now() + 100) },
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#2196F3',
            },
          ],
        });
        return { ok: true, via: 'native' };
      }

      // WEB: Web Notification API
      if (!('Notification' in window)) return { ok: false, motivo: 'sin-soporte' };
      if (Notification.permission !== 'granted') return { ok: false, motivo: 'sin-permiso' };
      const opts = {
        body: cuerpo,
        icon: '/Tienda-ultima/icons/icon-192.png',
        badge: '/Tienda-ultima/icons/icon-192.png',
        tag: 'tienda-' + Date.now(),
      };
      const conTimeout = (promesa, ms) =>
        Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
      if ('serviceWorker' in navigator) {
        try {
          const reg = await conTimeout(navigator.serviceWorker.ready, 3000);
          if (reg && reg.showNotification) {
            await conTimeout(reg.showNotification(titulo, opts), 3000);
            return { ok: true, via: 'sw' };
          }
        } catch (e) {
          /* fallback */
        }
      }
      try {
        new Notification(titulo, opts);
        return { ok: true, via: 'constructor' };
      } catch (e2) {
        return { ok: false, motivo: 'constructor-bloqueado', error: e2.message };
      }
    } catch (e) {
      console.error('enviarNotif', e);
      return { ok: false, motivo: 'error', error: e.message };
    }
  }

  // ===== PERMISOS =====
  async function pedirPermisoNotif() {
    // NATIVO
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display === 'granted') {
          configStore.cfg.notifActivo = true;
          await configStore.guardarCfg();
          await enviarNotif('Tienda Pro', 'Notificaciones activadas');
          toastMsg('Notificaciones activadas');
        } else {
          configStore.cfg.notifActivo = false;
          await configStore.guardarCfg();
          toastMsg('Permiso denegado', TOAST.BAD);
        }
      } catch (e) {
        toastMsg('Error: ' + e.message, TOAST.BAD);
      }
      return;
    }

    // WEB
    if (!('Notification' in window)) {
      return toastMsg('Este dispositivo no soporta notificaciones', TOAST.WARN);
    }
    if (Notification.permission === 'granted') {
      configStore.cfg.notifActivo = true;
      await configStore.guardarCfg();
      return toastMsg('Notificaciones activadas');
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        configStore.cfg.notifActivo = true;
        await configStore.guardarCfg();
        enviarNotif('Tienda Pro', 'Notificaciones activadas');
        toastMsg('Notificaciones activadas');
      } else {
        toastMsg('Permiso denegado', TOAST.BAD);
      }
    } catch (e) {
      toastMsg('Error: ' + e.message, TOAST.BAD);
    }
  }

  async function desactivarNotif() {
    configStore.cfg.notifActivo = false;
    await configStore.guardarCfg();
    toastMsg('Notificaciones desactivadas');
  }

  async function probarNotif() {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        return toastMsg('Primero activa las notificaciones', TOAST.WARN);
      }
      const r = await enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
      if (r && r.ok) toastMsg('Notificacion enviada (' + r.via + ')');
      else toastMsg('Fallo: ' + (r ? r.motivo : 'error'), TOAST.BAD);
      return;
    }

    if (!('Notification' in window)) {
      return toastMsg('Este dispositivo no soporta notificaciones', TOAST.BAD);
    }
    if (Notification.permission !== 'granted') {
      return toastMsg('Primero activa las notificaciones', TOAST.WARN);
    }
    const r = await enviarNotif('Tienda Pro', 'Esta es una notificacion de prueba');
    if (r && r.ok) {
      toastMsg('Notificacion enviada (' + r.via + ')');
    } else {
      const motivo = r ? r.motivo || 'desconocido' : 'error';
      toastMsg('Fallo: ' + motivo + ' - revisa permisos del navegador', TOAST.BAD);
    }
  }

  // ===== CHEQUEOS PERIÓDICOS =====
  async function chequearNotificaciones() {
    if (!configStore.cfg.notifActivo) return;
    if (!Capacitor.isNativePlatform()) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
    }
    const ahora = new Date();
    const hoy = ahora.toISOString().split('T')[0];
    let cambio = false;

    // 1. Stock bajo
    const bajo = productosStore.productosAgotados.length + productosStore.productosBajoStock.length;
    if (bajo > 0 && configStore.cfg.ultimaNotifStock !== hoy) {
      enviarNotif('Stock bajo', bajo + ' producto(s) en alerta');
      configStore.cfg.ultimaNotifStock = hoy;
      cambio = true;
    }

    // 2. Hora de arqueo
    if (configStore.cfg.horaArqueo) {
      const partes = configStore.cfg.horaArqueo.split(':');
      const hh = parseInt(partes[0]) || 0;
      const mm = parseInt(partes[1]) || 0;
      const horaArq = new Date();
      horaArq.setHours(hh, mm, 0, 0);
      if (ahora >= horaArq) {
        const hayArqueoHoy = cajaStore.arqueos.some((a) => a.fecha && a.fecha.split('T')[0] === hoy);
        if (!hayArqueoHoy && configStore.cfg.ultimaNotifArqueo !== hoy) {
          enviarNotif('Arqueo pendiente', 'No hay arqueo registrado hoy');
          configStore.cfg.ultimaNotifArqueo = hoy;
          cambio = true;
        }
      }
    }

    // 3. Anomalias criticas
    const insights = useInsightsStore();
    const criticas = insights.recomendacionesUrgentes;
    if (criticas > 0 && configStore.cfg.ultimaNotifCriticas !== hoy) {
      enviarNotif('Anomalias criticas', criticas + ' problema(s) urgente(s)');
      configStore.cfg.ultimaNotifCriticas = hoy;
      cambio = true;
    }

    // 4. Cierre pendiente
    const ultimoCierre =
      cierresStore.cierres.length > 0
        ? Math.max(...cierresStore.cierres.map((c) => new Date(c.fechaCierre || c.fecha || '').getTime()))
        : new Date(configStore.cfg.periodoInicio).getTime();
    const dias = Math.floor((ahora.getTime() - ultimoCierre) / 86400000);
    if (dias >= n(configStore.cfg.umbralDiasCierre || 30) && configStore.cfg.ultimaNotifCierre !== hoy) {
      enviarNotif('Cierre pendiente', dias + ' dias sin cerrar periodo');
      configStore.cfg.ultimaNotifCierre = hoy;
      cambio = true;
    }

    // 5. Auto-backup fallando repetidamente
    if (
      configStore.cfg.tgAutoBackup &&
      (configStore.cfg.tgFallosConsecutivos || 0) >= 3 &&
      configStore.cfg.ultimaNotifBackupFail !== hoy
    ) {
      enviarNotif(
        '⚠ Backup fallando',
        'El backup automatico fallo ' + configStore.cfg.tgFallosConsecutivos + ' veces. Revisa Telegram.'
      );
      configStore.cfg.ultimaNotifBackupFail = hoy;
      cambio = true;
    }

    if (cambio) await configStore.guardarCfg();
  }

  // ===== ALERTAS DE AGOTADOS =====
  async function chequearAgotados() {
    try {
      const avisados = new Set(configStore.cfg.productosAvisados || []);
      const nuevosAgotados: import('../types').Producto[] = [];
      const recuperados: import('../types').Producto[] = [];

      productosStore.prodsActivos.forEach((p) => {
        const stockActual = productosStore.stock(p.id);
        const yaAvisado = avisados.has(p.id);

        if (stockActual <= 0 && !yaAvisado) {
          avisados.add(p.id);
          nuevosAgotados.push(p);
        } else if (stockActual > 0 && yaAvisado) {
          avisados.delete(p.id);
          recuperados.push(p);
        }
      });

      if (nuevosAgotados.length === 0 && recuperados.length === 0) return;

      configStore.cfg.productosAvisados = Array.from(avisados);
      await configStore.guardarCfg();

      for (const p of nuevosAgotados) {
        try {
          await notificarAgotado(p);
        } catch (e) {
          console.warn('notificarAgotado fallo', e);
        }
      }

      if (recuperados.length > 0) {
        toastMsg('✅ ' + recuperados.length + ' producto(s) volvieron al stock', TOAST.OK);
      }
    } catch (e) {
      console.error('chequearAgotados', e);
    }
  }

  async function notificarAgotado(prod) {
    const nombre = prod.nombre;

    // 1. Notificacion del sistema (con timeout interno, nunca bloquea)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        await enviarNotif('⚠ Producto agotado', nombre + ' — quedó en 0');
      }
    } catch (e) {}

    // 2. Vibracion
    try {
      vib([200, 100, 200]);
    } catch (e) {}

    // 3. Toast con accion
    try {
      const texto = '⚠️ *AGOTADO:* ' + nombre + '\n\nYa no tenemos disponible este producto. Vuelve pronto.';
      const urlWA = 'https://wa.me/?text=' + encodeURIComponent(texto);
      toastMsg('⚠ ' + nombre + ' se agotó', TOAST.WARN, 'Avisar al grupo', () => {
        window.open(urlWA, '_blank');
      });
    } catch (e) {
      console.warn('chequearAgotados', e);
    }

    // 4. Aviso al bot de Telegram (timeout de 8s)
    try {
      const telegram = useTelegramStore();
      const token = telegram.tgTokenActual();
      const chatId = configStore.cfg.tgChatId;
      if (token && chatId) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 8000);
        try {
          await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '⚠️ *AGOTADO*\n\n' + nombre + '\n\nAvisa al grupo cuando puedas.',
              parse_mode: 'Markdown',
            }),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(to);
        }
      }
    } catch (e) {
      console.warn('notificarAgotado telegram', e);
    }
  }

  // ===== TIMERS =====
  function iniciarChequeos() {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    idle(() => {
      _notifTimer = setInterval(() => chequearNotificaciones(), 5 * 60 * 1000);
    });
    idle(() => chequearNotificaciones());
  }

  function detenerChequeos() {
    if (_notifTimer) clearInterval(_notifTimer);
    _notifTimer = null;
  }

  return {
    soportaNotif,
    enviarNotif,
    pedirPermisoNotif,
    desactivarNotif,
    probarNotif,
    chequearNotificaciones,
    chequearAgotados,
    notificarAgotado,
    iniciarChequeos,
    detenerChequeos,
  };
});
